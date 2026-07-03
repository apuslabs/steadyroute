import { describe, expect, it } from "vitest";
import { chatToResponsesResponse, completeResponseStream, createResponseStreamState, responsesToChat, responseStreamEventsFromChatChunk } from "../src/protocol.js";

describe("Responses translation", () => {
  it("converts string input to chat messages", () => {
    const chat = responsesToChat({ model: "steadyroute:auto", input: "hello", instructions: "be brief" });
    expect(chat.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" }
    ]);
  });

  it("returns Responses-compatible output_text", () => {
    const response = chatToResponsesResponse({
      id: "chatcmpl_1",
      model: "gpt-test",
      choices: [{ message: { role: "assistant", content: "done" } }],
      usage: { total_tokens: 3 }
    }, "steadyroute:auto");
    expect(response.object).toBe("response");
    expect(response.output_text).toBe("done");
    expect(response.output).toHaveLength(1);
  });

  it("preserves non-streaming chat tool calls in Responses output", () => {
    const response = chatToResponsesResponse({
      id: "chatcmpl_tool",
      model: "gpt-test",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "exec_command", arguments: "{\"cmd\":\"pwd\"}" }
          }]
        },
        finish_reason: "tool_calls"
      }]
    }, "steadyroute:auto");

    expect(response.output_text).toBe("");
    expect(response.output).toEqual([
      {
        id: "fc_call_1",
        type: "function_call",
        status: "completed",
        call_id: "call_1",
        name: "exec_command",
        arguments: "{\"cmd\":\"pwd\"}"
      }
    ]);
  });

  it("converts Responses function-call history back to chat tool messages", () => {
    const chat = responsesToChat({
      model: "steadyroute:auto",
      input: [
        { type: "function_call", call_id: "call_1", name: "exec_command", arguments: "{\"cmd\":\"ls\"}" },
        { type: "function_call_output", call_id: "call_1", output: "README.md" },
        { type: "message", role: "user", content: "continue" }
      ]
    });

    expect(chat.messages).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "exec_command", arguments: "{\"cmd\":\"ls\"}" }
        }]
      },
      { role: "tool", tool_call_id: "call_1", content: "README.md" },
      { role: "user", content: "continue" }
    ]);
  });

  it("wraps malformed Responses function-call history in valid Chat tool arguments", () => {
    const chat = responsesToChat({
      model: "steadyroute:auto",
      input: [
        {
          type: "function_call",
          call_id: "call_bad",
          name: "exec_command",
          arguments: "{\"cmd\":\"cat << 'EOF'\"}}"
        },
        { type: "function_call_output", call_id: "call_bad", output: "failed to parse function arguments" }
      ]
    });

    const toolCall = chat.messages?.[0]?.tool_calls as Array<Record<string, unknown>>;
    const fn = toolCall[0].function as Record<string, unknown>;
    expect(JSON.parse(String(fn.arguments))).toEqual({
      _steadyroute_malformed_arguments: "{\"cmd\":\"cat << 'EOF'\"}}"
    });
  });

  it("normalizes Responses-style function tools to Chat Completions tools", () => {
    const chat = responsesToChat({
      model: "steadyroute:auto",
      input: "inspect",
      tools: [
        {
          type: "function",
          name: "exec_command",
          description: "Runs a command.",
          strict: false,
          parameters: {
            type: "object",
            properties: { cmd: { type: "string" } },
            required: ["cmd"],
            additionalProperties: false
          }
        },
        { type: "web_search", external_web_access: false }
      ],
      tool_choice: { type: "function", name: "exec_command" }
    });

    expect(chat.tools).toEqual([
      {
        type: "function",
        function: {
          name: "exec_command",
          description: "Runs a command.",
          strict: false,
          parameters: {
            type: "object",
            properties: { cmd: { type: "string" } },
            required: ["cmd"],
            additionalProperties: false
          }
        }
      }
    ]);
    expect(chat.tool_choice).toEqual({ type: "function", function: { name: "exec_command" } });
  });

  it("preserves Responses text json_schema format as Chat response_format", () => {
    const chat = responsesToChat({
      model: "steadyroute:auto",
      input: "return json",
      text: {
        format: {
          type: "json_schema",
          name: "launch_item",
          strict: true,
          schema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false
          }
        }
      }
    });

    expect(chat.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "launch_item",
        strict: true,
        schema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false
        }
      }
    });
  });

  it("translates streamed chat tool deltas into Responses function-call events", () => {
    const state = createResponseStreamState();
    const first = responseStreamEventsFromChatChunk({
      id: "chatcmpl_tools",
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "exec_command", arguments: "" } }] }, finish_reason: null }]
    }, state);
    const args = responseStreamEventsFromChatChunk({
      id: "chatcmpl_tools",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{\"cmd\":\"ls\"}" } }] }, finish_reason: null }]
    }, state);
    const done = responseStreamEventsFromChatChunk({
      id: "chatcmpl_tools",
      choices: [{ delta: {}, finish_reason: "tool_calls" }]
    }, state);

    expect(first.map((event) => event.type)).toContain("response.output_item.added");
    expect(args).toContainEqual(expect.objectContaining({ type: "response.function_call_arguments.delta", delta: "{\"cmd\":\"ls\"}" }));
    expect(done).toContainEqual(expect.objectContaining({ type: "response.function_call_arguments.done", arguments: "{\"cmd\":\"ls\"}" }));
    expect(done).toContainEqual(expect.objectContaining({
      type: "response.completed",
      id: "chatcmpl_tools",
      response: expect.objectContaining({ id: "chatcmpl_tools" })
    }));
    expect(completeResponseStream(state)).toEqual([]);
  });

  it("synthesizes one completed event with output when a stream ends without DONE", () => {
    const state = createResponseStreamState();
    responseStreamEventsFromChatChunk({
      id: "chatcmpl_tools",
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "exec_command", arguments: "" } }] }, finish_reason: null }]
    }, state);
    responseStreamEventsFromChatChunk({
      id: "chatcmpl_tools",
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{\"cmd\":\"ls\"}" } }] }, finish_reason: null }]
    }, state);

    const done = completeResponseStream(state);
    expect(done.filter((event) => event.type === "response.completed")).toHaveLength(1);
    expect(done).toContainEqual(expect.objectContaining({ type: "response.function_call_arguments.done", arguments: "{\"cmd\":\"ls\"}" }));
    expect(done.at(-1)).toEqual(expect.objectContaining({
      type: "response.completed",
      response: expect.objectContaining({
        output: [expect.objectContaining({ type: "function_call", arguments: "{\"cmd\":\"ls\"}" })]
      })
    }));
    expect(completeResponseStream(state)).toEqual([]);
  });

  it("includes completed streamed text in Responses output items", () => {
    const state = createResponseStreamState();
    responseStreamEventsFromChatChunk({
      id: "chatcmpl_text",
      choices: [{ delta: { content: "done" }, finish_reason: null }]
    }, state);
    const done = responseStreamEventsFromChatChunk({
      id: "chatcmpl_text",
      choices: [{ delta: {}, finish_reason: "stop" }]
    }, state);

    expect(done).toContainEqual(expect.objectContaining({
      type: "response.output_item.done",
      item: expect.objectContaining({
        content: [{ type: "output_text", text: "done" }]
      })
    }));
    expect(done).toContainEqual(expect.objectContaining({
      type: "response.completed",
      response: expect.objectContaining({
        output: [expect.objectContaining({ content: [{ type: "output_text", text: "done" }] })]
      })
    }));
  });
});

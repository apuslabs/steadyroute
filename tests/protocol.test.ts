import { describe, expect, it } from "vitest";
import { chatToResponsesResponse, createResponseStreamState, responsesToChat, responseStreamEventsFromChatChunk } from "../src/protocol.js";

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
    expect(done).toContainEqual(expect.objectContaining({ type: "response.completed" }));
  });
});

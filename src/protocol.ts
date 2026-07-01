import type { ChatRequestBody } from "./types.js";

export interface ResponseStreamState {
  sequence: number;
  responseId: string | null;
  textItemStarted: boolean;
  textDone: boolean;
  toolCalls: Map<number, ResponseToolCallState>;
}

interface ResponseToolCallState {
  outputIndex: number;
  itemId: string;
  callId: string;
  name: string;
  arguments: string;
  added: boolean;
  done: boolean;
}

export function responsesToChat(body: Record<string, unknown>): ChatRequestBody {
  const input = body.input;
  const messages: Array<Record<string, unknown>> = [];
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (obj.type === "message" && typeof obj.role === "string") {
        const content = normalizeResponsesContent(obj.content);
        messages.push({ role: obj.role, content });
      } else if (obj.type === "function_call") {
        const callId = String(obj.call_id ?? obj.id ?? `call_${messages.length}`);
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: callId,
            type: "function",
            function: {
              name: typeof obj.name === "string" ? obj.name : "tool",
              arguments: typeof obj.arguments === "string" ? obj.arguments : JSON.stringify(obj.arguments ?? {})
            }
          }]
        });
      } else if (typeof obj.role === "string" && "content" in obj) {
        messages.push({ role: obj.role, content: normalizeResponsesContent(obj.content) });
      } else if (obj.type === "function_call_output") {
        messages.push({ role: "tool", tool_call_id: obj.call_id ?? obj.id, content: String(obj.output ?? "") });
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: JSON.stringify(input ?? "") });
  }

  const chat: ChatRequestBody = {
    ...body,
    model: typeof body.model === "string" ? body.model : "steadyroute:auto",
    messages,
    stream: body.stream === true
  };
  delete chat.input;
  delete chat.instructions;
  if (typeof body.instructions === "string") {
    chat.messages = [{ role: "system", content: body.instructions }, ...messages];
  }
  if (typeof body.max_output_tokens === "number" && typeof chat.max_tokens !== "number") {
    chat.max_tokens = body.max_output_tokens;
  }
  return chat;
}

export function chatToResponsesResponse(chat: Record<string, unknown>, requestModel: string): Record<string, unknown> {
  const choices = Array.isArray(chat.choices) ? chat.choices as Array<Record<string, unknown>> : [];
  const first = choices[0] ?? {};
  const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  const content = typeof message.content === "string" ? message.content : "";
  const id = typeof chat.id === "string" ? chat.id : `resp_${Date.now()}`;
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: typeof chat.model === "string" ? chat.model : requestModel,
    output: [
      {
        id: `msg_${id}`,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: content }]
      }
    ],
    output_text: content,
    usage: chat.usage ?? null,
    steadyroute: chat.steadyroute
  };
}

export function responseStreamEventFromChatChunk(chunk: Record<string, unknown>, sequence: number): Record<string, unknown>[] {
  const state = createResponseStreamState();
  state.sequence = sequence;
  return responseStreamEventsFromChatChunk(chunk, state);
}

export function createResponseStreamState(): ResponseStreamState {
  return {
    sequence: 0,
    responseId: null,
    textItemStarted: false,
    textDone: false,
    toolCalls: new Map()
  };
}

export function responseStreamEventsFromChatChunk(chunk: Record<string, unknown>, state: ResponseStreamState): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  state.responseId ??= typeof chunk.id === "string" ? chunk.id : `resp_${Date.now()}`;
  if (state.sequence === 0) {
    events.push({ type: "response.created", response: { id: state.responseId, object: "response", status: "in_progress", output: [] } });
  }
  const choices = Array.isArray(chunk.choices) ? chunk.choices as Array<Record<string, unknown>> : [];
  const delta = choices[0]?.delta && typeof choices[0]?.delta === "object" ? choices[0]?.delta as Record<string, unknown> : {};
  if (typeof delta.content === "string" && delta.content.length > 0) {
    if (!state.textItemStarted) {
      state.textItemStarted = true;
      events.push({ type: "response.output_item.added", output_index: 0, item: { type: "message", role: "assistant", content: [] } });
      events.push({ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "" } });
    }
    events.push({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: delta.content });
  }
  for (const event of toolCallEventsFromDelta(delta, state)) events.push(event);
  const finish = choices[0]?.finish_reason;
  if (finish) {
    if (state.textItemStarted && !state.textDone) {
      state.textDone = true;
      events.push({ type: "response.output_text.done", output_index: 0, content_index: 0 });
      events.push({ type: "response.output_item.done", output_index: 0, item: { type: "message", status: "completed", role: "assistant", content: [] } });
    }
    for (const tool of state.toolCalls.values()) {
      if (tool.done) continue;
      tool.done = true;
      events.push({ type: "response.function_call_arguments.done", output_index: tool.outputIndex, item_id: tool.itemId, arguments: tool.arguments });
      events.push({ type: "response.output_item.done", output_index: tool.outputIndex, item: toolItem(tool, "completed") });
    }
    events.push({ type: "response.completed", response: { id: state.responseId, object: "response", status: "completed", output: responseOutput(state) } });
  }
  state.sequence += 1;
  return events;
}

export function promptTextFromChat(body: ChatRequestBody): string {
  return JSON.stringify({ messages: body.messages ?? [], input: body.input ?? null });
}

function normalizeResponsesContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (typeof p.text === "string") return { type: "text", text: p.text };
        if (typeof p.input_text === "string") return { type: "text", text: p.input_text };
      }
      return part;
    });
  }
  return content;
}

function toolCallEventsFromDelta(delta: Record<string, unknown>, state: ResponseStreamState): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls as Array<Record<string, unknown>> : [];
  for (const call of toolCalls) {
    const index = typeof call.index === "number" ? call.index : state.toolCalls.size;
    let tool = state.toolCalls.get(index);
    const fn = call.function && typeof call.function === "object" ? call.function as Record<string, unknown> : {};
    if (!tool) {
      const outputIndex = (state.textItemStarted ? 1 : 0) + state.toolCalls.size;
      const callId = typeof call.id === "string" ? call.id : `call_${index}_${Date.now()}`;
      tool = {
        outputIndex,
        itemId: `fc_${callId}`,
        callId,
        name: typeof fn.name === "string" ? fn.name : "tool",
        arguments: "",
        added: false,
        done: false
      };
      state.toolCalls.set(index, tool);
    }
    if (typeof fn.name === "string") tool.name = fn.name;
    if (!tool.added) {
      tool.added = true;
      events.push({ type: "response.output_item.added", output_index: tool.outputIndex, item: toolItem(tool, "in_progress") });
    }
    if (typeof fn.arguments === "string" && fn.arguments.length > 0) {
      tool.arguments += fn.arguments;
      events.push({ type: "response.function_call_arguments.delta", output_index: tool.outputIndex, item_id: tool.itemId, delta: fn.arguments });
    }
  }
  return events;
}

function toolItem(tool: ResponseToolCallState, status: "in_progress" | "completed"): Record<string, unknown> {
  return {
    id: tool.itemId,
    type: "function_call",
    status,
    call_id: tool.callId,
    name: tool.name,
    arguments: tool.arguments
  };
}

function responseOutput(state: ResponseStreamState): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  if (state.textItemStarted) {
    output.push({ type: "message", status: "completed", role: "assistant", content: [] });
  }
  for (const tool of state.toolCalls.values()) output.push(toolItem(tool, tool.done ? "completed" : "in_progress"));
  return output;
}

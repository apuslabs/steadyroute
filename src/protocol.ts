import type { ChatRequestBody } from "./types.js";

export interface ResponseStreamState {
  sequence: number;
  responseId: string | null;
  created: boolean;
  completed: boolean;
  textItemStarted: boolean;
  textDone: boolean;
  text: string;
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
              arguments: normalizeToolArguments(obj.arguments)
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
    stream: body.stream === true,
    tools: normalizeResponsesTools(body.tools),
    tool_choice: normalizeResponsesToolChoice(body.tool_choice)
  };
  delete chat.input;
  delete chat.instructions;
  if (typeof body.instructions === "string") {
    chat.messages = [{ role: "system", content: body.instructions }, ...messages];
  }
  if (typeof body.max_output_tokens === "number" && typeof chat.max_tokens !== "number") {
    chat.max_tokens = body.max_output_tokens;
  }
  if (!chat.tools) delete chat.tools;
  if (!chat.tool_choice) delete chat.tool_choice;
  return chat;
}

export function chatToResponsesResponse(chat: Record<string, unknown>, requestModel: string): Record<string, unknown> {
  const choices = Array.isArray(chat.choices) ? chat.choices as Array<Record<string, unknown>> : [];
  const first = choices[0] ?? {};
  const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  const content = typeof message.content === "string" ? message.content : "";
  const id = typeof chat.id === "string" ? chat.id : `resp_${Date.now()}`;
  const output: Array<Record<string, unknown>> = [];
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls as Array<Record<string, unknown>> : [];
  if (content.length > 0 || toolCalls.length === 0) {
    output.push({
      id: `msg_${id}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: content }]
    });
  }
  for (const [index, call] of toolCalls.entries()) {
    output.push(chatToolCallToResponseItem(call, index));
  }
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: typeof chat.model === "string" ? chat.model : requestModel,
    output,
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
    created: false,
    completed: false,
    textItemStarted: false,
    textDone: false,
    text: "",
    toolCalls: new Map()
  };
}

export function responseStreamEventsFromChatChunk(chunk: Record<string, unknown>, state: ResponseStreamState): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  state.responseId ??= typeof chunk.id === "string" ? chunk.id : `resp_${Date.now()}`;
  if (!state.created) {
    state.created = true;
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
    state.text += delta.content;
    events.push({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: delta.content });
  }
  for (const event of toolCallEventsFromDelta(delta, state)) events.push(event);
  const finish = choices[0]?.finish_reason;
  if (finish) {
    events.push(...completeResponseStream(state));
  }
  state.sequence += 1;
  return events;
}

export function completeResponseStream(state: ResponseStreamState, responseId?: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  if (state.completed) return events;
  state.responseId ??= responseId ?? `resp_${Date.now()}`;
  if (!state.created) {
    state.created = true;
    events.push({ type: "response.created", response: { id: state.responseId, object: "response", status: "in_progress", output: [] } });
  }
  if (state.textItemStarted && !state.textDone) {
    state.textDone = true;
    events.push({ type: "response.output_text.done", output_index: 0, content_index: 0 });
    events.push({ type: "response.output_item.done", output_index: 0, item: messageItem(state.text) });
  }
  for (const tool of state.toolCalls.values()) {
    if (tool.done) continue;
    tool.done = true;
    events.push({ type: "response.function_call_arguments.done", output_index: tool.outputIndex, item_id: tool.itemId, arguments: tool.arguments });
    events.push({ type: "response.output_item.done", output_index: tool.outputIndex, item: toolItem(tool, "completed") });
  }
  state.completed = true;
  events.push(responseCompletedEvent(state.responseId, responseOutput(state)));
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

function normalizeResponsesTools(tools: unknown): unknown {
  if (!Array.isArray(tools)) return tools;
  const normalized: Record<string, unknown>[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const obj = tool as Record<string, unknown>;
    if (obj.type !== "function") continue;
    if (obj.function && typeof obj.function === "object") {
      normalized.push(obj);
      continue;
    }
    if (typeof obj.name !== "string" || obj.name.length === 0) continue;
    const fn: Record<string, unknown> = {
      name: obj.name,
      parameters: obj.parameters && typeof obj.parameters === "object" ? obj.parameters : { type: "object", properties: {} }
    };
    if (typeof obj.description === "string") fn.description = obj.description;
    if (typeof obj.strict === "boolean") fn.strict = obj.strict;
    normalized.push({ type: "function", function: fn });
  }
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeResponsesToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") return toolChoice;
  const obj = toolChoice as Record<string, unknown>;
  if (obj.type !== "function") return toolChoice;
  if (obj.function && typeof obj.function === "object") return toolChoice;
  if (typeof obj.name !== "string" || obj.name.length === 0) return toolChoice;
  return { type: "function", function: { name: obj.name } };
}

function normalizeToolArguments(args: unknown): string {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return args;
    } catch {
      // Fall through to wrap malformed tool history in a provider-acceptable object.
    }
    return JSON.stringify({ _steadyroute_malformed_arguments: args });
  }
  if (args && typeof args === "object" && !Array.isArray(args)) return JSON.stringify(args);
  return JSON.stringify({});
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

function chatToolCallToResponseItem(call: Record<string, unknown>, index: number): Record<string, unknown> {
  const fn = call.function && typeof call.function === "object" ? call.function as Record<string, unknown> : {};
  const callId = typeof call.id === "string" && call.id.length > 0 ? call.id : `call_${index}`;
  return {
    id: `fc_${callId}`,
    type: "function_call",
    status: "completed",
    call_id: callId,
    name: typeof fn.name === "string" && fn.name.length > 0 ? fn.name : "tool",
    arguments: normalizeToolArguments(fn.arguments)
  };
}

function responseOutput(state: ResponseStreamState): Array<Record<string, unknown>> {
  const output: Array<Record<string, unknown>> = [];
  if (state.textItemStarted) {
    output.push(messageItem(state.text));
  }
  for (const tool of state.toolCalls.values()) output.push(toolItem(tool, tool.done ? "completed" : "in_progress"));
  return output;
}

function messageItem(text: string): Record<string, unknown> {
  return {
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text }]
  };
}

export function responseCompletedEvent(responseId: string, output: Array<Record<string, unknown>> = []): Record<string, unknown> {
  return {
    type: "response.completed",
    id: responseId,
    response: {
      id: responseId,
      object: "response",
      status: "completed",
      output
    }
  };
}

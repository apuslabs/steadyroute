import type { ChatRequestBody } from "./types.js";

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
  const events: Record<string, unknown>[] = [];
  if (sequence === 0) {
    events.push({ type: "response.created", response: { id: chunk.id ?? `resp_${Date.now()}`, status: "in_progress" } });
    events.push({ type: "response.output_item.added", output_index: 0, item: { type: "message", role: "assistant", content: [] } });
    events.push({ type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "" } });
  }
  const choices = Array.isArray(chunk.choices) ? chunk.choices as Array<Record<string, unknown>> : [];
  const delta = choices[0]?.delta && typeof choices[0]?.delta === "object" ? choices[0]?.delta as Record<string, unknown> : {};
  if (typeof delta.content === "string" && delta.content.length > 0) {
    events.push({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: delta.content });
  }
  const finish = choices[0]?.finish_reason;
  if (finish) {
    events.push({ type: "response.output_text.done", output_index: 0, content_index: 0 });
    events.push({ type: "response.completed", response: { id: chunk.id ?? `resp_${Date.now()}`, status: "completed" } });
  }
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

import { describe, expect, it } from "vitest";
import { chatToResponsesResponse, responsesToChat } from "../src/protocol.js";

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
});

import { describe, expect, it } from "vitest";
import { createRequestId } from "../src/requestIds.js";

describe("request id generation", () => {
  it("generates CLI-safe ids that do not start with a dash", () => {
    for (let index = 0; index < 500; index += 1) {
      const requestId = createRequestId();
      expect(requestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{17}$/);
      expect(requestId.startsWith("-")).toBe(false);
    }
  });
});

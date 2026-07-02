import { describe, expect, it } from "vitest";
import { behaviorFor, classifyProviderFailure } from "../src/errors.js";

describe("error taxonomy", () => {
  it("classifies auth, quota, schema, and provider failures distinctly", () => {
    expect(classifyProviderFailure(401, "User not found")).toBe("auth_failed");
    expect(classifyProviderFailure(402, "Payment required")).toBe("billing_required");
    expect(classifyProviderFailure(429, "RESOURCE_EXHAUSTED free_tier_requests")).toBe("quota_exhausted");
    expect(classifyProviderFailure(429, "rate limit")).toBe("rate_limited");
    expect(classifyProviderFailure(400, "JSON schema rejected for tool")).toBe("schema_rejected");
    expect(classifyProviderFailure(503, "overloaded")).toBe("provider_down");
  });

  it("classifies terminated provider connections as network errors", () => {
    expect(classifyProviderFailure(null, "", new Error("terminated"))).toBe("network_error");
    expect(classifyProviderFailure(null, "UND_ERR_SOCKET other side closed")).toBe("network_error");
  });

  it("marks request_invalid and schema_rejected as non-fallbackable", () => {
    expect(behaviorFor("request_invalid").fallbackable).toBe(false);
    expect(behaviorFor("schema_rejected").fallbackable).toBe(false);
    expect(behaviorFor("rate_limited").fallbackable).toBe(true);
  });
});

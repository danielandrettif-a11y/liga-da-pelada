import { describe, it, expect } from "vitest";
import { validateServerEvent } from "./operations.js";

describe("Operations Domain", () => {
  it("validates server events correctly", () => {
    expect(validateServerEvent({ kind: "invalid" as any, name: "err" }).valid).toBe(false);
    expect(validateServerEvent({ kind: "web_vital", name: "UNKNOWN" }).valid).toBe(false);
    expect(validateServerEvent({ kind: "web_vital", name: "LCP" }).valid).toBe(true);
    expect(validateServerEvent({ kind: "client_action", name: "register_goal" }).valid).toBe(true);
    expect(validateServerEvent({ kind: "client_error", name: "unhandled_promise" }).valid).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { signProxyAuthUser, verifyProxyAuthUser } from "./proxy-auth-header";

const ORIGINAL_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORIGINAL_TIMER_SECRET = process.env.MATCH_TIMER_WEBHOOK_SECRET;
const ORIGINAL_UNSUB_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;

afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_KEY;
  process.env.MATCH_TIMER_WEBHOOK_SECRET = ORIGINAL_TIMER_SECRET;
  process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL_UNSUB_SECRET;
});

describe("proxy-auth-header", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("signs and verifies a valid proxy user within TTL", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    let now = 1_000_000;
    const token = signProxyAuthUser(
      { id: userId, email: "daniel@example.com", user_metadata: { name: "Daniel" } },
      () => now,
    );
    expect(token).toBeTruthy();
    const verified = verifyProxyAuthUser(token, () => now + 5_000);
    expect(verified).toEqual({
      id: userId,
      email: "daniel@example.com",
      user_metadata: { name: "Daniel" },
    });
  });

  it("rejects tampered payloads and expired tokens", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    let now = 1_000_000;
    const token = signProxyAuthUser({ id: userId, email: "daniel@example.com" }, () => now)!;
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", exp: now + 10_000 })).toString("base64url");
    expect(verifyProxyAuthUser(`${forgedPayload}.${sig}`, () => now)).toBeNull();
    expect(verifyProxyAuthUser(token, () => now + 20_000)).toBeNull();
  });

  it("returns null when no server secret is configured", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.MATCH_TIMER_WEBHOOK_SECRET;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(signProxyAuthUser({ id: userId })).toBeNull();
    expect(verifyProxyAuthUser("abc.def")).toBeNull();
  });
});

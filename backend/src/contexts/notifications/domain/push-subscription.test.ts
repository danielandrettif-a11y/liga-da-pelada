import { describe, expect, it } from "vitest";
import {
  InvalidPushSubscriptionError,
  validatePushSubscription,
} from "./push-subscription.js";

describe("push-subscription domain invariants", () => {
  it("validates a valid push subscription", () => {
    const valid = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc123",
      expirationTime: null,
      keys: {
        p256dh: "key-p256dh",
        auth: "key-auth",
      },
      userAgent: "Mozilla/5.0",
    };

    const validated = validatePushSubscription(valid);
    expect(validated.endpoint).toBe(valid.endpoint);
    expect(validated.keys.p256dh).toBe("key-p256dh");
    expect(validated.keys.auth).toBe("key-auth");
  });

  it("throws InvalidPushSubscriptionError on non-https endpoint", () => {
    expect(() =>
      validatePushSubscription({
        endpoint: "http://updates.push.services.mozilla.com",
        expirationTime: null,
        keys: { p256dh: "p256dh", auth: "auth" },
      }),
    ).toThrow(InvalidPushSubscriptionError);
  });

  it("throws InvalidPushSubscriptionError when keys are missing", () => {
    expect(() =>
      validatePushSubscription({
        endpoint: "https://updates.push.services.mozilla.com",
        expirationTime: null,
        keys: { p256dh: "", auth: "auth" },
      }),
    ).toThrow(InvalidPushSubscriptionError);
  });
});


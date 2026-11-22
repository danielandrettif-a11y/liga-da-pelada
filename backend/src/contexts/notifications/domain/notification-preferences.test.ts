import { describe, expect, it } from "vitest";
import { validateUpdatePreferencesInput } from "./notification-preferences.js";

describe("notification-preferences domain invariants", () => {
  it("normalizes boolean values for notification preferences update", () => {
    const validated = validateUpdatePreferencesInput({
      matchPushEnabled: true,
      callupPushEnabled: false,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: false,
      collectivePushEnabled: true,
    });

    expect(validated).toEqual({
      matchPushEnabled: true,
      callupPushEnabled: false,
      cartolaPushEnabled: true,
      cartolaEmailEnabled: false,
      collectivePushEnabled: true,
    });
  });
});


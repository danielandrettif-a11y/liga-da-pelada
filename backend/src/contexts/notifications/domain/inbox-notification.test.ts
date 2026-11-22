import { describe, expect, it } from "vitest";
import {
  InvalidNotificationError,
  validateDesiredNotification,
  validateNotificationHref,
} from "./inbox-notification.js";

describe("inbox-notification domain invariants", () => {
  it("normalizes and validates valid desired notifications", () => {
    const validated = validateDesiredNotification({
      type: "announcement",
      key: "announcement:123",
      title: "  Novo Comunicado  ",
      body: "  Aviso importante  ",
      href: "cartola",
    });

    expect(validated).toEqual({
      type: "announcement",
      key: "announcement:123",
      title: "Novo Comunicado",
      body: "Aviso importante",
      href: "/cartola",
    });
  });

  it("throws InvalidNotificationError when title is empty", () => {
    expect(() =>
      validateDesiredNotification({
        type: "announcement",
        key: "announcement:123",
        title: "   ",
        body: "Corpo válido",
        href: "/cartola",
      }),
    ).toThrow(InvalidNotificationError);
  });

  it("throws InvalidNotificationError when key is missing", () => {
    expect(() =>
      validateDesiredNotification({
        type: "announcement",
        key: "",
        title: "Título",
        body: "Corpo",
        href: "/cartola",
      }),
    ).toThrow(InvalidNotificationError);
  });

  it("validates and normalizes href correctly", () => {
    expect(validateNotificationHref("")).toBe("/");
    expect(validateNotificationHref("notificacoes")).toBe("/notificacoes");
    expect(validateNotificationHref("/rodadas/123")).toBe("/rodadas/123");
    expect(validateNotificationHref("https://exemplo.com")).toBe("https://exemplo.com");
  });
});


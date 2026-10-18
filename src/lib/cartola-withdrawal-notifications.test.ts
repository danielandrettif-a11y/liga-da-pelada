import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushNotificationsToUsers } from "@/lib/push-notifications";
import { notifyCallupAdminsAboutWithdrawal } from "./cartola-withdrawal-notifications";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/push-notifications", () => ({
  sendPushNotificationsToUsers: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }),
}));

function query(single: unknown, rows: unknown[] = []) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: single, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return builder;
}

function client() {
  const tables = {
    callups: query({ league_id: "league-1" }),
    players: query({ name: "João" }),
    league_members: query(null, [
      { user_id: "admin-enabled" },
      { user_id: "admin-disabled" },
      { user_id: "admin-actor" },
      { user_id: "admin-player" },
    ]),
    account_profiles: query({ user_id: "admin-player" }),
    user_notification_preferences: query(null, [
      { user_id: "admin-disabled", callup_push_enabled: false },
    ]),
  };
  return {
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-actor" } } }),
    },
    tables,
  };
}

describe("notificações de saída da convocação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServiceClient).mockReturnValue(null);
  });

  it("avisa somente ADMs habilitados e exclui quem saiu e quem realizou a ação", async () => {
    const db = client();

    await notifyCallupAdminsAboutWithdrawal(db as any, "callup-1", "player-1");

    expect(db.tables.league_members.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.tables.league_members.eq).toHaveBeenCalledWith("role", "admin");
    expect(db.tables.league_members.eq).toHaveBeenCalledWith("is_active", true);
    expect(sendPushNotificationsToUsers).toHaveBeenCalledWith(
      db,
      ["admin-enabled"],
      expect.objectContaining({
        title: "Saída da convocação",
        body: "João saiu da convocação. Confira a lista atualizada.",
        url: "/convocacao?callup=callup-1",
      }),
      "/convocacao",
    );
  });

  it("não tenta enviar push quando não há outro ADM para avisar", async () => {
    const db = client();
    db.tables.league_members.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: [{ user_id: "admin-actor" }, { user_id: "admin-player" }],
      error: null,
    }).then(resolve);

    expect(await notifyCallupAdminsAboutWithdrawal(db as any, "callup-1", "player-1"))
      .toEqual({ sent: 0 });
    expect(sendPushNotificationsToUsers).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { httpGoalGateway } from "./http-goal-gateway";

const input = {
  match_id: "00000000-0000-4000-8000-000000000001",
  player_id: "00000000-0000-4000-8000-000000000002",
  team_id: "00000000-0000-4000-8000-000000000003",
  assist_player_id: "00000000-0000-4000-8000-000000000004",
  minute: 7,
  idempotency_key: "goal-1",
  is_own_goal: false,
};

describe("httpGoalGateway", () => {
  it("forwards the stable command and verified session token to the internal API", async () => {
    const receipt = {
      event_id: "event-1", round_id: "round-1", score_a: 1, score_b: 0, idempotent: false,
    };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt), { status: 200 }));
    const gateway = httpGoalGateway("http://backend:3001/", "verified-token", request as typeof fetch);

    await expect(gateway.saveGoal(input)).resolves.toEqual(receipt);
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`http://backend:3001/api/matches/${input.match_id}/goals`);
    expect(options.headers).toMatchObject({ authorization: "Bearer verified-token" });
    expect(JSON.parse(String(options.body))).toEqual({
      player_id: input.player_id, team_id: input.team_id,
      assist_player_id: input.assist_player_id, minute: 7,
      idempotency_key: "goal-1", is_own_goal: false,
    });
    expect(options.cache).toBe("no-store");
  });

  it("classifies a payload conflict as definitive", async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Chave do lance reutilizada com outro conteúdo." }),
      { status: 409 },
    ));
    const gateway = httpGoalGateway("http://backend:3001", "token", request as typeof fetch);
    await expect(gateway.saveGoal(input)).rejects.toMatchObject({
      uncertain: false, message: "Chave do lance reutilizada com outro conteúdo.",
    });
  });

  it("keeps the same idempotency key pending when transport or response is uncertain", async () => {
    const request = vi.fn().mockRejectedValue(new Error("connection reset"));
    const gateway = httpGoalGateway("http://backend:3001", "token", request as typeof fetch);
    await expect(gateway.saveGoal(input)).rejects.toMatchObject({ uncertain: true });

    request.mockResolvedValueOnce(new Response("{broken", { status: 200 }));
    await expect(gateway.saveGoal(input)).rejects.toMatchObject({ uncertain: true });
  });
});

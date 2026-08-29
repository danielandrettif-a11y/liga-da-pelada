import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { SITE_URL } from "@/lib/siteUrl";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushNotificationsToUsers } from "@/lib/push-notifications";
import { roundStartIso, type CartolaReminderJob, type CartolaReminderMilestone } from "@/lib/cartola-reminder-scheduler";

type DeliveryChannel = "push" | "email";

function env(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = raw.startsWith(`${name}=`) ? raw.slice(name.length + 1).trim() : raw;
  return value.replace(/^['"]|['"]$/g, "").trim();
}

function milestoneLabel(milestone: CartolaReminderMilestone) {
  return milestone === "opening" ? "O mercado abriu" : milestone === "24h" ? "Falta 1 dia" : milestone === "12h" ? "Faltam 12 horas" : "Falta 1 hora";
}

function unsubscribeSignature(userId: string) {
  const secret = env("EMAIL_UNSUBSCRIBE_SECRET");
  if (!secret) return null;
  return createHmac("sha256", secret).update(`cartola-email:${userId}`).digest("base64url");
}

export function verifyCartolaUnsubscribeToken(userId: string, token: string) {
  const expected = unsubscribeSignature(userId);
  if (!expected) return false;
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function emailHtml(input: { name: string; roundNumber: number; date: string; startTime: string; milestone: CartolaReminderMilestone; unsubscribeUrl: string }) {
  const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" }).format(new Date(`${input.date}T12:00:00-03:00`));
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#03140c;color:#f4f7f5;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #294b36;border-radius:24px;padding:28px;background:#082116"><p style="margin:0 0 8px;color:#c7ff00;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${milestoneLabel(input.milestone)}</p><h1 style="margin:0 0 14px;font-size:26px">Escala seu time, ${input.name}!</h1><p style="color:#a8baaf;line-height:1.6">A Rodada ${String(input.roundNumber).padStart(2, "0")} acontece ${when}, às ${input.startTime.slice(0, 5)}. Sua escalação ainda está incompleta.</p><a href="${SITE_URL}/cartola" style="display:inline-block;margin-top:14px;padding:14px 22px;border-radius:14px;background:#c7ff00;color:#07150d;text-decoration:none;font-weight:800">Escalar meu time</a></div><p style="margin:20px 8px 0;color:#718178;font-size:11px;line-height:1.5">Não quer mais receber estes lembretes por e-mail? <a href="${input.unsubscribeUrl}" style="color:#a8baaf">Cancelar lembretes do Cartola</a>.</p></div></body></html>`;
}

async function sendReminderEmail(input: { userId: string; email: string; name: string; roundId: string; roundNumber: number; date: string; startTime: string; milestone: CartolaReminderMilestone }) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("RESEND_FROM_EMAIL");
  const signature = unsubscribeSignature(input.userId);
  if (!apiKey || !from || !signature) throw new Error("Resend ou cancelamento de e-mail não configurado.");
  const unsubscribeUrl = `${SITE_URL}/mais/notificacoes/cancelar?userId=${encodeURIComponent(input.userId)}&token=${encodeURIComponent(signature)}`;
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [input.email],
    subject: `${milestoneLabel(input.milestone)}: escale seu time no Cartola`,
    html: emailHtml({ ...input, unsubscribeUrl }),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
  }, { idempotencyKey: `cartola-${input.roundId}-${input.userId}-${input.milestone}` });
  if (error) throw new Error(error.message);
  return data?.id || null;
}

async function allAuthUsers() {
  const service = createServiceClient();
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function saveDelivery(input: { leagueId: string; roundId: string; userId: string; milestone: CartolaReminderMilestone; channel: DeliveryChannel; status: "pending" | "delivered" | "failed" | "skipped"; providerMessageId?: string | null; error?: string | null }) {
  const service = createServiceClient();
  if (!service) throw new Error("Cliente administrativo indisponível.");
  await service.from("cartola_reminder_deliveries").upsert({
    league_id: input.leagueId,
    round_id: input.roundId,
    user_id: input.userId,
    milestone: input.milestone,
    channel: input.channel,
    status: input.status,
    provider_message_id: input.providerMessageId || null,
    error_message: input.error?.slice(0, 500) || null,
    delivered_at: input.status === "delivered" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "round_id,user_id,milestone,channel" });
}

async function claimDelivery(input: { leagueId: string; roundId: string; userId: string; milestone: CartolaReminderMilestone; channel: DeliveryChannel }) {
  const service = createServiceClient();
  if (!service) throw new Error("Cliente administrativo indisponível.");
  const { error } = await service.from("cartola_reminder_deliveries").insert({
    league_id: input.leagueId,
    round_id: input.roundId,
    user_id: input.userId,
    milestone: input.milestone,
    channel: input.channel,
    status: "pending",
  });
  if (!error) return true;
  if (error.code !== "23505") throw error;
  const { data: existing } = await service.from("cartola_reminder_deliveries").select("id, status, updated_at").eq("round_id", input.roundId).eq("user_id", input.userId).eq("milestone", input.milestone).eq("channel", input.channel).maybeSingle();
  const stalePending = existing?.status === "pending" && Date.now() - new Date(existing.updated_at).getTime() > 10 * 60 * 1000;
  if (existing && (existing.status === "failed" || stalePending)) {
    let reclaimQuery = service.from("cartola_reminder_deliveries").update({ status: "pending", error_message: null, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("status", existing.status);
    if (stalePending) reclaimQuery = reclaimQuery.lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const { data: reclaimed } = await reclaimQuery.select("id").maybeSingle();
    return Boolean(reclaimed);
  }
  return false;
}

export async function dispatchCartolaReminder(job: CartolaReminderJob) {
  const service = createServiceClient();
  if (!service) throw new Error("Cliente administrativo indisponível.");
  const { data: round, error: roundError } = await service
    .from("rounds")
    .select("id, league_id, number, date, start_time, status, round_type, league:league_id(players_per_team, cartola_reminders_enabled), fantasy_rounds(id, market_status)")
    .eq("id", job.roundId)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round || round.round_type !== "official") return { skipped: "round" };
  const league = Array.isArray(round.league) ? round.league[0] : round.league;
  const fantasyRound = Array.isArray(round.fantasy_rounds) ? round.fantasy_rounds[0] : round.fantasy_rounds;
  if (!league?.cartola_reminders_enabled || fantasyRound?.market_status !== "open" || round.status === "finished") return { skipped: "disabled" };
  const currentStartAt = roundStartIso(round.date, round.start_time || "08:00");
  if (currentStartAt !== job.roundStartAt) return { skipped: "rescheduled" };

  const { data: members, error: membersError } = await service
    .from("league_members")
    .select("player_id, player:player_id(is_selectable, member_category, name)")
    .eq("league_id", round.league_id)
    .eq("is_active", true);
  if (membersError) throw membersError;
  const eligiblePlayers = (members || []).filter((member: any) => {
    const player = Array.isArray(member.player) ? member.player[0] : member.player;
    return player?.is_selectable === true && player.member_category === "player";
  });
  if (!eligiblePlayers.length) return { sent: 0 };
  const playerIds = eligiblePlayers.map((item) => item.player_id);
  const playerName = new Map(eligiblePlayers.map((item: any) => {
    const player = Array.isArray(item.player) ? item.player[0] : item.player;
    return [item.player_id, player?.name || "Jogador"];
  }));
  const { data: profiles, error: profilesError } = await service.from("account_profiles").select("user_id, player_id").in("player_id", playerIds);
  if (profilesError) throw profilesError;
  const userIds = (profiles || []).map((profile) => profile.user_id);
  if (!userIds.length) return { sent: 0 };

  const [{ data: preferences }, { data: lineups }, authUsers] = await Promise.all([
    service.from("user_notification_preferences").select("user_id, cartola_push_enabled, cartola_email_enabled").in("user_id", userIds),
    service.from("fantasy_lineups").select("user_id, fantasy_lineup_players(id)").eq("fantasy_round_id", fantasyRound.id).in("user_id", userIds),
    allAuthUsers(),
  ]);
  const prefMap = new Map((preferences || []).map((pref) => [pref.user_id, pref]));
  const complete = new Set((lineups || []).filter((lineup: any) => (lineup.fantasy_lineup_players || []).length >= Number(league.players_per_team || 5)).map((lineup) => lineup.user_id));
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  const profileByUser = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    if (complete.has(userId)) continue;
    const pref = prefMap.get(userId);
    if (pref?.cartola_push_enabled !== false && await claimDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "push" })) {
      try {
        const result = await sendPushNotificationsToUsers(service, [userId], {
          title: `${milestoneLabel(job.milestone)} — Cartola`,
          body: `Sua escalação da Rodada ${String(round.number).padStart(2, "0")} ainda está incompleta.`,
          tag: `cartola-${job.milestone}-${round.id}`,
          url: "/cartola",
        }, "/cartola");
        const pushStatus = result.sent > 0 ? "delivered" : result.failed > 0 ? "failed" : "skipped";
        if (pushStatus === "failed") failed += 1;
        await saveDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "push", status: pushStatus, error: result.failureReasons?.join(" · ") });
        sent += result.sent;
      } catch (error) {
        failed += 1;
        await saveDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "push", status: "failed", error: error instanceof Error ? error.message : "Falha no push" });
      }
    }
    const authUser = authMap.get(userId);
    if (pref?.cartola_email_enabled !== false && authUser?.email && await claimDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "email" })) {
      try {
        const profile = profileByUser.get(userId);
        const providerMessageId = await sendReminderEmail({ userId, email: authUser.email, name: String(playerName.get(profile?.player_id || "") || authUser.user_metadata?.name || "Jogador").split(" ")[0], roundId: round.id, roundNumber: round.number, date: round.date, startTime: round.start_time || "08:00", milestone: job.milestone });
        await saveDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "email", status: "delivered", providerMessageId });
        sent += 1;
      } catch (error) {
        failed += 1;
        await saveDelivery({ leagueId: round.league_id, roundId: round.id, userId, milestone: job.milestone, channel: "email", status: "failed", error: error instanceof Error ? error.message : "Falha no e-mail" });
      }
    }
  }
  if (failed > 0) throw new Error(`${failed} entrega(s) do lembrete falharam e serão tentadas novamente.`);
  return { sent };
}

export async function sendCartolaReminderTest(input: { userId: string; email: string; name: string }) {
  const providerMessageId = await sendReminderEmail({
    ...input,
    roundId: "test",
    roundNumber: 0,
    date: new Date().toISOString().slice(0, 10),
    startTime: "20:00",
    milestone: "opening",
  });
  return { providerMessageId };
}

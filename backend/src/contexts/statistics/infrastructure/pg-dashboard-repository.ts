import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { DashboardRawData, DashboardRepository } from "../application/manage-dashboard.js";
import { getEventWeather } from "./open-meteo-weather.js";

export class PgDashboardRepository implements DashboardRepository {
  constructor(private readonly db: Pool) {}

  async getActiveSeasonId(actor: Actor, leagueId: string): Promise<string | null> {
    return withAuthenticatedTransaction(this.db, actor, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT season.id FROM public.seasons season
         WHERE season.league_id = $1 AND season.status = 'active'
         ORDER BY season.created_at DESC LIMIT 1`,
        [leagueId],
      );
      return result.rows[0]?.id || null;
    });
  }

  async getDashboardData(actor: Actor, leagueId: string, seasonId: string): Promise<DashboardRawData> {
    const source = await withAuthenticatedTransaction(this.db, actor, async (client) => {
      const result = await client.query<{ read_model: any }>(
        "SELECT public.get_home_read_model($1::uuid, $2::uuid) AS read_model",
        [seasonId, leagueId],
      );
      const readModel = result.rows[0]?.read_model;
      if (!readModel || typeof readModel !== "object") throw new Error("Dashboard da liga não encontrado.");
      const stadiumIds = [...new Set([
        readModel.nextRound?.stadium_id,
        ...(readModel.activeCallups || []).map((callup: any) => callup.stadium_id),
      ].filter(Boolean))];
      const stadiums = stadiumIds.length > 0
        ? await client.query<{ id: string; latitude: number | null; longitude: number | null }>(
            "SELECT id, latitude, longitude FROM public.stadiums WHERE league_id = $1 AND id = ANY($2::uuid[])",
            [leagueId, stadiumIds],
          )
        : { rows: [] };
      const liveTeamIds = [readModel.liveMatch?.teamA?.id, readModel.liveMatch?.teamB?.id].filter(Boolean);
      const teamPositions = liveTeamIds.length > 0
        ? await client.query<{ id: string; position: number | null }>(
            `SELECT team.id, team.position FROM public.teams team
             JOIN public.rounds round_item ON round_item.id = team.round_id
             WHERE round_item.league_id = $1 AND team.id = ANY($2::uuid[])`,
            [leagueId, liveTeamIds],
          )
        : { rows: [] };
      return { readModel, stadiums: stadiums.rows, teamPositions: teamPositions.rows };
    });

    const stadiumById = new Map(source.stadiums.map((stadium) => [stadium.id, stadium]));
    const durationMinutes = Number(source.readModel.league?.event_duration_minutes || 120);
    const visibleCallups = (source.readModel.activeCallups || []).filter((callup: any) =>
      !callup.round || !(callup.round.matches || []).some((match: any) =>
        Boolean(match.started_at) || ["in_progress", "live", "finished"].includes(match.status)));
    const [nextRoundWeather, ...callupWeather] = await Promise.all([
      getEventWeather({
        ...stadiumById.get(source.readModel.nextRound?.stadium_id),
        date: source.readModel.nextRound?.date,
        startTime: source.readModel.nextRound?.start_time,
        durationMinutes,
      }),
      ...visibleCallups.map((callup: any) => getEventWeather({
        ...stadiumById.get(callup.stadium_id),
        date: callup.date,
        startTime: callup.start_time || "08:00",
        durationMinutes,
      })),
    ]);
    const positionByTeamId = new Map(source.teamPositions.map((team) => [team.id, team.position]));
    const liveMatch = source.readModel.liveMatch ? {
      ...source.readModel.liveMatch,
      teamA: source.readModel.liveMatch.teamA ? {
        ...source.readModel.liveMatch.teamA,
        position: source.readModel.liveMatch.teamA.position ?? positionByTeamId.get(source.readModel.liveMatch.teamA.id) ?? null,
      } : null,
      teamB: source.readModel.liveMatch.teamB ? {
        ...source.readModel.liveMatch.teamB,
        position: source.readModel.liveMatch.teamB.position ?? positionByTeamId.get(source.readModel.liveMatch.teamB.id) ?? null,
      } : null,
    } : null;
    return {
      league: source.readModel.league ? {
        matchDuration: source.readModel.league.match_duration,
        preseasonEnabled: source.readModel.league.preseason_enabled,
        stadiumName: source.readModel.league.stadium_name,
        stadiumMapUrl: source.readModel.league.stadium_map_url,
        eventDurationMinutes: durationMinutes,
      } : null,
      nextRound: source.readModel.nextRound,
      nextFriendly: source.readModel.nextFriendly,
      liveMatch,
      lastRound: source.readModel.lastRound,
      nextRoundWeather,
      activeCallups: visibleCallups.map((callup: any, index: number) => ({
        ...callup,
        weather: callupWeather[index] || null,
      })),
    };
  }
}

import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  RankingRawEnrichmentData,
  SeasonRankingRepository,
} from "../application/manage-season-ranking.js";
import type {
  OfficialRoundMeta,
  OverallTrend,
  PlayerAchievementBelt,
  PlayerEquippedCosmetics,
  RankingDetailStatsRow,
  RankingPlayer,
  VisibleSeasonMeta,
} from "../domain/season-ranking.js";

function overallTrend(value: unknown): OverallTrend {
  return value === "rising" || value === "falling" ? value : "steady";
}

export class PgSeasonRankingRepository implements SeasonRankingRepository {
  constructor(private readonly pool: Pool) {}

  async findActiveSeason(actor: Actor, leagueId: string): Promise<VisibleSeasonMeta | null> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<{
        id: string;
        number: number;
        status: string;
        started_at: string;
      }>(
        `SELECT id, number, status, started_at
         FROM public.seasons
         WHERE league_id = $1::uuid AND status = 'active'
         LIMIT 1`,
        [leagueId],
      );
      if (!result.rows[0]) return null;
      const r = result.rows[0];
      return {
        id: r.id,
        number: Number(r.number),
        status: r.status,
        startedAt: r.started_at,
      };
    });
  }

  async findVisibleSeasons(
    actor: Actor,
    leagueId: string,
    currentSeasonId: string,
  ): Promise<VisibleSeasonMeta[]> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<{
        id: string;
        number: number;
        status: string;
        started_at: string;
      }>(
        `SELECT id, number, status, started_at
         FROM public.seasons
         WHERE league_id = $1::uuid AND status = 'finished' AND id != $2::uuid
         ORDER BY number DESC
         LIMIT 1`,
        [leagueId, currentSeasonId],
      );
      return result.rows.map((r) => ({
        id: r.id,
        number: Number(r.number),
        status: r.status,
        startedAt: r.started_at,
      }));
    });
  }

  async findFinishedOfficialRounds(actor: Actor, seasonIds: string[]): Promise<OfficialRoundMeta[]> {
    if (!seasonIds.length) return [];
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<{
        id: string;
        number: number;
        date: string;
        season_id: string;
        best_goalkeeper_player_id: string | null;
        scoring_snapshot: Record<string, unknown> | null;
      }>(
        `SELECT id, number, date, season_id, best_goalkeeper_player_id, scoring_snapshot
         FROM public.rounds
         WHERE season_id = ANY($1::uuid[]) AND status = 'finished' AND round_type = 'official'
         ORDER BY date DESC, number DESC`,
        [seasonIds],
      );
      return result.rows.map((r) => ({
        id: r.id,
        number: Number(r.number),
        date: r.date,
        seasonId: r.season_id,
        bestGoalkeeperPlayerId: r.best_goalkeeper_player_id,
        scoringSnapshot: r.scoring_snapshot,
      }));
    });
  }

  async findPlayerRoundStats(actor: Actor, roundIds: string[]): Promise<RankingDetailStatsRow[]> {
    if (!roundIds.length) return [];
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<any>(
        `SELECT
          prs.player_id,
          prs.round_id,
          prs.games,
          prs.wins,
          prs.draws,
          prs.losses,
          prs.goals,
          prs.assists,
          prs.points,
          prs.goalkeeper_games,
          prs.goalkeeper_goals,
          prs.goalkeeper_assists,
          prs.goalkeeper_own_goals,
          prs.goals_conceded,
          prs.clean_sheets,
          prs.own_goals,
          prs.defensive_clean_games,
          prs.defensive_one_goal_games,
          prs.team_goals_conceded,
          prs.ranking_defensive_clean_games,
          prs.ranking_defensive_one_goal_games,
          prs.ranking_role_weights,
          prs.ranking_position_bonus,
          prs.ranking_points,
          prs.player_profile_locked,
          prs.profile_decision_source,
          prs.profile_appearance_number,
          prs.profile_def_overall,
          prs.profile_ata_overall,
          row_to_json(p) as player
        FROM public.player_round_stats prs
        JOIN public.players p ON p.id = prs.player_id
        WHERE prs.round_id = ANY($1::uuid[])`,
        [roundIds],
      );

      return result.rows.map((row) => ({
        player_id: row.player_id,
        round_id: row.round_id,
        games: Number(row.games || 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        points: Number(row.points || 0),
        goalkeeper_games: Number(row.goalkeeper_games || 0),
        goalkeeper_goals: Number(row.goalkeeper_goals || 0),
        goalkeeper_assists: Number(row.goalkeeper_assists || 0),
        goalkeeper_own_goals: Number(row.goalkeeper_own_goals || 0),
        goals_conceded: Number(row.goals_conceded || 0),
        clean_sheets: Number(row.clean_sheets || 0),
        own_goals: Number(row.own_goals || 0),
        defensive_clean_games: Number(row.defensive_clean_games || 0),
        defensive_one_goal_games: Number(row.defensive_one_goal_games || 0),
        team_goals_conceded: Number(row.team_goals_conceded || 0),
        ranking_defensive_clean_games: Number(row.ranking_defensive_clean_games || 0),
        ranking_defensive_one_goal_games: Number(row.ranking_defensive_one_goal_games || 0),
        ranking_role_weights: row.ranking_role_weights,
        ranking_position_bonus: Number(row.ranking_position_bonus || 0),
        ranking_points: row.ranking_points !== null ? Number(row.ranking_points) : null,
        player_profile_locked: row.player_profile_locked,
        profile_decision_source: row.profile_decision_source,
        profile_appearance_number:
          row.profile_appearance_number !== null ? Number(row.profile_appearance_number) : null,
        profile_def_overall: row.profile_def_overall !== null ? Number(row.profile_def_overall) : null,
        profile_ata_overall: row.profile_ata_overall !== null ? Number(row.profile_ata_overall) : null,
        player: row.player as RankingPlayer,
      }));
    });
  }

  async findEnrichmentData(
    actor: Actor,
    leagueId: string,
    seasonId: string,
    roundIds: string[],
    playerIds?: string[],
  ): Promise<RankingRawEnrichmentData> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      // 1. Fitness
      let fitnessRows: Array<{ player_id: string; distance_km: number; average_speed_kmh: number }> = [];
      if (roundIds.length) {
        const fitnessParams: any[] = [roundIds];
        let fitnessSql = `SELECT player_id, distance_km, average_speed_kmh FROM public.player_round_fitness WHERE round_id = ANY($1::uuid[])`;
        if (playerIds && playerIds.length) {
          fitnessParams.push(playerIds);
          fitnessSql += ` AND player_id = ANY($2::uuid[])`;
        }
        try {
          const res = await client.query(fitnessSql, fitnessParams);
          fitnessRows = res.rows;
        } catch {
          fitnessRows = [];
        }
      }

      // 2. Cosméticos
      const cosmeticsByPlayer = new Map<string, PlayerEquippedCosmetics>();
      try {
        const cosParams: any[] = [];
        let cosSql = `
          SELECT pec.player_id, pec.slot, c.name, c.asset_key
          FROM public.player_equipped_cosmetics pec
          JOIN public.cosmetics c ON c.id = pec.cosmetic_id
        `;
        if (playerIds && playerIds.length) {
          cosParams.push(playerIds);
          cosSql += ` WHERE pec.player_id = ANY($1::uuid[])`;
        }
        const cosRes = await client.query(cosSql, cosParams);
        const mapByPlayerAndSlot = new Map<string, Map<string, { name: string; asset_key: string }>>();
        for (const row of cosRes.rows) {
          const m = mapByPlayerAndSlot.get(row.player_id) || new Map();
          m.set(row.slot, { name: row.name, asset_key: row.asset_key });
          mapByPlayerAndSlot.set(row.player_id, m);
        }
        for (const [pid, slotMap] of mapByPlayerAndSlot.entries()) {
          cosmeticsByPlayer.set(pid, {
            frameKey: slotMap.get("frame")?.asset_key || null,
            auraKey: slotMap.get("aura")?.asset_key || null,
            titleName: slotMap.get("title")?.name || null,
            bannerAssetKey: slotMap.get("banner")?.asset_key || null,
            nameplateKey: slotMap.get("nameplate")?.asset_key || null,
          });
        }
      } catch {
        // Tolerância caso a tabela ainda não exista em algum ambiente de teste
      }

      // 3. Overalls (RPC)
      const overallByPlayer = new Map<
        string,
        {
          overall: number;
          trend: OverallTrend;
          positions: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
          positionTrends: Record<"DEF" | "ALA_MEI" | "ATA" | "GOL", OverallTrend>;
          goalkeeperGames: number;
          goalkeeperRounds: number;
          roundsPlayed: number;
        }
      >();
      try {
        const ovRes = await client.query(
          `SELECT * FROM public.get_latest_player_card_overalls_for_league($1::uuid)`,
          [leagueId],
        );
        for (const row of ovRes.rows) {
          const overall = Number(row.overall);
          const trend = overallTrend(row.trend);
          const values = {
            DEF: Number(row.def_overall),
            ALA_MEI: Number(row.ala_mei_overall),
            ATA: Number(row.ata_overall),
            GOL: Number(row.gol_overall),
          };
          const positions = Object.values(values).every(Number.isFinite) ? values : null;
          const positionTrends = {
            DEF: overallTrend(row.def_trend),
            ALA_MEI: overallTrend(row.ala_mei_trend),
            ATA: overallTrend(row.ata_trend),
            GOL: overallTrend(row.gol_trend),
          };
          if (Number.isFinite(overall)) {
            overallByPlayer.set(row.player_id, {
              overall,
              trend,
              positions,
              positionTrends,
              goalkeeperGames: Number(row.goalkeeper_games || 0),
              goalkeeperRounds: Number(row.goalkeeper_rounds || 0),
              roundsPlayed: Number(row.rounds_played || 0),
            });
          }
        }
      } catch {
        // Fallback gracioso
      }

      // 4. Velocidade (RPC)
      const speedByPlayer = new Map<string, 1 | 2 | 3>();
      try {
        const spRes = await client.query(
          `SELECT * FROM public.get_public_player_speed_ratings_for_league($1::uuid)`,
          [leagueId],
        );
        for (const row of spRes.rows) {
          const rating = Number(row.speed_rating);
          if (rating === 1 || rating === 2 || rating === 3) {
            speedByPlayer.set(row.player_id, rating as 1 | 2 | 3);
          }
        }
      } catch {
        // Fallback gracioso
      }

      // 5. Cinturões (RPC)
      const achievementBeltsByPlayer = new Map<string, PlayerAchievementBelt[]>();
      try {
        const beltRes = await client.query(
          `SELECT * FROM public.get_league_achievement_belt_holders($1::uuid)`,
          [leagueId],
        );
        for (const row of beltRes.rows) {
          const beltsRaw = Array.isArray(row.belts) ? row.belts : [];
          const parsed = beltsRaw.map((b: any) => ({
            beltId: String(b.beltId || b.id || ""),
            name: String(b.name || ""),
            category: String(b.category || "achievement"),
            icon: b.icon || null,
            awardedAt: b.awardedAt || null,
          }));
          achievementBeltsByPlayer.set(String(row.player_id), parsed);
        }
      } catch {
        // Fallback gracioso
      }

      return {
        fitnessRows,
        cosmeticsByPlayer,
        overallByPlayer,
        speedByPlayer,
        achievementBeltsByPlayer,
      };
    });
  }

  async findLeaguePlayer(actor: Actor, leagueId: string, playerId: string): Promise<RankingPlayer | null> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<any>(
        `SELECT p.*
         FROM public.players p
         JOIN public.league_members lm ON lm.player_id = p.id
         WHERE lm.league_id = $1::uuid AND lm.player_id = $2::uuid AND lm.is_active = true
         LIMIT 1`,
        [leagueId, playerId],
      );
      if (!result.rows[0]) return null;
      return result.rows[0] as RankingPlayer;
    });
  }

  async findPlayerCosmetics(actor: Actor, playerId: string): Promise<PlayerEquippedCosmetics | null> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      try {
        const result = await client.query<{
          slot: string;
          name: string;
          asset_key: string;
        }>(
          `SELECT pec.slot, c.name, c.asset_key
           FROM public.player_equipped_cosmetics pec
           JOIN public.cosmetics c ON c.id = pec.cosmetic_id
           WHERE pec.player_id = $1::uuid`,
          [playerId],
        );
        const map = new Map(result.rows.map((r) => [r.slot, { name: r.name, asset_key: r.asset_key }]));
        return {
          frameKey: map.get("frame")?.asset_key || null,
          auraKey: map.get("aura")?.asset_key || null,
          titleName: map.get("title")?.name || null,
          bannerAssetKey: map.get("banner")?.asset_key || null,
          nameplateKey: map.get("nameplate")?.asset_key || null,
        };
      } catch {
        return null;
      }
    });
  }
}

export function pgSeasonRankingRepository(pool: Pool): SeasonRankingRepository {
  return new PgSeasonRankingRepository(pool);
}


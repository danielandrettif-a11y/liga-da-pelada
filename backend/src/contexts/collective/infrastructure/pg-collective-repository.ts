import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { CollectiveRepository, SendCollectiveMessageInput } from "../application/manage-collective.js";

export class PgCollectiveRepository implements CollectiveRepository {
  constructor(private readonly pool: Pool) {}

  private async authenticated<T>(actor: Actor, action: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claims',$2,true), set_config('search_path','public, auth',true)", [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })]);
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getPreviousCallupId(actor: Actor, leagueId: string): Promise<{ callupId: string | null } | null> {
    return this.authenticated(actor, async (client) => {
      const access = await client.query("SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId]);
      if (!access.rows[0]?.allowed) return null;
      const result = await client.query(`SELECT c.id FROM public.callups c JOIN public.rounds r ON r.id=c.round_id
        WHERE c.league_id=$1::uuid AND r.status='finished' ORDER BY c.date DESC LIMIT 1`, [leagueId]);
      return { callupId: result.rows[0]?.id ?? null };
    });
  }

  async getCandidates(actor: Actor, leagueId: string): Promise<any[] | null> {
    return this.authenticated(actor, async (client) => {
      const access = await client.query(`SELECT l.feature_tier,public.is_league_admin(l.id) AS is_admin,p.member_category
        FROM public.leagues l LEFT JOIN public.account_profiles ap ON ap.user_id=$2::uuid
        LEFT JOIN public.players p ON p.id=ap.player_id
        WHERE l.id=$1::uuid AND public.is_league_member(l.id)`, [leagueId, actor.userId]);
      if (!access.rows[0]) return null;
      if (access.rows[0].feature_tier !== "complete" || (!access.rows[0].is_admin && access.rows[0].member_category !== "player")) return [];
      const result = await client.query(`SELECT c.id,c.date::text AS date,to_jsonb(c.created_at) AS created_at,c.round_id,c.status,
        CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'number',r.number,'status',r.status,
          'payment_pix',r.payment_pix,'payment_total',r.payment_total,
          'round_players',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',rp.player_id)) FROM public.round_players rp WHERE rp.round_id=r.id),'[]'::jsonb),
          'round_payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',pay.player_id,'paid',pay.paid)) FROM public.round_payments pay WHERE pay.round_id=r.id),'[]'::jsonb)) END AS round,
        (SELECT jsonb_build_object('id',d.id,'status',d.status) FROM public.team_drafts d WHERE d.callup_id=c.id LIMIT 1) AS team_drafts
        FROM public.callups c LEFT JOIN public.rounds r ON r.id=c.round_id
        WHERE c.league_id=$1::uuid AND c.status='converted' ORDER BY c.date DESC LIMIT 12`, [leagueId]);
      return result.rows;
    });
  }

  async getPage(actor: Actor, leagueId: string, callupIds: string[], cursor: { createdAt: string; id: string } | null, limit: number): Promise<unknown | null> {
    return this.authenticated(actor, async (client) => {
      const allowed = await client.query(`SELECT c.id FROM public.callups c WHERE c.league_id=$1::uuid
        AND c.id=ANY($2::uuid[]) AND public.can_access_collective_chat(c.id)`, [leagueId, callupIds]);
      if (allowed.rows.length !== callupIds.length) return null;
      const result = await client.query(`SELECT public.get_collective_page($1::uuid[],$2::timestamptz,$3::uuid,$4::integer) AS value`,
        [callupIds, cursor?.createdAt ?? null, cursor?.id ?? null, limit]);
      return result.rows[0]?.value ?? null;
    });
  }

  async sendMessage(
    actor: Actor,
    leagueId: string,
    input: SendCollectiveMessageInput,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claims',$2,true), set_config('search_path','public, auth',true)", [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })]);
      const res = await client.query(`INSERT INTO public.collective_messages
        (callup_id,round_id,sender_user_id,sender_player_id,body,kind,media_path,media_mime,media_size,audio_duration_seconds,reply_to_message_id)
        SELECT c.id,c.round_id,$1::uuid,p.player_id,$4::text,$5::text,$6::text,$7::text,$8::bigint,$9::integer,$10::uuid
        FROM public.callups c JOIN public.account_profiles p ON p.user_id=$1::uuid
        WHERE c.id=$2::uuid AND c.league_id=$3::uuid AND p.player_id IS NOT NULL
          AND public.can_access_collective_chat(c.id)
          AND ($10::uuid IS NULL OR EXISTS (SELECT 1 FROM public.collective_messages original WHERE original.id=$10::uuid AND original.callup_id=c.id))
          AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM storage.objects object WHERE object.bucket_id='collective-media' AND object.name=$6::text))
        RETURNING id`, [actor.userId, input.callupId, leagueId, input.body, input.kind, input.mediaPath || null, input.mediaMime || null, input.mediaSize || null, input.duration || null, input.replyToMessageId || null]);
      await client.query("COMMIT");
      return res.rows[0]?.id ? { success: true, messageId: res.rows[0].id } : { success: false, error: "A Coletiva ou a mensagem respondida não está disponível para esta conta." };
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      return { success: false, error: "Falha ao gravar mensagem." };
    } finally {
      client.release();
    }
  }

  async editMessage(
    actor: Actor,
    leagueId: string,
    messageId: string,
    body: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.authenticated(actor, async (client) => {
        const res = await client.query(`UPDATE public.collective_messages m SET body=$1,edited_at=now()
          FROM public.callups c WHERE m.id=$2::uuid AND m.callup_id=c.id AND c.league_id=$3::uuid
          AND m.sender_user_id=$4::uuid AND m.deleted_at IS NULL AND m.kind='text'
          AND public.can_access_collective_chat(c.id) RETURNING m.id`, [body, messageId, leagueId, actor.userId]);
        return { success: Boolean(res.rowCount) };
      });
    } catch { return { success: false, error: "Não foi possível editar a mensagem." }; }
  }

  async deleteMessage(
    actor: Actor,
    leagueId: string,
    messageId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.authenticated(actor, async (client) => {
        const res = await client.query(`UPDATE public.collective_messages m SET body='Mensagem removida',deleted_at=now()
          FROM public.callups c WHERE m.id=$1::uuid AND m.callup_id=c.id AND c.league_id=$2::uuid
          AND public.can_access_collective_chat(c.id)
          AND (m.sender_user_id=$3::uuid OR public.is_league_admin(c.league_id)) RETURNING m.id`, [messageId, leagueId, actor.userId]);
        return { success: Boolean(res.rowCount) };
      });
    } catch { return { success: false, error: "Não foi possível apagar a mensagem." }; }
  }

  async markRead(
    actor: Actor,
    leagueId: string,
    targets: Array<{ callupId: string; messageId: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claims',$2,true), set_config('search_path','public, auth',true)", [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })]);
      const result = await client.query(`WITH targets AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS t("callupId" uuid,"messageId" uuid)
        ), valid AS (
          SELECT DISTINCT ON (message.callup_id) message.callup_id,message.id,message.created_at
          FROM targets t JOIN public.collective_messages message ON message.id=t."messageId" AND message.callup_id=t."callupId"
          JOIN public.callups c ON c.id=message.callup_id
          WHERE c.league_id=$2::uuid AND public.can_access_collective_chat(c.id)
          ORDER BY message.callup_id,message.created_at DESC,message.id DESC
        )
        INSERT INTO public.collective_reads (callup_id,user_id,last_read_message_id,read_at)
        SELECT callup_id,$3::uuid,id,created_at FROM valid
        ON CONFLICT (callup_id,user_id) DO UPDATE
          SET last_read_message_id=EXCLUDED.last_read_message_id, read_at=EXCLUDED.read_at
        RETURNING callup_id`, [JSON.stringify(targets), leagueId, actor.userId]);
      await client.query("COMMIT");
      return { success: Boolean(result.rowCount) };
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      return { success: false, error: "Não foi possível marcar as mensagens como lidas." };
    } finally {
      client.release();
    }
  }

}

-- Read model paginado da Coletiva. A funcao continua sob RLS (security
-- invoker), limita o lote e calcula nao lidas no PostgreSQL.
BEGIN;

CREATE INDEX IF NOT EXISTS collective_messages_callup_cursor_idx
  ON public.collective_messages (callup_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_collective_page(
  p_callup_ids uuid[],
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      greatest(1, least(coalesce(p_limit, 60), 100)) AS page_size,
      coalesce(p_callup_ids, ARRAY[]::uuid[]) AS callup_ids
  ),
  allowed_callups AS (
    SELECT DISTINCT callup_id
    FROM input, unnest(input.callup_ids) AS callup_id
    WHERE public.can_access_collective_chat(callup_id)
  ),
  candidate_rows AS (
    SELECT message.*
    FROM public.collective_messages message
    JOIN allowed_callups allowed ON allowed.callup_id = message.callup_id
    CROSS JOIN input
    WHERE message.created_at >= now() - interval '14 days'
      AND (
        p_before_created_at IS NULL
        OR (message.created_at, message.id) < (p_before_created_at, p_before_id)
      )
    ORDER BY message.created_at DESC, message.id DESC
    LIMIT (SELECT page_size + 1 FROM input)
  ),
  page_rows AS (
    SELECT *
    FROM candidate_rows
    ORDER BY created_at DESC, id DESC
    LIMIT (SELECT page_size FROM input)
  ),
  decorated_rows AS (
    SELECT
      message.*,
      coalesce(sender.name, 'Usuario') AS sender_name,
      sender.avatar_url AS sender_avatar_url,
      reply.kind AS reply_kind,
      CASE WHEN reply.deleted_at IS NULL THEN reply.body ELSE 'Mensagem removida' END AS reply_body,
      coalesce(reply_sender.name, 'Usuario') AS reply_sender_name
    FROM page_rows message
    LEFT JOIN public.players sender ON sender.id = message.sender_player_id
    LEFT JOIN public.collective_messages reply ON reply.id = message.reply_to_message_id
    LEFT JOIN public.players reply_sender ON reply_sender.id = reply.sender_player_id
  ),
  unread_rows AS (
    SELECT message.id, message.created_at
    FROM public.collective_messages message
    JOIN allowed_callups allowed ON allowed.callup_id = message.callup_id
    LEFT JOIN public.collective_reads read_state
      ON read_state.callup_id = message.callup_id
      AND read_state.user_id = (SELECT auth.uid())
    LEFT JOIN public.collective_messages marker
      ON marker.id = read_state.last_read_message_id
    WHERE message.created_at >= now() - interval '14 days'
      AND message.sender_user_id IS DISTINCT FROM (SELECT auth.uid())
      AND message.kind <> 'system'
      AND message.deleted_at IS NULL
      AND (
        marker.id IS NULL
        OR (message.created_at, message.id) > (marker.created_at, marker.id)
      )
  ),
  page_payload AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'callup_id', row.callup_id,
          'round_id', row.round_id,
          'sender_user_id', row.sender_user_id,
          'sender_player_id', row.sender_player_id,
          'sender_name', CASE WHEN row.kind = 'system' THEN 'Draft BQ' ELSE row.sender_name END,
          'sender_avatar_url', row.sender_avatar_url,
          'kind', row.kind,
          'body', row.body,
          'media_path', row.media_path,
          'media_mime', row.media_mime,
          'audio_duration_seconds', row.audio_duration_seconds,
          'edited_at', row.edited_at,
          'deleted_at', row.deleted_at,
          'created_at', row.created_at,
          'reply_to_message_id', row.reply_to_message_id,
          'reply_kind', row.reply_kind,
          'reply_body', row.reply_body,
          'reply_sender_name', row.reply_sender_name
        ) ORDER BY row.created_at ASC, row.id ASC
      ),
      '[]'::jsonb
    ) AS messages
    FROM decorated_rows row
  ),
  oldest_page_row AS (
    SELECT created_at, id
    FROM page_rows
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'messages', page_payload.messages,
    'has_more', (SELECT count(*) FROM candidate_rows) > (SELECT page_size FROM input),
    'next_cursor', CASE
      WHEN (SELECT count(*) FROM candidate_rows) > (SELECT page_size FROM input)
      THEN (SELECT jsonb_build_object('created_at', created_at, 'id', id) FROM oldest_page_row)
      ELSE NULL
    END,
    'unread_count', (SELECT count(*) FROM unread_rows),
    'first_unread_message_id', (
      SELECT id FROM unread_rows ORDER BY created_at ASC, id ASC LIMIT 1
    )
  )
  FROM page_payload;
$$;

REVOKE ALL ON FUNCTION public.get_collective_page(uuid[], timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_collective_page(uuid[], timestamptz, uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

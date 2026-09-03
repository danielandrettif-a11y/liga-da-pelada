-- Auditoria somente leitura dos tempos de gol.
-- Execute após a migration 127 no SQL Editor do Supabase.
-- Não retorna nomes, e-mails ou UUIDs; as chaves existem apenas neste resultado.

WITH match_scope AS (
  SELECT
    match_item.id,
    round_item.number AS round_number,
    match_item.match_order,
    match_item.team_a_id,
    match_item.team_b_id,
    match_item.score_a,
    match_item.score_b,
    match_item.duration_seconds,
    dense_rank() OVER (ORDER BY match_item.id)::INTEGER AS match_key
  FROM public.matches match_item
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
),
event_scope AS (
  SELECT
    match_scope.round_number,
    match_scope.match_order,
    match_scope.match_key,
    row_number() OVER (
      PARTITION BY event.match_id ORDER BY event.created_at, event.id
    )::INTEGER AS goal_order,
    event.minute AS stored_minute,
    event.elapsed_seconds,
    CASE
      WHEN event.elapsed_seconds IS NOT NULL THEN 'exact'
      WHEN event.minute IS NOT NULL THEN 'legacy_approximate'
      ELSE 'missing'
    END AS time_quality,
    CASE
      WHEN event.elapsed_seconds > 420 THEN event.elapsed_seconds - 420
      ELSE 0
    END AS stoppage_seconds,
    CASE
      WHEN event.elapsed_seconds IS NULL OR event.minute IS NULL THEN NULL
      ELSE event.minute = FLOOR(event.elapsed_seconds / 60.0)::INTEGER
    END AS minute_matches_seconds,
    event.team_id,
    match_scope.team_a_id,
    match_scope.team_b_id,
    match_scope.score_a,
    match_scope.score_b
  FROM public.match_events event
  JOIN match_scope ON match_scope.id = event.match_id
),
match_checks AS (
  SELECT
    match_scope.match_key,
    count(event.id) FILTER (WHERE event.team_id = match_scope.team_a_id)::INTEGER AS events_a,
    count(event.id) FILTER (WHERE event.team_id = match_scope.team_b_id)::INTEGER AS events_b,
    match_scope.score_a,
    match_scope.score_b
  FROM match_scope
  LEFT JOIN public.match_events event ON event.match_id = match_scope.id
  GROUP BY match_scope.match_key, match_scope.score_a, match_scope.score_b
),
summary AS (
  SELECT jsonb_build_object(
    'goals', count(*),
    'exact_times', count(*) FILTER (WHERE time_quality = 'exact'),
    'legacy_approximate_times', count(*) FILTER (WHERE time_quality = 'legacy_approximate'),
    'missing_times', count(*) FILTER (WHERE time_quality = 'missing'),
    'goals_in_stoppage_time', count(*) FILTER (WHERE stoppage_seconds > 0),
    'minute_second_mismatches', count(*) FILTER (WHERE minute_matches_seconds = false),
    'matches_with_score_mismatch', (
      SELECT count(*)
      FROM match_checks
      WHERE events_a <> score_a OR events_b <> score_b
    )
  ) AS value
  FROM event_scope
),
details AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'round_number', round_number,
    'match_order', match_order,
    'match_key', match_key,
    'goal_order', goal_order,
    'stored_minute', stored_minute,
    'elapsed_seconds', elapsed_seconds,
    'time_quality', time_quality,
    'stoppage_seconds', stoppage_seconds,
    'minute_matches_seconds', minute_matches_seconds
  ) ORDER BY round_number, match_order, goal_order), '[]'::jsonb) AS value
  FROM event_scope
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'regulation_seconds', 420,
  'summary', summary.value,
  'events', details.value
) AS goal_time_audit
FROM summary, details;

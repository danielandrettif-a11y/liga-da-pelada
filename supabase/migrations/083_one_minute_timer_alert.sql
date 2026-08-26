-- Terceiro marco de aviso do cronometro: um minuto restante.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS timer_one_minute_alerted_at TIMESTAMPTZ;

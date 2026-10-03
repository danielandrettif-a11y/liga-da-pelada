ALTER TABLE public.match_players
ADD COLUMN IF NOT EXISTS scoring_eligible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.match_players.scoring_eligible IS
  'Quando false, a participacao continua valida para o placar da partida, mas nao gera jogo, resultado, gol, assistencia ou scout de goleiro para o atleta.';

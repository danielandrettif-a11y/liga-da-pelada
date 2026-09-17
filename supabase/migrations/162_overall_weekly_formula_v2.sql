-- A pelada ocorre uma vez por semana. Esta versão mantém uma janela curta,
-- permitindo que o OVR acompanhe o momento de aproximadamente dois meses.

INSERT INTO public.overall_formula_versions (key, label, config)
VALUES (
  'adaptive-v2-weekly-shadow',
  'OVR adaptativo semanal — modo sombra',
  '{
    "base": 70,
    "legacyInitialTagBonus": 3,
    "seedFadeRounds": 3,
    "confidenceRounds": 3,
    "positionCaps": {"1": 74, "2": 76, "3": 78},
    "staleAfterRounds": 4,
    "halfLifeRounds": 3,
    "recentRoundWindow": 8,
    "maxChangePerRound": 2
  }'::JSONB
)
ON CONFLICT (key) DO NOTHING;

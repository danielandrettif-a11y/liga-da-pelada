-- Separa as identidades dos OVRs de linha. A fórmula anterior ainda deixava
-- 45% do OVR DEF nas mãos de gols e assistências, permitindo que artilheiros
-- conservassem uma nota defensiva alta sem a mesma proteção contra gols.

BEGIN;

UPDATE public.overall_formula_versions
SET label = 'OVR adaptativo v18 — DEF e ATA especializados',
    config = jsonb_set(
      config,
      '{positionWeights}',
      jsonb_build_object(
        'DEF', jsonb_build_object(
          'defense', 0.90,
          'goals', 0.04,
          'assists', 0.06,
          'result', 0
        ),
        'ALA_MEI', jsonb_build_object(
          'defense', 0.05,
          'goals', 0.62,
          'assists', 0.33,
          'result', 0
        ),
        'ATA', jsonb_build_object(
          'defense', 0.05,
          'goals', 0.62,
          'assists', 0.33,
          'result', 0
        )
      ),
      true
    )
WHERE key = 'adaptive-v18-fluid-profile';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- OVR DEF mede especialização defensiva. Clean sheets de um time forte não
-- devem, sozinhos, transformar um artilheiro recorrente em defensor.

BEGIN;

UPDATE public.overall_formula_versions
SET label = 'OVR adaptativo v18 — especializações DEF e ATA',
    config = jsonb_set(
      jsonb_set(
        config,
        '{positionWeights,DEF}',
        jsonb_build_object(
          'defense', 1,
          'goals', 0,
          'assists', 0,
          'result', 0
        ),
        true
      ),
      '{defensiveOffensePenalty}',
      '0.9'::jsonb,
      true
    )
WHERE key = 'adaptive-v18-fluid-profile';

NOTIFY pgrst, 'reload schema';
COMMIT;

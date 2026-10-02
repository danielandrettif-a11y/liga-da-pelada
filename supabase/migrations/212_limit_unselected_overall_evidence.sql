-- Posições fora das características continuam evoluindo, mas com evidência reduzida.

BEGIN;

UPDATE public.overall_formula_versions
SET
  label = 'OVR adaptativo v16 — bônus distribuído e posição não marcada limitada',
  config = config || jsonb_build_object(
    'unselectedTraitEvidenceEnabled', true,
    'unselectedTraitEvidence', 0.20
  )
WHERE key = 'adaptive-v16-distributed-trait-bonus';

COMMIT;

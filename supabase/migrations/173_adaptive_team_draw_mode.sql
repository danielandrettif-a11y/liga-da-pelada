-- Modo experimental de sorteio: 45% OVR, 40% velocidade e 15% funcoes.
-- Apenas amplia o enum textual; os modos antigos continuam intactos.

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_formation_mode_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_formation_mode_check
  CHECK (formation_mode IN ('manual', 'random', 'balanced', 'speed', 'adaptive'));

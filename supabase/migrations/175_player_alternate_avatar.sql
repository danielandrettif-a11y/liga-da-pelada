-- Cada perfil pode guardar duas fotos. avatar_url permanece sendo a foto
-- pública ativa, para que todos os consumidores existentes continuem iguais.
-- avatar_alternate_url é a segunda vaga que o próprio usuário pode alternar.

alter table public.players
  add column if not exists avatar_alternate_url text;

comment on column public.players.avatar_alternate_url is
  'Foto extra do perfil. avatar_url continua sendo a foto ativa e pública.';

notify pgrst, 'reload schema';

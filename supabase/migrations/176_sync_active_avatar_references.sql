-- A foto atual do jogador deve ser a mesma em todas as superfícies do app.
-- Algumas escalações guardam uma cópia do avatar para leitura rápida; este
-- gatilho atualiza somente a imagem, preservando os demais dados históricos.

create or replace function public.sync_player_active_avatar_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;

  update public.fantasy_lineup_players
  set avatar_url_locked = new.avatar_url
  where player_id = new.id
    and avatar_url_locked is distinct from new.avatar_url;

  update public.fantasy_test_lineup_players
  set avatar_url_locked = new.avatar_url
  where player_id = new.id
    and avatar_url_locked is distinct from new.avatar_url;

  update public.player_registration_events
  set avatar_url = new.avatar_url
  where player_id = new.id
    and avatar_url is distinct from new.avatar_url;

  return new;
end;
$$;

drop trigger if exists sync_player_active_avatar_references_on_update on public.players;

create trigger sync_player_active_avatar_references_on_update
after update of avatar_url on public.players
for each row
execute function public.sync_player_active_avatar_references();

notify pgrst, 'reload schema';

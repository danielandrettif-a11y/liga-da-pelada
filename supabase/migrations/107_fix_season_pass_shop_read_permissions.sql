-- A policy RLS define quais linhas podem ser lidas, mas o papel authenticated
-- também precisa do privilégio SELECT na tabela. Sem ele, o dashboard inteiro
-- de cosméticos recebia permission denied ao consultar a loja.

GRANT SELECT ON TABLE public.fantasy_season_pass_shop_items TO authenticated;

NOTIFY pgrst, 'reload schema';

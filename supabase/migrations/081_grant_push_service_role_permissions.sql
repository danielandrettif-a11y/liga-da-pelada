-- Permite que os webhooks internos do cronometro encontrem as contas dos
-- jogadores e entreguem Web Push sem depender da sessao aberta no navegador.
-- O service_role continua restrito ao backend e ignora as politicas RLS.

GRANT SELECT ON TABLE public.account_profiles TO service_role;
GRANT SELECT, DELETE ON TABLE public.push_subscriptions TO service_role;

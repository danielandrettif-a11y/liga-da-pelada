# Backend modular

Backend Fastify da nova arquitetura da Liga da Pelada. Os contextos seguem a separação `domain` → `application` → `infrastructure` → `presentation` e são compostos em `src/server.ts`.

## Contextos

Leagues, identity, roster, callups, rounds, matches, notifications, statistics, finance, fantasy, cards, cosmetics, collective, integrations e operations.

As rotas recebem Bearer token, verificam o usuário no Auth do mesmo ambiente e executam o PostgreSQL com transação autenticada, claims locais, RLS e `search_path` controlado. Auth, Storage e Realtime permanecem fornecidos pela stack Supabase auto-hospedada no primeiro corte.

## Configuração mínima

Copie `.env.example` para um arquivo privado e configure:

- `DATABASE_URL`: papel dedicado da aplicação, sem superusuário;
- `SUPABASE_INTERNAL_URL`: gateway Auth acessível pelo container;
- `SUPABASE_PUBLIC_URL`: origem HTTPS vista pelo navegador;
- `SUPABASE_PUBLISHABLE_KEY`: chave pública do mesmo ambiente;
- `APP_PUBLIC_URL`: origem HTTPS do Next.js.

Quando Notifications API estiver ativa, `MATCH_TIMER_WEBHOOK_SECRET` e `EMAIL_UNSUBSCRIBE_SECRET` são obrigatórios. QStash, VAPID e Resend habilitam as entregas externas correspondentes.

## Qualidade

```bash
npm ci
npm run typecheck
npm test
npm run build
```

O serviço expõe `/health` e `/healthz`. O Dockerfile usa `backend/` como contexto:

```bash
docker build -f backend/Dockerfile backend
```

## Estado de migração

Os 269 contratos do frontend possuem pontes modulares; 200 estão aceitos na revisão de paridade. As 8 operações da Coletiva estão `retired` e sua API fica habilitada no Compose; Auth, Storage e assinatura de mídia continuam no Supabase, enquanto autorização e persistência passam pelo backend. Financeiro, Cartola, cartas, cosméticos e BQ Manager permanecem desativados até concluírem a mesma homologação.

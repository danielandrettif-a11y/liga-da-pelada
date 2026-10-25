# Backend inicial de partidas

Este serviço é uma fatia **experimental** da migração. A rota de gol não é registrada com `ENABLE_GOAL_API=false` (padrão). O Next.js atual continua usando o fluxo existente.

## Limites implementados

- `domain`: valida o comando sem importar Fastify, PostgreSQL ou Next.js.
- `application`: recebe um repositório por interface e a identidade verificada.
- `infrastructure`: verifica o access token no Auth auto-hospedado e invoca a função SQL `register_goal` em transação, usando `SET LOCAL ROLE authenticated` e claims locais.
- `presentation`: `GET /health` e, quando a flag está ativa, `POST /api/matches/:matchId/goals` com Bearer token.

O [contrato alvo](../docs/architecture/matches-api-v1.openapi.json) usa cookie HttpOnly e inclui SSE. Este backend ainda aceita **somente Bearer token** e não implementa SSE. A Server Action do Next.js possui uma ponte temporária que encaminha o access token ao backend interno quando `MATCH_GOAL_API_ENABLED=true`; ela não abre essa rota ao navegador. Não publicar como API v1 nem ativar a ponte antes de fechar os gates abaixo.

## Execução local

```bash
npm ci
npm run typecheck
npm test
npm run build
```

O container usa `backend/` como contexto: `docker build -f backend/Dockerfile backend`. O Dockerfile do frontend usa a raiz do repositório como contexto.

Para ativar em ambiente descartável, criar `backend/.env` a partir de `.env.example` e configurar uma conexão PostgreSQL privada com um papel dedicado que possa `SET ROLE authenticated`. Nunca usar uma conta superusuária na aplicação. Configurar o Auth local e a chave pública do mesmo ambiente. Testar sessão expirada e isolamento entre peladas antes de liberar tráfego.

A migration `supabase/migrations/351_goal_request_consistency.sql` acrescenta o conteúdo original e o recibo do gol para garantir repetição idempotente mesmo após encerramento. Os eventos anteriores à migration não guardavam minuto solicitado nem placar original; a comparação dos registros antigos cobre os demais campos. O teste SQL em `database/goal-idempotency-*.sql` usa uma base **nova e descartável**.

**Gates ainda abertos:** restauração na stack Supabase auto-hospedada com Auth/Storage e grants, teste do adaptador PostgreSQL com usuários reais, contrato final de cookie/CSRF, SSE e demais operações de partida. O dump atualizado de testes já foi restaurado em PostgreSQL nativo e a migration 351 aplicou sobre o esquema real, mas esse ensaio excluiu Vault e ACL. As duas flags devem permanecer desativadas até os gates de homologação passarem.

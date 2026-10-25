# Backend inicial de partidas

Este serviço ainda é uma fatia **experimental** da migração. As rotas de gol e criação de pelada não são registradas com `ENABLE_GOAL_API=false` e `ENABLE_LEAGUE_API=false` (padrões). O Next.js atual continua usando os fluxos existentes.

O backend cobre gol e a criação inicial de pelada, ainda sem paridade de contexto completo. A arquitetura dos demais fluxos está no [mapa de contextos](../docs/architecture/application-context-map.md), que inventaria as 58 páginas e 41 arquivos de entrada. Cada contexto só passa a ser atendido aqui quando tiver casos de uso, portas, adaptadores, autorização e testes de paridade reais; o catálogo não equivale a uma implementação.

## Limites implementados

- `domain`: valida o comando sem importar Fastify, PostgreSQL ou Next.js.
- `application`: recebe um repositório por interface e a identidade verificada.
- `infrastructure`: verifica o access token no Auth auto-hospedado e invoca a função SQL `register_goal` em transação, usando `SET LOCAL ROLE authenticated` e claims locais.
- `presentation`: `GET /health` e, quando cada flag está ativa, `POST /api/matches/:matchId/goals` ou `POST /api/leagues` com Bearer token.

O [contrato alvo](../docs/architecture/matches-api-v1.openapi.json) usa cookie HttpOnly e inclui SSE. Este backend ainda aceita **somente Bearer token** e não implementa SSE. A Server Action do Next.js possui uma ponte temporária que encaminha o access token ao backend interno quando `MATCH_GOAL_API_ENABLED=true`; ela não abre essa rota ao navegador. Não publicar como API v1 nem ativar a ponte antes de fechar os gates abaixo.

`POST /api/leagues` é uma segunda fatia: normaliza nome/modo/visibilidade, verifica o usuário no Auth local e chama a RPC transacional `create_league_for_user` com claims autenticadas. Peladas rápidas permanecem privadas. Ainda não há ponte no frontend nem teste com a stack auto-hospedada; a rota deve permanecer desativada. Como a RPC não tem chave de idempotência, o cliente não deve fazer retry automático de criação após resposta incerta.

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

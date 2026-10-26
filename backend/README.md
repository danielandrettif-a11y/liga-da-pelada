# Backend inicial de partidas

Este serviço ainda é uma fatia **experimental** da migração. As rotas de gol, peladas, identidade e elenco não são registradas com `ENABLE_GOAL_API=false`, `ENABLE_LEAGUE_API=false`, `ENABLE_IDENTITY_API=false` e `ENABLE_ROSTER_API=false` (padrões). O Next.js usa a ponte modular somente quando a flag correspondente está ativa; sem ela, preserva os fluxos existentes.

O backend cobre o piloto de gol, todas as operações inventariadas dos contextos de peladas (27) e identidade (8), e a primeira operação de elenco (carreira da conta), ainda sem homologação integral das telas. A arquitetura dos demais fluxos está no [mapa de contextos](../docs/architecture/application-context-map.md), que inventaria as 58 páginas e 41 arquivos de entrada. Cada contexto só passa a ser atendido aqui quando tiver casos de uso, portas, adaptadores, autorização e testes de paridade reais; o catálogo não equivale a uma implementação verificada.

## Limites implementados

- `domain`: valida o comando sem importar Fastify, PostgreSQL ou Next.js.
- `application`: recebe um repositório por interface e a identidade verificada.
- `infrastructure`: verifica o access token no Auth auto-hospedado e invoca a função SQL `register_goal` em transação, usando `SET LOCAL ROLE authenticated` e claims locais.
- `presentation`: `GET /health` e, quando cada flag está ativa, `POST /api/matches/:matchId/goals` ou `POST /api/leagues` com Bearer token.

As rotas ficam nos contextos de partidas e peladas; `presentation/app.ts` compõe o servidor. Os adaptadores PostgreSQL compartilham uma transação que aplica `SET LOCAL ROLE authenticated` e os claims do usuário verificado, com rollback em falhas. Há também um **núcleo puro** para a classificação de temporada em `contexts/statistics/domain`; ele ainda não consulta o banco nem atende uma rota e, portanto, não substitui o ranking atual.

O [contrato alvo](../docs/architecture/matches-api-v1.openapi.json) usa cookie HttpOnly e inclui SSE. Este backend ainda aceita **somente Bearer token** e não implementa SSE. A Server Action do Next.js possui uma ponte temporária que encaminha o access token ao backend interno quando `MATCH_GOAL_API_ENABLED=true`; ela não abre essa rota ao navegador. Não publicar como API v1 nem ativar a ponte antes de fechar os gates abaixo.

`POST /api/leagues` normaliza nome/modo/visibilidade, verifica o usuário no Auth local e chama a RPC transacional `create_league_for_user` com claims autenticadas. Peladas rápidas permanecem privadas. O mesmo contexto expõe solicitação privada, entrada aberta, favorito, solicitação por convite, revisão de acesso, inclusão de conta e visibilidade, sempre com identidade obtida do Auth local e operação sob claims autenticadas. Favorito recebe o estado desejado (`{ "favorite": true|false }`) em vez de alternar cegamente, tornando o retry idempotente. A rota de criação respondeu 201 na stack local de testes após aplicar a migration 313, que faltava no dump do projeto de testes. As Server Actions possuem uma ponte temporária habilitada por `LEAGUE_API_ENABLED=true` e `LEAGUE_BACKEND_URL`; ela encaminha o access token apenas no servidor. A ponte deve permanecer desligada fora da homologação local. Como a criação não tem chave de idempotência, o cliente não deve fazer retry automático após resposta incerta.

`GET /api/leagues/:leagueId/config` e os `PATCH` de nome, configuração e pré-temporada formam o segundo recorte. A leitura exige vínculo ativo; as mutações exigem ADM no backend. Mudanças de jogadores por time ou quantidade de times bloqueiam quando existe convocação aberta/bloqueada, com leitura, verificação e gravação na mesma transação para evitar corrida.

`POST /api/quick-match-sessions` valida e cria pelada descartável, convocação e pré-lista em um único comando autenticado. O adaptador mantém a RPC `create_quick_match_session` como fronteira transacional durante a migração; o formato 5×3 é decidido no servidor e não é aceito do cliente.

As rotas `/api/leagues/:leagueId/seasons/*` consultam a temporada ativa, seus ids de rodada e o último snapshot encerrado. O encerramento monta o snapshot e chama `finish_season` sob os mesmos claims, lock e transação PostgreSQL; confirmação, escopo de ADM e pendências são revalidados no servidor.

Estádios possuem CRUD e ordem atômica próprios. A seleção de pelada ativa/arquivada é autorizada no servidor antes de o Next gravar o cookie HttpOnly. Branding usa multipart limitado, PostgreSQL autenticado e Storage via bearer do usuário; configurar `SUPABASE_PUBLIC_URL` com a origem acessível pelo navegador, distinta de `SUPABASE_INTERNAL_URL` quando os serviços usam rede Docker.

`GET /api/identity/accounts` e `PATCH /api/identity/accounts/:userId/role` mantêm as RPCs `list_manageable_accounts` e `manage_account_admin_role` como autoridade. O backend verifica o Bearer token, aplica os claims na transação e nunca aceita papel do chamador informado pelo frontend.

Cadastro, login, logout, recuperação, troca de senha e Google OAuth usam o Auth auto-hospedado por uma porta do contexto de identidade. Cadastro por e-mail, recuperação e OAuth usam PKCE S256: o Next gera um verificador por fluxo, guarda-o em cookie HttpOnly restrito a `/auth/callback`, envia somente o desafio ao backend e consome o verificador uma vez no callback. Tokens retornam apenas na comunicação servidor-a-servidor e são instalados pelo cliente SSR; não são expostos ao componente do navegador. `APP_PUBLIC_URL` define a origem dos callbacks. A URL exata de callback, inclusive os parâmetros usados pelo fluxo, precisa estar na allow-list do Auth local e do ambiente publicado.

A ponte inteira é controlada por `IDENTITY_API_ENABLED`/`IDENTITY_BACKEND_URL` no Next e `ENABLE_IDENTITY_API` no backend. Enquanto desligada, os adaptadores SSR antigos preservam o funcionamento para homologação e rollback.

O smoke descartável [`verify-local-identity.sh`](../scripts/verify-local-identity.sh) cria uma conta confirmada pela API administrativa **local**, valida login, reparo de perfil, recuperação aceita, URL OAuth, senha, logout, novo login e gestão de papéis, e remove a fixture no trap. Ele não substitui a jornada de confirmação: a stack restaurada atual aponta para `supabase-mail`, que não está em execução. Subir/configurar SMTP local e testar o link recebido, além do Google de teste, continua obrigatório antes de marcar identidade como `verified`.

`GET /api/roster/me/career` consulta `get_my_account_career_stats()` dentro de uma transação com os claims da conta verificada e agrega os totais geral, oficial e amistoso no domínio. A ponte do Next usa `ROSTER_API_ENABLED=true` e `ROSTER_BACKEND_URL`; desligada, a Server Action mantém temporariamente o caminho Supabase existente.

Com a stack local e `ENABLE_ROSTER_API=true`, [`verify-local-roster.sh`](../scripts/verify-local-roster.sh) valida a rota com uma conta local somente para leitura e confere o contrato completo da projeção.

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

**Gates ainda abertos:** confirmação real por e-mail/recuperação via SMTP, Google OAuth de teste, jornada das telas com dois ADMs, Storage com arquivos, fluxo positivo de gol pela API HTTP em partida ao vivo, contrato final de cookie/CSRF, SSE e demais operações de partida. Login, troca de senha, logout e gestão de papéis passaram com uma conta temporária no Auth local. O banco de testes foi restaurado na stack auto-hospedada, mas seu dump não continha a RPC de criação de pelada; as migrations 313 e 351 foram aplicadas somente no destino local. A RPC de gol e a repetição idempotente passaram em uma transação revertida com uma partida temporariamente ativa; a rota HTTP retornou 404 corretamente para partida inexistente. As flags devem permanecer desativadas fora da homologação local até os gates passarem.

O ambiente local escolhido e os passos pendentes para subi-lo estão em [`database/LOCAL-HOMOLOGATION.md`](../database/LOCAL-HOMOLOGATION.md).

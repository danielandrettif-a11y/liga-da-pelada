# Plano executável — frontend, backend e PostgreSQL local

**Histórico:** este recorte inicial foi substituído pelo [plano de migração da aplicação inteira](full-application-migration-plan.md), que inclui os 15 contextos, os gates de homologação local e a limpeza final do repositório. Usar o plano novo para acompanhar a execução.

Este plano detalha o ADR 011. O [modelo da aplicação inteira](application-context-map.md) e `architecture/application-contexts.json` registram todos os contextos, páginas e entradas. `npm run audit:contexts` impede que novas páginas ou entradas fiquem sem dono; `npm run audit:architecture -- --json` lista os arquivos ainda ligados a SDK, Auth, Storage e Realtime (busca estática aproximada, não análise de dependências).

**Progresso na branch:** o inventário cobre 15 contextos, 9 módulos, 58 páginas, 41 arquivos de entrada e 267 funções exportadas. Build standalone do frontend testado; backend Fastify tem os pilotos de gol e criação de pelada, ambos desativados por padrão; migration 351 corrige a idempotência de gols novos. O backup atualizado do projeto de testes foi restaurado em PostgreSQL 17 descartável, as contagens principais conferem e a migration 351 aplicou sobre o esquema restaurado. A Server Action de gols possui uma ponte HTTP interna, desativada por padrão e testada sem banco remoto. Os contextos completos estão **modelados, mas ainda não foram implementados no backend**. O ensaio completo na stack Supabase auto-hospedada e a ativação das rotas HTTP permanecem pendentes.

## Mapa da base atual para a organização alvo

| Hoje | Destino | Condição para mover |
| --- | --- | --- |
| `src/app`, `src/components`, `public` | `frontend/` | Imports, testes, build e deploy usam a nova raiz; ações migradas têm API pronta. |
| `src/modules/*/domain` | `backend/src/domain` ou pacote compartilhado de tipos puros | Sem imports de Next, Supabase, DOM ou infraestrutura; contratos preservados. |
| `src/modules/*/application` | `backend/src/application` | Portas explícitas, testes de caso de uso e tradução de erros HTTP. |
| `src/modules/*/infrastructure` | `backend/src/infrastructure` | Adaptadores PostgreSQL/serviços locais com transações e autorização equivalentes. |
| `src/lib/actions/*` | `backend/src/presentation` + cliente em `frontend/` | Cada Server Action só sai após sua rota e fluxos de UI estarem substituídos. |
| `supabase/migrations/*` | `database/baseline` + `database/migrations` | Baseline reproduzível em PostgreSQL 17; dependências de plataforma resolvidas. |
| `src/lib/supabase*` e chamadas diretas no navegador | Cliente HTTP/identidade em `frontend/` | Auth, Storage e eventos locais disponíveis e testados. |

Não mover `src/` inteiro no primeiro commit: isso altera centenas de caminhos sem reduzir uma dependência de runtime e dificulta reverter uma fatia com defeito. Usar uma pasta `frontend/` para o app quando os limites de API já existirem. A organização física deve refletir limites funcionais reais.

## Lotes sugeridos na branch

### Lote 0 — prova de compatibilidade do banco

- Inventariar objetos por migration e obter um dump **anonimizado** do ambiente de teste, incluindo esquema, papéis necessários, dados de referência e objetos de Storage; nunca versionar dump ou segredos.
- Subir PostgreSQL 17 local com volume persistente e executar restauração em base descartável. O backup disponível foi gerado por PostgreSQL 17.6. As migrations novas devem ter runner com tabela de versão, transação por migration e falha explícita; `/docker-entrypoint-initdb.d` serve só para o baseline inicial.
- Comparar contagens e checksums por pelada/temporada, funções `register_goal`/encerramento, RLS, view `player_season_stats`, extensões e permissões. Registrar resultados no repositório.
- Gate: criar uma partida descartável e executar rollback sem diferença de dados.

### Lote 1 — identidade, storage e contratos HTTP

- Definir provedor de identidade local e preservação de IDs de `auth.users`; implementar verificação de sessão no backend antes de abrir rotas mutáveis.
- Migrar avatar/mídias e URLs; validar políticas por usuário e pelada. Preservar login Google, recuperação de sessão e acesso PWA.
- Publicar contrato versionado para erros, idempotência, `matchId`, `leagueId`, snapshot e eventos. CORS, cookies, CSRF e proxy HTTPS devem ser configurados para a origem final.
- Gate: testes com jogador, ADM da pelada, ADM de outra pelada e sessão expirada.

### Lote 2 — gols e placar

- Adicionar `POST /api/matches/:id/goals` no backend, validando corpo e sessão. Adaptar a RPC `register_goal` atual em uma transação com contexto autenticado e recebendo o recibo idempotente. Antes de ativar a rota, acrescentar verificação SQL de payload quando a chave já existir; hoje a RPC retorna o recibo anterior sem conferir o conteúdo.
- Frontend troca apenas o envio de gol para HTTP; conserva a outbox, a chave estável, o placar pendente, retries e reversão atuais de `MatchLiveBoard`.
- Gate: concorrência de dois ADMs, repetição pós-commit, erro de rede após commit, gol contra, assistência, autorização e comparação do placar/eventos com a implementação atual.

### Lote 3 — SSE e encerramento

- Publicar evento somente depois do commit. `GET /api/matches/:id/stream` exige acesso à partida, envia snapshot inicial, `id`, heartbeat e reconexão com recuperação de estado. Um único processo pode usar barramento em memória apenas na prova local; produção usa mecanismo compartilhável derivado do banco.
- Migrar encerramento e correções sem perder recálculo, notificações ou tratamento de efeitos pós-commit. Só remover assinaturas Realtime equivalentes após paridade em celulares simultâneos.
- Gate: espectadores recebem sequência sem perda visível após reconexão e sem vazamento entre peladas; um restart recompõe o snapshot correto.

### Lote 4 — ranking e demais áreas

- Implementar leitor SQL do ranking oficial com as seis melhores rodadas, desempates e filtros existentes. Comparar todos os registros do teste com o resultado atual antes do corte.
- Migrar leituras e mutações restantes por módulo: rodadas/convocação, jogadores, estatísticas, Cartola, pagamentos, cosméticos, notificações e integrações. O inventário deve cair a zero para chamadas Supabase Cloud no runtime.
- Gate: suíte unitária, fluxos Playwright, teste multi-pelada e benchmark de p95 aprovados.

### Lote 5 — organização física e operação

- Mover app Next.js para `frontend/`, backend e scripts SQL para pastas alvo; criar workspaces e builds isolados. Testar caminhos de assets, aliases, service worker, jobs e migrations antes de remover compatibilidade.
- Compose final: PostgreSQL 17 não exposto publicamente, backend, frontend, proxy TLS, health checks, volumes, backup agendado e teste de restore. Secretos em arquivo/gerenciador fora do Git; `.env.example` apenas documenta nomes.
- Gate: instalação limpa e upgrade de versão em VPS de homologação, teste de rollback e observabilidade dos três tempos críticos.

## Ordem de PRs recomendada

Cada lote acima deve ser dividido em PRs pequenos: primeiro contrato/testes, depois adaptador, depois troca do cliente, por fim remoção do caminho antigo. A branch de arquitetura não deve ser implantada como se fosse a migração completa. O corte de tráfego fica restrito ao último lote, depois de backup restaurável e paridade funcional.

# ADR 011 — Separação gradual de frontend e backend com PostgreSQL local

**Estado:** proposta para a branch `codex/architecture-reorganization` (2026-10-24).

## Contexto

O documento `REFACTOR_PROMPT.md` propõe frontend Next.js, backend TypeScript, PostgreSQL 16 na VPS, SSE e Docker Compose. A base atual já usa módulos de domínio/aplicação/infraestrutura, RPCs transacionais no PostgreSQL, uma view de estatísticas, atualização otimista do placar e uma outbox local de gols. Também depende de Supabase Auth, RLS, Storage, PostgREST e Realtime em diversos fluxos. Por isso, mover arquivos ou executar as migrations existentes em um container PostgreSQL vazio não produz uma aplicação funcional. O arquivo `supabase/config.toml` especifica PostgreSQL 17; o backup oficial local de 15/10/2026 declara origem 17.6. O alvo inicial passa a ser **PostgreSQL 17**. Uma mudança para 16 exigiria ensaio separado de exportação lógica e compatibilidade.

## Decisão proposta

Adotar a topologia alvo abaixo, migrando por fatias verticais sem duas fontes de verdade para a mesma operação:

```text
frontend/                    Next.js: telas, estado otimista, EventSource, cliente HTTP
backend/src/domain/          regras puras e entidades para novos fluxos ou regras extraídas
backend/src/application/     casos de uso e portas
backend/src/infrastructure/  PostgreSQL, autenticação, armazenamento e publicação de eventos
backend/src/presentation/    REST/SSE, validação e tradução de erros
database/                    baseline versionado, migrations incrementais e verificação de paridade
deploy/                      Dockerfiles, Compose, proxy, backup e restauração
```

O backend será a única entrada para mutações migradas. A autoridade transacional permanece nas funções SQL existentes até que cada substituição prove paridade de autorização, concorrência, idempotência e resultado. O frontend mantém o comportamento otimista já implementado e passa a chamar a API somente depois que a fatia correspondente estiver pronta.

## Ajustes necessários à proposta original

1. **Banco:** as migrations em `supabase/migrations/` dependem de `auth.users`, `auth.uid()`, papéis, `storage.objects`, grants, RLS e funções de plataforma. `/docker-entrypoint-initdb.d` sozinho não fornece esses objetos. Criar um baseline reexecutável e um plano de exportação/restauração com verificação de dados antes de trocar a conexão. O restore do arquivo existente em 16 não é um caminho suportado; usar 17 para o primeiro ensaio.
2. **Autenticação e arquivos:** escolher e implementar substitutos locais para Auth/OAuth, Storage e políticas antes de remover o Supabase Cloud. Preservar IDs de usuários e URLs/objetos ou migrá-los com tabela de correspondência verificada. O serviço não deve executar SQL como superusuário nem confiar em `userId` fornecido pelo navegador.
3. **Gols:** a função `register_goal` já bloqueia a partida, grava evento/placar e trata retry idempotente. O novo caso de uso deve reutilizá-la inicialmente, com contexto autenticado, e publicar somente após commit. Reescrever a regra no TypeScript antes dessa paridade cria risco de gols duplicados e de autorização.
4. **Ranking:** `player_season_stats` já agrega scouts no banco. A classificação oficial usa as **seis melhores rodadas** e diferencia amistosos, peladas e temporadas. Uma nova query/view deve reproduzir essa semântica; `SUM(points)` não é equivalente. Medir p95 antes de materializar ou duplicar dados.
5. **SSE:** `EventEmitter` em memória serve apenas com uma instância e perde eventos em restart. Para a VPS, começar com uma instância e incluir snapshot inicial, heartbeat, reconexão, autorização por partida e `id` de evento. Preferir publicação derivada de commit no PostgreSQL (outbox/`LISTEN` + `NOTIFY`) antes de escalar réplicas. Um endpoint SSE não substitui automaticamente todos os canais Realtime usados no app.
6. **Latência:** 1 ms de rede interna e 16 ms de feedback visual são hipóteses/objetivos, não garantias. Medir toque→pintura, toque→recibo e commit→espectador separadamente, com carga e 4G simulado.
7. **Operação:** Compose precisa de proxy HTTPS, persistência, backup testado, restauração, migrações de atualização e health checks. Scripts em `/docker-entrypoint-initdb.d` rodam apenas no primeiro volume vazio; não gerenciam upgrades.

## Invariantes de segurança e compatibilidade

- Pelada e temporada sempre fazem parte do escopo de leitura e escrita; um ADM de outra pelada não pode registrar ou excluir gol.
- Retry com a mesma chave nunca duplica evento; chave reutilizada com outro conteúdo é rejeitada.
- Resposta incerta mantém o lance pendente no navegador; rejeição definitiva reverte o placar.
- Correções após partida, estatísticas, Cartola e ranking preservam o contrato atual.
- SSE nunca revela eventos de partida privada a uma sessão sem acesso e envia estado inicial para sanar lacunas de reconexão.
- Dados e anexos só são trocados de origem após backup, restauração e comparação de contagens/checksums.

## Sequência de implementação

1. **Baseline:** congelar contratos existentes e medir caminhos críticos. Mapear SDK, RPC, Auth, Storage, Realtime, jobs, push e integrações externas. Guardar fixtures anonimizadas para paridade.
2. **Banco local em ambiente descartável:** gerar baseline de esquema a partir de um projeto de teste representativo; aplicar migrations posteriores por runner versionado; restaurar cópia anonimizada em PostgreSQL 17; comprovar roles, RLS, funções, views, índices, extensões e integridade. Não apontar a aplicação para o banco vazio.
3. **Identidade e arquivos:** implementar autenticação e storage locais e migrar dados preservando autorização. Trocar primeiro leitores simples sob configuração reversível. Esta etapa define se serviços Supabase auto-hospedados temporários ou substitutos próprios são mais seguros e leves na VPS.
4. **Backend de partidas:** extrair contrato HTTP e adaptar o caso de uso atual à conexão local, mantendo a função SQL como autoridade. Testar dois ADMs concorrentes, retry pós-commit, resposta perdida, gol contra, assistência e acesso entre peladas.
5. **SSE:** publicar gols/encerramento confirmados; expor snapshot + stream autorizado; mudar `MatchLiveBoard` gradualmente; testar reconexão e lacunas. Só então remover os canais Realtime equivalentes.
6. **Ranking:** criar leitor SQL com paridade exata das seis melhores rodadas, filtros e desempates; comparar saída de todas as temporadas do teste; usar `EXPLAIN` e p95 antes de otimização adicional.
7. **Demais módulos e corte:** mover o Next.js para `frontend/`, migrar as ações e leituras restantes por domínio, remover acesso direto ao Supabase no navegador, criar Compose final e fazer ensaio de backup/restore/rollback na VPS.

Cada etapa entrega código executável, testes de contrato, verificação de segurança e opção de retorno. A mudança de DNS/tráfego vem por último.

## Critério de conclusão da refatoração

O frontend só fala com o backend próprio; o backend usa PostgreSQL e serviços locais; não há chamadas ao Supabase Cloud em runtime; todas as funcionalidades atuais passam em testes de fluxo e paridade de dados; Compose sobe do zero a partir de baseline mais migrations; backup e restauração foram ensaiados; métricas de latência mostram ganho real.

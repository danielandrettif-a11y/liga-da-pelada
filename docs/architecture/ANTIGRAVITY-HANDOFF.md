# Handoff para continuar a refatoração no Antigravity

> Atualizado em 29/10/2026 a partir do commit `8915392` da branch
> `codex/architecture-reorganization-continued`.

## Prompt curto para iniciar a sessão

Copie este trecho para o Antigravity e anexe ou indique este arquivo:

```text
Continue a refatoração arquitetural do projeto Liga da Pelada a partir da branch
codex/architecture-reorganization-continued. Leia integralmente
docs/architecture/ANTIGRAVITY-HANDOFF.md, obedeça o AGENTS.md do repositório e use
docs/architecture/REFACTORING.md, architecture/application-operations.json e
architecture/operation-parity-status.json como fontes de estado.

Implemente a nova arquitetura como monólito modular com DDD pragmático, em fatias
verticais completas. Não faça scaffolding vazio de todos os contextos, não remova o
código legado, não mude regras funcionais e não marque uma operação como aceita sem
comparar o fluxo antigo e cobri-lo com testes. Comece por Notifications, pois ele
deve absorver Web Push, inbox, preferências e jobs que ainda são efeitos temporários
do Next. Preserve assinaturas públicas das Server Actions e mantenha feature flags
desligadas por padrão até a homologação local.

Antes de editar, confirme branch, HEAD, árvore limpa e baseline de testes. Ao
terminar cada fatia, rode todos os gates descritos no handoff, documente decisões,
liste operações cobertas, riscos e pendências e produza um commit pequeno e
revisável. Não importe dados reais, não use Supabase de produção e não faça a
limpeza final do repositório nesta etapa.
```

## 1. Objetivo real

Refatorar **toda a aplicação**, não apenas criar entidades de domínio ou reorganizar
pastas. Cada operação ativa deve sair do acoplamento direto entre Next.js e Supabase
e passar por uma fronteira explícita de contexto:

```text
interface Next / Server Action fina
  -> cliente HTTP interno
  -> rota Fastify autenticada
  -> caso de uso da aplicação
  -> porta
  -> adaptador PostgreSQL/Auth/Storage/serviço externo
```

O destino é um **monólito modular com DDD pragmático**, não microserviços. Regras
puras ficam no domínio; coordenação e portas ficam na aplicação; PostgreSQL,
Supabase auto-hospedado e integrações ficam na infraestrutura; Fastify traduz HTTP
na apresentação. O Next continua responsável por telas, formulários, estado de UI,
cache e efeitos próprios da interface.

Uma operação só está pronta quando o comportamento antigo foi preservado, a rota e
o gateway estão conectados à interface, autorização/transação foram verificadas e
os testes de paridade passaram. Criar diretórios ou interfaces sem conectar o fluxo
não conta como progresso.

## 2. Estado exato de onde paramos

- Branch de base: `codex/architecture-reorganization-continued`.
- Commit de referência: `8915392 Complete match timer parity`.
- Inventário total: **267 operações**, 15 contextos, 58 páginas e 41 entradas.
- Estruturais/conectadas ao frontend: **150/267**.
- Aceitas após revisão de paridade: **150/267 — 56,2%**.
- Pendentes de paridade: **117**.
- Verificadas em jornada integrada: **0/267**. As flags seguem desligadas fora da
  homologação local.
- Último gate aprovado: **1.043 testes frontend em 200 arquivos** e **359 testes
  backend em 100 arquivos**, typecheck e builds dos dois projetos, auditorias de
  arquitetura/contextos/migração e `npm audit --omit=dev` sem vulnerabilidades.
- A árvore estava limpa e sincronizada com o remoto ao concluir `8915392`.

Contextos aceitos em revisão:

| Contexto | Aceitas |
| --- | ---: |
| Identity | 8/8 |
| Leagues | 27/27 |
| Roster | 35/35 |
| Callups | 21/21 |
| Rounds | 38/38 |
| Matches | 21/21 |

Contextos restantes:

| Ordem recomendada | Contexto | Operações |
| ---: | --- | ---: |
| 1 | Notifications | 16 |
| 2 | Statistics | 22 |
| 3 | Fantasy | 22 |
| 4 | Finance | 19 |
| 5 | Cards | 15 |
| 6 | Cosmetics | 11 |
| 7 | Collective | 8 |
| 8 | Integrations | 2 |
| 9 | Operations | 2 |
|  | **Total restante** | **117** |

Alguns textos de planejamento ainda mostram 145/267 ou partidas 16/21 porque
registram o estado de um lote anterior. Para números atuais, execute sempre:

```powershell
npm run audit:migration
```

Não edite contadores manualmente para aparentar avanço.

## 3. Fontes de verdade que devem ser lidas antes de editar

1. `AGENTS.md` — a versão de Next possui mudanças incompatíveis. Antes de alterar
   código Next, leia a documentação relevante em `node_modules/next/dist/docs/`.
2. `docs/architecture/REFACTORING.md` — diário dos lotes e estado revisado.
3. `docs/architecture/full-application-migration-plan.md` — ordem global, gates,
   homologação, limpeza e VPS. Os números iniciais são históricos.
4. `docs/architecture/application-context-map.md` — propriedade de regras e dados.
5. `architecture/application-contexts.json` — páginas, módulos e entradas por
   contexto.
6. `architecture/application-operations.json` — as 267 operações inventariadas.
7. `architecture/operation-migration-status.json` — destino/evidência estrutural.
8. `architecture/operation-parity-status.json` — operações explicitamente aceitas.
9. `docs/architecture/adr-001-*.md` até `adr-011-*.md` — decisões vigentes.
10. `database/LOCAL-HOMOLOGATION.md` e `database/PRODUCTION-MIGRATION.md` — banco,
    restore e corte. Produção é apenas a última etapa.

Se documentação e código divergirem, não escolha silenciosamente. Confirme o
comportamento do fluxo legado, os testes e as migrations; corrija o documento no
mesmo lote ou registre a divergência.

## 4. Arquitetura e regras que não devem ser redesenhadas

### 4.1 Camadas por contexto

```text
backend/src/contexts/<context>/
  domain/          invariantes, entidades e valores puros
  application/     casos de uso, comandos/consultas e interfaces das portas
  infrastructure/  PostgreSQL, Auth, Storage, QStash, Resend, Web Push etc.
  presentation/    rotas Fastify, parsing e tradução de erros

src/modules/<context>/
  domain/          tipos/regras puros ainda compartilhados com a interface
  application/     composição fina do lado da interface, quando necessária
  infrastructure/  gateway HTTP e criação da sessão da API

src/lib/actions/ ou src/app/**/actions.ts
  compatibilidade de interface, autenticação SSR, revalidação e efeitos de UI
```

- `domain` e `application` do backend não importam Next, Fastify, DOM, cliente
  Supabase ou PostgreSQL.
- Rotas não contêm regra esportiva/financeira; validam transporte, autenticam e
  chamam casos de uso.
- O gateway HTTP não replica regra de negócio.
- Preserve a assinatura pública e o formato de resposta das Server Actions durante
  a transição para não quebrar componentes.
- Não faça abstrações genéricas prematuras. Copie o padrão comprovado de um contexto
  aceito e extraia algo compartilhado somente quando houver repetição real.

### 4.2 Autoridade, segurança e escopo

- O ator vem exclusivamente do token/cookie verificado no backend. Nunca confie em
  `userId`, papel de ADM ou pelada enviados pelo navegador como autoridade.
- Toda leitura e mutação de contexto de pelada deve limitar o alvo pelo `leagueId`
  da rota e verificar membership/ADM no servidor.
- Preserve RLS e RPCs SQL como autoridade para transações complexas. Não substitua
  RPC por vários `INSERT`/`UPDATE` em TypeScript sem provar autorização,
  concorrência, atomicidade, retry e resultado equivalentes.
- Use conexão PostgreSQL limitada com `SET LOCAL ROLE authenticated` e claims
  locais. Nunca use superusuário na aplicação.
- Rotas de jobs internos exigem segredo próprio e validação constante. Segredos,
  dumps, tokens e dados pessoais nunca entram no Git ou na conversa.
- Inclua testes de membro, ADM da pelada, ADM de outra pelada, sessão vencida e
  identificador de recurso pertencente a outra pelada.

### 4.3 Transações, idempotência e efeitos

- O comando confirma primeiro a alteração autoritativa. Efeitos derivados entre
  contextos acontecem depois do commit e precisam ser idempotentes.
- Falha depois do commit não pode instruir o usuário a repetir cegamente uma
  mutação já confirmada. Retorne sucesso com aviso quando esse for o contrato legado.
- Operações suscetíveis a resposta incerta usam chave de idempotência ou recibo
  consultável.
- Preserve locks e restrições das RPCs existentes.
- Eventos representam fatos confirmados. Não publique `MatchFinished`,
  `RoundFinished`, pagamento ou recompensa antes do commit.

### 4.4 Feature flags e rollback

- Cada contexto migrado mantém flag no Next e flag de registro no backend.
- Flags ficam desligadas por padrão até teste local.
- Com a flag desligada, o caminho legado continua disponível.
- Com a flag ligada, erro da API **não pode cair silenciosamente** no caminho
  Supabase legado, pois isso pode duplicar comandos.
- Gateway encaminha access token somente servidor-a-servidor.
- A remoção das flags e do legado ocorre apenas no lote final, depois da homologação
  completa.

## 5. Exemplos que representam o padrão atual

Use os contextos completos como referência, sem copiá-los cegamente:

- Caso de uso/porta: `backend/src/contexts/matches/application/manage-matches.ts`.
- PostgreSQL escopado: `backend/src/contexts/matches/infrastructure/pg-match-repository.ts`.
- Integração externa por porta: `backend/src/contexts/matches/infrastructure/qstash-match-timer-scheduler.ts`.
- Rotas: `backend/src/contexts/matches/presentation/matches-route.ts`.
- Composição: `backend/src/presentation/app.ts` e `backend/src/server.ts`.
- Gateway do Next: `src/modules/matches/infrastructure/http-match-gateway.ts`.
- Seleção por flag/sessão: `src/modules/matches/infrastructure/match-api-session.ts`.
- Ponte temporária: `src/lib/actions/matches.ts`.
- Testes verticais: os arquivos `.test.ts` correspondentes em backend, módulo e
  Server Action.

Também consulte `rounds`, `callups`, `roster`, `leagues` e `identity` quando o novo
contexto tiver problema semelhante. O diretório
`backend/src/contexts/statistics/domain` contém apenas parte de um núcleo puro;
isso **não significa** que Statistics esteja migrado.

## 6. Próxima fatia: Notifications

Notifications deve ser o próximo contexto porque Web Push e jobs ainda estão
temporariamente no Next e já são consumidos pelo cronômetro de Matches. A migração
deve preservar as 16 operações inventariadas:

- Inbox: `getMyInboxNotifications`, `getMyInboxPreview`, `markInboxRead`.
- Preferências/status: `getNotificationPreferences`, `getPushPublicKey`,
  `getPushSystemStatus`, `updateNotificationPreferences`.
- Assinatura push: `subscribeToPush`, `unsubscribeFromPush`.
- Testes administrativos: `sendPushTest`, `sendCartolaEmailTest`.
- Lembretes: `setCartolaRemindersEnabled`, `cancelCartolaEmailReminders`.
- Jobs internos: `POST /api/internal/cartola-reminder`,
  `POST /api/internal/match-timer-alert` e `POST /api/internal/push-test-alert`.

Entradas legadas a revisar integralmente:

```text
src/lib/actions/inbox.ts
src/app/mais/notification-actions.ts
src/app/mais/notificacoes/cancelar/actions.ts
src/app/api/internal/cartola-reminder/route.ts
src/app/api/internal/match-timer-alert/route.ts
src/app/api/internal/push-test-alert/route.ts
src/lib/push-notifications.ts
src/lib/match-timer-scheduler.ts
```

Resultado esperado desta fatia:

1. Criar `backend/src/contexts/notifications/{domain,application,infrastructure,presentation}`
   apenas com artefatos usados por fluxos implementados.
2. Definir portas distintas para persistência de inbox/preferências/assinaturas,
   entrega Web Push, entrega de e-mail e agendamento quando necessário.
3. Manter chaves VAPID, Resend e QStash somente em infraestrutura/composição.
4. Mover reivindicação/entrega/liberação dos alertas para o contexto Notifications,
   mantendo a trava transacional já implantada em Matches ou criando contrato
   explícito entre os contextos; não duplicar a autoridade da trava.
5. Expor rotas autenticadas para usuário/ADM e rotas internas protegidas por
   segredo para jobs.
6. Criar gateway HTTP e session factory do contexto no Next.
7. Tornar as Actions finas e preservar suas respostas atuais.
8. Cobrir preferência desabilitada, assinatura inválida, nenhuma assinatura,
   entrega parcial, retry, cancelamento e job duplicado.
9. Não misturar neste lote regras completas de Fantasy; o lembrete pode depender
   de uma porta/projeção explícita até Fantasy ser migrado.

Se Notifications ficar grande demais para um único diff, divida nesta ordem:

1. inbox + leitura;
2. preferências + assinatura push;
3. entrega push + testes;
4. lembretes/e-mail + jobs internos;
5. integração definitiva com os alertas de Matches.

## 7. Sequência depois de Notifications

### Statistics — 22 operações

Migrar scouts, política de pontuação, ranking oficial, seis melhores rodadas,
overall, histórico, dashboard e reprocessamento. Preservar filtros, desempates e
temporada. Comparar resultados completos com o banco restaurado antes de otimizar.

### Fantasy — 22 operações

Migrar mercado, escalação, carteira, preços, processamento, ranking e históricos.
Consumidores de eventos devem ser idempotentes; replay não pode pontuar ou pagar
duas vezes. Não misturar Cards/Cosmetics no agregado de Fantasy.

### Finance — 19 operações

Migrar cobranças, PIX, despesas, parcelas, destinatários, obrigações e auditoria.
Valores, arredondamentos, status e idempotência têm prioridade sobre reorganização
de código.

### Cards e Cosmetics — 26 operações

Manter inventários e ativações separados. Pacotes, cartas, recompensas e itens de
passe não podem duplicar em retry/replay. Operações de teste/admin precisam de
autorização explícita.

### Collective — 8 operações

Preservar publicação, edição, exclusão, paginação, leitura e isolamento por pelada.
Se houver atualização em tempo real, banco/snapshot continuam como fonte de verdade.

### Integrations e Operations — 4 operações

Isolar BQ Manager/credenciais externas por portas e migrar observabilidade sem
permitir que payload do cliente escolha identidade ou escopo. Métricas não devem
quebrar o fluxo principal quando o coletor estiver indisponível.

## 8. Método obrigatório para cada fatia

1. **Inventariar:** localizar a operação em `application-operations.json`, todos os
   consumidores, consultas/RPCs, tabelas, migrations, efeitos e respostas.
2. **Congelar o legado:** criar ou ajustar testes que descrevem sucesso, erros,
   autorização, transação e efeitos pós-commit antes de trocar o caminho.
3. **Modelar o mínimo:** domínio apenas onde há invariantes; application com caso de
   uso e portas explícitas. Não criar classes cerimoniais sem regra.
4. **Implementar infraestrutura:** PostgreSQL/RPC/serviço externo com escopo e
   transação equivalentes.
5. **Expor a rota:** parsing, autenticação, erros e status HTTP consistentes.
6. **Conectar o frontend:** gateway, session factory e Action fina; manter fallback
   somente quando a flag estiver desligada.
7. **Testar verticalmente:** domínio, aplicação, repositório, rota, gateway e Action.
8. **Auditar:** atualizar evidências e documentação no mesmo lote, mas só adicionar
   a `operation-parity-status.json` o que foi realmente comparado com o legado.
9. **Entregar:** diff pequeno, mensagem de commit descritiva, riscos e próxima fatia.

Não tente implementar as 117 operações em um único diff. Não crie nove contextos
vazios para depois preencher. Uma fatia vertical executável é mais valiosa e mais
revisável que uma estrutura completa sem comportamento.

## 9. Gates de validação

Execute no mínimo ao terminar cada fatia:

```powershell
# raiz / frontend
npm run typecheck
npm test
npm run build
npm run audit:architecture
npm run audit:contexts
npm run audit:migration
npm run audit:db-archive
npm audit --omit=dev --audit-level=high

# backend
Set-Location backend
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Quando houver banco local disponível, também executar os smokes do contexto, teste
multi-pelada e jornadas com duas contas. Não marcar `verified` usando apenas mocks.

O relatório final da fatia deve informar:

- operações cobertas e contagem do contexto;
- testes/arquivos aprovados;
- mudanças de schema/migrations;
- flags necessárias;
- diferenças conhecidas do legado;
- riscos e testes manuais pendentes;
- total exato retornado por `npm run audit:migration`.

## 10. Banco e dados

- O alvo local inicial é a stack Supabase auto-hospedada/PostgreSQL 17, pois o
  esquema depende de `auth.users`, RLS, papéis e Storage.
- Existem 358 migrations SQL inventariadas. Numeração de arquivo não prova que uma
  migration foi aplicada; compare catálogo e esquema.
- Novas mudanças de banco são migrations incrementais, repetíveis e revisáveis.
- Não altere migrations históricas já aplicadas e não apague migrations nesta fase.
- Dumps ficam fora do Git e devem ser anonimizados.
- Não conecte ao banco real de produção durante a refatoração.
- A importação real só ocorre depois da homologação local completa, backup/restore
  comprovados e autorização explícita, seguindo `database/PRODUCTION-MIGRATION.md`.

## 11. O que não fazer agora

- Não mover o Next inteiro para `frontend/` num commit mecânico misturado com regra.
- Não remover Server Actions, adaptadores Supabase, flags ou pastas antigas.
- Não limpar o repositório antes de todas as áreas passarem no aceite local.
- Não alterar regra de pontuação, ranking, cobrança, pacote ou recompensa para
  “simplificar” a migração.
- Não criar microserviços, event bus distribuído ou abstrações genéricas sem
  necessidade demonstrada.
- Não usar Supabase Cloud/produção para testes.
- Não versionar `.env`, backup, chaves VAPID, tokens QStash/Resend ou senhas.
- Não usar `git reset --hard`, não sobrescrever mudanças do usuário e não fazer
  merge/push destrutivo.
- Não declarar a refatoração concluída por typecheck ou testes unitários isolados.

## 12. Limpeza e conclusão global

A limpeza solicitada pelo proprietário é o **último lote**. Ela só começa quando:

1. 267/267 operações possuem destino ou retirada justificada;
2. os contextos ativos usam exclusivamente o novo caminho com flags locais ligadas;
3. jornadas completas passaram no Docker local com Auth, Storage, jobs e banco
   restaurado;
4. backup e restore do destino foram testados;
5. não há chamadas involuntárias ao Supabase Cloud em runtime;
6. a matriz de segurança multi-pelada e os testes de resiliência passaram.

Depois disso, remover o legado por contexto em commits separados, rodar a matriz
completa novamente em checkout limpo e só então preparar VPS e importação real.

## 13. Checklist de início para o Antigravity

```powershell
git checkout codex/architecture-reorganization-continued
git pull --ff-only
git status --short
git log -1 --oneline
npm run audit:migration
npm run audit:contexts
```

O HEAD deve ser `8915392` ou um descendente explícito. Se houver alterações locais,
divergência de branch, falha no baseline ou instrução conflitante, pare e relate em
vez de resetar ou sobrescrever arquivos.

Ao iniciar código Next, leia a documentação local exigida pelo `AGENTS.md`. Ao tomar
uma decisão arquitetural nova, registre um ADR curto com contexto, opções,
consequências e motivo; não reabra ADRs existentes sem evidência concreta.

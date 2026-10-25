# Modelo da aplicação inteira para a nova arquitetura

**Estado:** modelo de destino e inventário verificável; a implementação completa do backend ainda não foi feita. O backend executável atual cobre registro de gol e criação inicial de pelada, ambos desativados por padrão. Os módulos em `src/modules/` já contêm regras de domínio e casos de uso que devem ser preservados, extraídos e conectados às novas portas.

O contexto de estatísticas já possui um núcleo puro de ranking no backend, com limite das seis melhores rodadas e filtro de atividade recente. Ainda faltam leitura autorizada, perfil competitivo, histórico, enriquecimentos, resposta HTTP e troca do frontend. A homologação escolhida será [local com Docker/WSL2](../../database/LOCAL-HOMOLOGATION.md).

O catálogo em [`architecture/application-contexts.json`](../../architecture/application-contexts.json) atribui cada módulo existente, página, arquivo de Server Actions e endpoint interno a **um** contexto. [`application-operations.json`](../../architecture/application-operations.json) enumera as funções exportadas individualmente. `npm run audit:contexts` falha se surgir um item sem dono ou se uma função exportada mudar sem revisão do catálogo. Em 25/10/2026, ele cobre 15 contextos, 9 módulos, 58 páginas, 41 arquivos de entrada e 267 funções exportadas. Isso mede cobertura do **inventário**, não paridade de implementação.

## Limites e propriedade

| Contexto | Raízes de agregado | Comandos e leituras principais | Tabelas próprias ou fonte de verdade |
| --- | --- | --- | --- |
| Identidade e acesso | Account, AdminRole | login, Google OAuth, redefinição, cadastro, papéis globais | `auth.users`, `account_profiles`, `admin_role_audit` |
| Peladas | League, Membership, Season, Stadium | criar/entrar, convites, pedidos de acesso, configuração, temporadas, estádios | `leagues`, `league_members`, `league_invites`, `league_join_requests`, `seasons`, `stadiums`, `ranking_rules` |
| Elenco | Player, PlayerIdentity, FitnessRecord | cadastrar/mesclar jogador, perfil, presença, aptidão, velocidade, privacidade | `players`, `player_registration_events`, `player_round_fitness`, `player_admin_attributes`, `player_private_balance_tags` |
| Convocações | Callup, CallupEntry, ReplacementSlot | abrir, convidar, confirmar, fila, retirar, fechar, preparar pré-lista | `callups`, `callup_entries`, `callup_withdrawals`, `callup_invite_access`, `callup_replacement_slots` |
| Rodadas e times | Round, Team, TeamDraft | criar, sortear, draft, alterar escalação, iniciar e encerrar rodada | `rounds`, `round_players`, `teams`, `team_players`, `team_drafts` e itens do draft |
| Partidas | Match, MatchEvent, MatchLineup | criar, iniciar, gol, substituição, goleiro, relógio, corrigir e encerrar | `matches`, `match_events`, `match_players`, `match_substitutions`, `match_goalkeepers`, `match_goalkeeper_stints` |
| Estatísticas | RoundStatistics, ScoringPolicy, OverallCalculation | calcular scouts, ranking, seis melhores rodadas, overall, reprocessar | `player_round_stats`, overrides, versões e snapshots de overall |
| Cartola | FantasySeason, FantasyRound, Lineup, Portfolio | mercado, escalar, pontuar, consultar ranking e histórico | `fantasy_settings`, `fantasy_seasons`, `fantasy_rounds`, `fantasy_lineups`, preços, portfolios |
| Cartas | Pack, CardInventory, CardActivation | distribuir/abrir pacote, resgatar e ativar carta | `fantasy_cards`, `fantasy_round_packs`, `fantasy_user_cards`, `fantasy_card_activations` |
| Cosméticos | CosmeticInventory, Loadout, SeasonPass | comprar/resgatar, equipar, progresso do passe | `fantasy_cosmetics`, propriedade, loadouts, passe e recompensas |
| Financeiro | RoundPayment, ExpenseItem, PaymentObligation, Recipient | cobrar, registrar pagamento, despesas, parcelas, PIX e auditoria | `round_payments`, `round_payment_audit`, `round_payment_obligations`, despesas e destinatários |
| Coletiva | CollectiveRoom, Message | publicar, editar, excluir e marcar leitura | `collective_messages`, `collective_reads` |
| Notificações | Inbox, NotificationPreference, Delivery | inbox, push, lembretes e cancelamento | `user_inbox_notifications`, `push_subscriptions`, preferências e entregas |
| Integrações | ManagerSourceLeague | sincronização BQ Manager e fontes externas | `manager_source_league`; outro projeto Supabase tem credenciais próprias |
| Operação | PerformanceEvent | observabilidade e métricas | `app_performance_events` |

O catálogo JSON contém os caminhos exatos. As tabelas acima indicam **propriedade de regra e escrita**, não proíbem projeções de leitura entre contextos. Alterações ao esquema devem atribuir cada nova tabela a um contexto e declarar explicitamente qualquer relacionamento cruzado.

## Regras de implementação por camada

```text
frontend/                 telas, formulário, cache, estado otimista e cliente HTTP/SSE
backend/src/contexts/X/
  domain/                 agregado, valores e invariantes puros
  application/            comandos/consultas, portas e política de autorização
  infrastructure/         PostgreSQL, Auth, Storage, e-mail e event bus
  presentation/           rotas, validação de entrada e tradução de erros
backend/src/shared/       identidade verificada, escopo da pelada, transação e eventos
database/                 baseline, migrations e testes de paridade
deploy/                   Compose, proxy, backups e restauração
```

- **Identidade:** cada comando recebe `actor` do token ou cookie verificado no backend. O cliente não escolhe `userId`, papel ou pelada autorizada. O escopo `leagueId` é validado contra membership e contra a função SQL/RLS enquanto as RPCs existentes forem autoridade.
- **Transações:** somente o contexto proprietário altera suas tabelas. A função SQL atual continua como adaptador transacional onde há regras complexas ou concorrência; migrar a lógica para TypeScript exige teste de paridade, bloqueios e retry equivalentes. `Round` coordena resultados de partidas, scouts, Cartola e pagamentos através de eventos pós-commit ou comandos idempotentes; não faz várias gravações parcialmente confirmadas no frontend.
- **Eventos:** `GoalRegistered`, `MatchFinished`, `RoundFinished`, `CallupChanged`, `LineupSaved`, `PaymentRecorded` e `CardGranted` representam fatos **depois** do commit. Uma outbox no banco permite reentrega e consumidores idempotentes. SSE lê um snapshot autorizado e recebe eventos por partida; uma fila em memória sozinha não é fonte de verdade.
- **Leituras:** ranking, dashboard, Cartola e perfil usam modelos de leitura separados, com `leagueId` e `seasonId` explícitos. A classificação oficial preserva seis melhores rodadas e desempates atuais; uma soma simples de pontos não substitui o contrato.
- **Dependências externas:** Google Auth, Storage, QStash, Resend, Web Push e BQ Manager entram por portas de infraestrutura. Na primeira etapa, Auth/Storage/PostgREST/Realtime podem ser Supabase auto-hospedados; o backend próprio passa a controlar cada fluxo antes de retirar esses serviços.

## Operações entre contextos que exigem contrato explícito

| Fluxo | Autoridade transacional | Efeito derivado / consumidor | Prova antes da troca |
| --- | --- | --- | --- |
| Convocação → rodada | `Callup` reserva vagas e fecha lista; `Round` cria times | Cartola abre rodada; lembretes são enfileirados | concorrência, fila, isolamento de peladas |
| Partida → scouts | `Match` grava evento, placar e encerramento | `Statistics` recalcula; `Fantasy` pontua; `Notifications` avisa | retry, correções pós-commit, equivalência de pontos |
| Rodada → financeiro | `Round` confirma encerramento | `Finance` cria obrigações e linhas de cobrança | idempotência e soma de valores |
| Rodada → cartas/passe | `Fantasy` confirma resultado | `Cards` gera pacotes; `Cosmetics` credita progressão | nenhuma recompensa duplicada em replay |
| Conta → jogador | `Identity` autentica; `Roster` vincula perfil | demais contextos referenciam IDs estáveis | merge de convidado e login após migração |
| Partida → espectadores | `Match` confirma estado no banco | stream autorizado envia snapshot e fatos | reconexão, restart, acesso a outra pelada |

## Ordem para completar o backend

1. Estabelecer `shared` (ator, escopo da pelada, transações, erros, outbox) e contratos HTTP versionados para os 15 contextos. O frontend não deve importar implementações de banco.
2. Migrar identidade/peladas e elenco, pois todos os outros comandos dependem de autorização e perfis. Preservar Auth e Storage auto-hospedados no primeiro corte de infraestrutura.
3. Migrar convocações, rodadas/draft, partidas completas e estatísticas. As fatias de gol e criação de pelada são pilotos; em partidas faltam início, correção, encerramento e timer, além de SSE.
4. Migrar Cartola, cartas, cosméticos e financeiro mantendo os acoplamentos acima idempotentes. Depois, coletiva, notificações, BQ Manager e operação.
5. Mover o Next para `frontend/`, retirar cada uso de Supabase SDK somente quando seu contrato no backend tiver paridade, e provar os fluxos com uma restauração real de teste. O corte de produção segue [`database/PRODUCTION-MIGRATION.md`](../../database/PRODUCTION-MIGRATION.md).

**Critério de pronto de cada contexto:** comandos, consultas, autorização, transações, migrações, testes de contrato e fluxo, eventos, observabilidade e rollback. O contexto só sai da lista de pendências quando o frontend usa exclusivamente a nova API para aquela área. O inventário deve chegar a zero usos do Supabase Cloud em runtime antes do corte final.

# Descobertas e Auditoria Técnica de Performance (Findings — Parte 1/3)

## 1. Gargalos de Navegação & Percepção de Velocidade
- **Ausência de Loading States (`loading.tsx`)**: O projeto possuía apenas um `loading.tsx` genérico na raiz (`src/app/loading.tsx`). As rotas críticas (`/rodadas`, `/rodadas/[id]`, `/ranking`, `/jogadores`, `/jogadores/[id]`, `/partidas/[id]`, `/mais`, `/cartola`, `/convocacao`, `/pagamentos`) não tinham arquivo `loading.tsx` individual. Como consequência, ao clicar em qualquer link da `BottomNav` ou cards, a tela permanecia congelada na página anterior até que o Server Component terminasse de renderizar completamente.
- **Feedback Tátil Lento no BottomNav**: A `BottomNav` dependia exclusivamente de `usePathname()` para atualizar o estado ativo. Durante navegações em Server Components com queries ao banco, o usuário não recebia feedback visual imediato (<100ms) de que o clique foi registrado.
- **SessionBottomNav no Layout Raiz**: `src/components/SessionBottomNav.tsx` é renderizado dentro do `RootLayout` e executava 4 queries (`getCurrentAccount`, `getActiveCallup`, `hasReleasedPaymentRound`, `getRosterUnreadState`) de forma bloqueante sem isolamento granular de erro.

## 2. Over-fetching e Consultas Sequenciais
- **Perfil do Jogador (`/jogadores/[id]`)**: Para renderizar uma única página de jogador, a Server Action chamava `getPlayersWithStats("official")` e `getPlayersWithStats("friendly")`. Isso disparava 10 queries ao banco, carregando todas as presenças, estatísticas e registros de todos os atletas da liga apenas para filtrar `officialAll.find(item => item.id === id)`.
- **Chamadas Sequenciais de Liga/Temporada**: Funções como `getRounds` executavam `await getActiveLeague()` seguido de `await getActiveSeason(league.id)`, gerando round-trips sequenciais desnecessários.

## 3. Diretivas de Cache e Dynamic Rendering
- Todas as páginas principais continham `export const revalidate = 0` ou `export const dynamic = "force-dynamic"`, forçando re-renderização total e nova execução de todas as queries a cada clique, sem reaproveitamento de dados imutáveis (ex: rodadas finalizadas, jogadores estáticos, rankings consolidados).

## 5. Auditoria de Queries & Supabase (Parte 2/3)
- **Node.js como Banco de Dados Intermediário**: A aplicação realizava o download de milhares de linhas brutas de `player_round_stats` para agregar com `Map`, `reduce` e `sort` no servidor Next.js, gerando payloads pesados (~200–500 KB) e alto consumo de CPU.
- **Falta de Views e Funções**: Todas as 48 migrations anteriores não possuíam nenhuma VIEW ou FUNCTION para cálculo de ranking. Toda agregação era executada em JavaScript.
- **Ausência de Índices Compostos**: Tabelas como `player_round_stats(round_id, player_id)`, `match_events(player_id, event_type)`, `team_players(player_id)`, `round_players(player_id)` e `matches(round_id, status)` não possuíam índices compostos para filtrar os joins frequentes.
- **Over-fetching por `select("*")`**: Consultas em `getRound`, `getMatch`, `getRounds` e `getPlayer` requisitavam todas as colunas em múltiplos níveis de join.

## 7. Diagnóstico do Jogo Ao Vivo (Parte 3/3)
- **Race Condition no Placar (Read-Modify-Write Inseguro)**: Anteriormente, `registerGoal` e `deleteEvent` liam o placar atual via `getMatchState()`, calculavam o incremento/decremento em JavaScript no Node.js e gravavam de volta com `UPDATE matches SET score_a = ...`. Em partidas com múltiplos operadores/árbitros ou conexões instáveis, isso provocava perda de gols ou contagem incorreta por race condition.
- **Múltiplos Round-Trips Sequenciais por Gol**: Cada clique em "Gol" disparava 4 requisições sequenciais ao Supabase (`getMatchState`, query de verificação em `match_players`, `INSERT` em `match_events`, `UPDATE` em `matches`), acumulando ~350ms a ~550ms de latência.
- **Re-render Global a Cada Segundo pelo Timer**: O `setInterval` do cronômetro residia no corpo principal do `MatchLiveBoard`, disparando re-renderizações desnecessárias em toda a árvore React (placar, botões de ação, timeline de eventos, modal de gol, manager de substituição) a cada 1000ms.
- **Vulnerabilidade a Duplo Toque (Double Tap)**: Sem idempotency keys, toques rápidos ou flutuações de rede podiam submeter o mesmo gol múltiplas vezes.

## 8. Soluções Implementadas na Parte 3/3
- **RPCs Transacionais Atômicas (`register_goal` e `delete_match_event`)**: Criadas na migration `047` com `SELECT FOR UPDATE` para bloqueio de linha, validações de integridade, idempotência, `INSERT`/`DELETE` em `match_events` e `UPDATE` no placar em uma única transação atômica no banco de dados.
- **Chave de Idempotência (`idempotency_key`)**: Adicionada à tabela `match_events` com índice único parcial, prevenindo duplicações de gols em casos de retry ou duplo clique.
- **Optimistic UI com Rollback Seguro**: O placar e a timeline atualizam instantaneamente (<10ms) ao registrar ou deletar gols, com reversão automática e segura do estado caso a requisição ao servidor falhe.
- **Isolamento do `MatchTimer` via `memo`**: O cronômetro foi desacoplado em um componente memoizado independente, eliminando re-renderizações na timeline e no placar a cada segundo.
- **Proteção contra Duplo Toque via `useRef`**: Bloqueio de submissão simultânea de gols e exclusões de eventos.
- **Suporte Abrangente a `prefers-reduced-motion`**: Adicionado ao `globals.css` para desativar ou acelerar instantaneamente animações pesadas para usuários sensíveis a movimento.



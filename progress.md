# Progresso da Implementação: Pontuação BQ v5 e Sorteio por Velocidade

---

## Reorganização de Arquitetura: auditoria após sincronização de 28/10/2026

- A branch contém pontes para 150/267 operações (56,2%), mas o lote operacional novo ainda não foi homologado como paridade funcional.
- **126/267 operações (47,2%)** estão aceitas na revisão de código; nenhuma operação do catálogo está em `verified` de ponta a ponta.
- Convocações passaram na revisão de paridade (21/21). Rodadas avançaram para 35/38 operações aceitas; partidas continuam na fila antes da ativação local das flags.
- Correções desta auditoria: sessão obrigatória segundo a RLS atual, fallback legado sem token, contrato e pré-lista atômica na abertura da convocação, RPCs canônicas sem fallback SQL parcial, composição fail-fast de partidas e typecheck reproduzível.
- O sorteio de times, as regras de presença/formato/substituição, os leitores completos, a pré-lista, a criação, a exclusão, o encerramento, o Draft e o equilíbrio adaptativo agora preservam o contrato legado pelo backend. Restam 117 operações sem ponte estrutural e 24 pontes para revisão de paridade: **141 operações ao todo** para chegar ao mesmo padrão.

## Reorganização de Arquitetura: Contexto `roster` (Elenco) com ponte completa (35/35)

- [x] **Operações de Perfil e Gestão (`savePlayer`, `deletePlayer`):**
  - Implementado domínio em `backend/src/contexts/roster/domain/player-profile.ts`.
  - Caso de uso e transação autenticada em `backend/src/contexts/roster/application/save-player-profile.ts`.
  - Repositório PostgreSQL em `backend/src/contexts/roster/infrastructure/pg-player-profile-repository.ts`.
  - Armazenamento de avatares com Supabase Storage em `backend/src/contexts/roster/infrastructure/supabase-player-avatar-storage.ts`.
  - Rotas multipart e JSON em `backend/src/contexts/roster/presentation/player-profile-route.ts`.
  - Suporte completo no gateway HTTP e pontes Server Actions em `src/lib/actions/players.ts`.

- [x] **União de Perfis (`mergeGuestWithRegistered`):**
  - Validação no domínio em `backend/src/contexts/roster/domain/roster-registration.ts`.
  - Serviço de aplicação em `backend/src/contexts/roster/application/get-roster-registration.ts`.
  - Execução atômica e verificação de escopo de liga em `backend/src/contexts/roster/infrastructure/pg-roster-registration-repository.ts`.
  - Rota `POST /api/roster/leagues/:leagueId/players/:guestId/merge` registrada em `roster-registration-route.ts`.
  - Gateway HTTP e Server Action em `src/lib/actions/registrations.ts` com fallback gracioso para RPC legada quando a flag de API estiver desativada.

- [x] **Auditoria e Cobertura:**
  - `npm run audit:migration`: 70 operações em `frontend-migrated` (`identity`: 8/8, `leagues`: 27/27, `roster`: 35/35).
  - Vitest Backend: 83 arquivos de teste passando (234 testes no total).
  - Vitest Frontend: 190 arquivos de teste passando (951 testes no total).
  - Typecheck (`tsc --noEmit`) Frontend e Backend: 0 erros.
  - Build Backend (`npm --prefix backend run build`): Concluído com sucesso.
- [x] **Scouts Básicos BQ v5 Unificados:**
  - Módulo canônico `src/lib/bq-scoring.ts` criado com cálculo determinístico em centésimos inteiros.
  - Atualização dos 8 scouts base em `src/lib/ranked-scoring.ts` e `src/lib/fantasy/config.ts`.
  - Remoção do bônus de clean sheet de zagueiro na base do atleta em `src/lib/fantasy/engine.ts`.
  - Migration `supabase/migrations/129_bq_unified_scoring_v5.sql` aplicada com suporte a `scoring_snapshot`, `draw_points` e precisão `NUMERIC(12,2)`.

- [x] **Bônus Posicionais v5:**
  - Criação do módulo `src/lib/fantasy/position-breakdown.ts` implementando as regras DEF (Clean Sheet +1.5, Proteção Parcial +0.5, Muralha +3, teto de 10.0), MEI (+1.0/assist, Maestro +3), ATA (Artilheiro +3) e GOL (+4).
  - Refatoração de `src/lib/fantasy/lineup-positions.ts` e projeção ao vivo em `src/lib/fantasy/live-projection.ts`.
  - Migration `supabase/migrations/130_bq_v5_position_bonus.sql` sincronizando a lógica no Postgres.

- [x] **Reprocessamento Autorizado:**
  - Migration `supabase/migrations/131_bq_v5_reprocess_season.sql` com RPCs `preview_reprocess_season` e `reprocess_active_season_v5`.
  - Server actions em `src/lib/actions/reprocess.ts`.
  - Tela admin em `src/app/admin/reprocessar/page.tsx` com painel de pré-visualização e modal de confirmação dupla.

- [x] **Scouts Editáveis pelo ADM:**
  - Server actions em `src/lib/actions/bq-scoring.ts` para leitura e gravação síncrona em `ranking_rules` e `fantasy_settings`.
  - Componente `src/components/ScoringRulesForm.tsx` com formulário interativo e feedback de validação.
  - Página `/admin/pontuacao/page.tsx` atualizada com verificação de privilégios de administrador.

- [x] **Sorteio por Velocidade:**
  - Migration `supabase/migrations/132_speed_draw.sql` criando `player_admin_attributes` protegida por RLS.
  - Tipagem `TeamFormationMode` estendida com `'speed'` em `src/lib/types.ts`.
  - Algoritmo `src/lib/speed-draw.ts` com balanceamento por serpentina, troca local e fallback gracioso para 2★.
  - Server actions em `src/lib/actions/speed-draw.ts` para carregar e salvar a velocidade privada dos atletas.
  - Integração no sorteio de rodadas `src/lib/round-draw.ts` e inclusão do botão `🏎️ Por Velocidade` em `src/components/RoundCreator.tsx`.
  - Seletor de velocidade 1-3★ em `src/components/PlayerForm.tsx` e tela de edição admin.

- [ ] **Migração Arquitetural - Lote 3 (ponte estrutural criada; paridade em revisão):**
  - **Contexto `callups` (21/21 operações):**
    - Domain, Application, Infrastructure (Postgres), Presentation (Rotas Express) e Handlers no backend.
    - Gateway HTTP, Sessão de API e Server Actions bridge com testes unitários completos.
  - **Contexto `rounds` (38/38 operações):**
    - Domain, Application, Infrastructure (Postgres), Presentation e Server Actions bridge com testes unitários completos.
  - **Contexto `matches` (21/21 operações):**
    - Domain, Application (`manage-matches.ts`), Infrastructure (`pg-match-repository.ts`), Presentation (`matches-route.ts`).
    - Gateway HTTP (`http-match-gateway.ts`), Sessão de API (`match-api-session.ts`).
    - Bridging de 20 operações em `src/lib/actions/matches.ts` e 1 em `src/lib/actions/goalkeeper.ts`.
  - **Validação registrada nos commits sincronizados (a ser repetida após as correções de paridade):**
    - `npm --prefix backend test`: 95 arquivos de teste, 302 testes passando com 100% de sucesso.
    - `npm --prefix backend run typecheck`: 0 erros.
    - `npx vitest run`: todos os testes de matches e gateway passando.
    - `npx tsc --noEmit`: 0 erros no frontend.
    - `npm run audit:migration`: 150/267 operações migradas (callups 21/21, identity 8/8, leagues 27/27, matches 21/21, roster 35/35, rounds 38/38).

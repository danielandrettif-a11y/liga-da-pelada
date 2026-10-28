# Progresso da Implementação: Pontuação BQ v5 e Sorteio por Velocidade

---

## Reorganização de Arquitetura: Contexto `roster` (Elenco) 100% Concluído (35/35)

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

- [x] **Validação e Testes:**
  - `src/lib/bq-scoring.test.ts` (10/10 testes passando).
  - `src/lib/speed-draw.test.ts` (5/5 testes passando).
  - `src/lib/ranked-scoring.test.ts` (20/20 testes passando).
  - `src/lib/fantasy/engine.test.ts` (38/38 testes passando).
  - `src/lib/fantasy/lineup-positions.test.ts` (6/6 testes passando).
  - `src/lib/fantasy/live-projection.test.ts` (10/10 testes passando).
  - Bateria completa Vitest: 24 arquivos de teste, 170 testes passando com 100% de sucesso.
  - TypeScript estrito (`npx tsc --noEmit`): 0 erros.
  - Build de produção Next.js (`npm run build`): Gerado com sucesso (exit code 0).

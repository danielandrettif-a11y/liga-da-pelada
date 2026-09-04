# Plano de Execução: Pontuação BQ v5 e Sorteio por Velocidade

## Objetivo
Implementar o motor unificado de pontuação BQ v5 (Scouts Básicos compartilhados entre Cartola e Ranked, Bônus Posicionais com teto de 10 pts para DEF, Maestro e Artilheiro), Reprocessamento Seguro de Temporada Ativa, Scouts Editáveis pelo Administrador e o Algoritmo Balanceador de Sorteio de Times por Velocidade (1 a 3 estrelas privado).

---

## Matriz de Entregáveis

| Recurso | Descrição | Status |
|---|---|---|
| **Scouts Básicos BQ v5** | Unificação dos 8 scouts base (Gol: +4, Assistência: +2.5, Vitória: +3, Empate: +1, Derrota: -2.5, Gol Contra: -3, Atuação no Gol: +2, Gol Sofrido no Gol: -1) | Concluído ✅ |
| **Bônus Posicionais v5** | Remoção de DEF na base; DEF com Clean Sheet (+1.5), Proteção Parcial (+0.5), Muralha (+3) e teto de 10 pts; MEI Maestro (+3); ATA Artilheiro (+3); GOL (+4) | Concluído ✅ |
| **Reprocessamento Autorizado** | RPCs de prévia e reprocessamento com trava atômica de mercado e rodadas ativas + tela admin em `/admin/reprocessar` | Concluído ✅ |
| **Scouts Editáveis pelo ADM** | Server actions e UI em `/admin/pontuacao` para alteração dinâmica e sincronizada dos 8 scouts | Concluído ✅ |
| **Sorteio por Velocidade** | Tabela privada `player_admin_attributes` (RLS admin), atributo 1-3★ (default 2★ em memória), algoritmo `drawTeamsBySpeed` e botão no `RoundCreator` | Concluído ✅ |
| **Testes & Validação** | 100% de testes automatizados passando (24 suítes, 170 testes), TypeScript estrito limpo e `npm run build` bem-sucedido | Concluído ✅ |

---

## Fases de Execução

- [x] **Fase 1: Scouts Básicos BQ Unificados**
  - Módulo canônico `src/lib/bq-scoring.ts`
  - Atualização de `ranked-scoring.ts`, `fantasy/config.ts`, `fantasy/engine.ts`
  - Migration `129_bq_unified_scoring_v5.sql` com snapshot em `rounds` e `draw_points`

- [x] **Fase 2: Bônus Posicionais v5**
  - Módulo `src/lib/fantasy/position-breakdown.ts` com teto de 10 para DEF
  - Refatoração de `lineup-positions.ts` e atualização de `live-projection.ts`
  - Migration `130_bq_v5_position_bonus.sql`

- [x] **Fase 3: Reprocessamento Autorizado**
  - Migration `131_bq_v5_reprocess_season.sql` (`preview_reprocess_season` e `reprocess_active_season_v5`)
  - Server actions em `src/lib/actions/reprocess.ts`
  - Página `/admin/reprocessar/page.tsx` com visualização de cards e modal de confirmação

- [x] **Fase 4: Scouts Editáveis pelo ADM**
  - Server actions em `src/lib/actions/bq-scoring.ts`
  - Formulário `ScoringRulesForm.tsx` e tela `/admin/pontuacao/page.tsx`

- [x] **Fase 5: Sorteio por Velocidade**
  - Migration `132_speed_draw.sql` (`player_admin_attributes`)
  - Algoritmo `src/lib/speed-draw.ts` e integração em `round-draw.ts`
  - Server actions em `src/lib/actions/speed-draw.ts`
  - UI de seleção 1-3★ em `PlayerForm.tsx` e botão `🏎️ Por Velocidade` em `RoundCreator.tsx`

- [x] **Fase 6: Testes & Validação**
  - Testes unitários novos e atualizados (`bq-scoring.test.ts`, `speed-draw.test.ts`, etc.)
  - Verificação de tipos (`npx tsc --noEmit`)
  - Build de produção (`npm run build`)

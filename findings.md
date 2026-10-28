# Descobertas e Decisões Técnicas: Pontuação BQ v5 e Sorteio por Velocidade

## 0. Auditoria de Paridade do Lote Operacional (28/10/2026)

- **Descoberta:** a existência de domínio, caso de uso, repositório, rota, gateway e teste mockado não comprova paridade. Os commits sincronizados marcaram 80 operações de convocações, rodadas e partidas como `frontend-migrated`, embora algumas implementações tenham omitido efeitos do fluxo legado ou estejam vazias.
- **Evidências:** `shuffleRoundTeams` não altera estado; `finishRound` apenas muda o status da rodada e perde fechamento financeiro, consolidação de estatísticas e Cartola; `finishMatch` perde tempos de saída, recálculo, sugestão da próxima partida e notificações. Os testes unitários existentes validavam chamadas ao mock, não os efeitos no banco restaurado.
- **Decisão arquitetural:** separar progresso estrutural (150/267) de progresso aceito na revisão (70/267) e de homologação (`verified`, 0/267). As flags do lote operacional permanecem desligadas até cada operação ser comparada com o fluxo legado e exercitada no Supabase local restaurado.
- **Correção aplicada:** leituras passaram a exigir sessão coerente com a RLS da migration 255; sessões sem token mantêm o fallback legado; a abertura de convocação cria sua pré-lista na mesma transação e preserva o contrato da Server Action; fallbacks SQL parciais foram retirados para manter as RPCs versionadas como autoridade.
- **Aceite incremental:** as 21 operações de convocação foram comparadas com o fluxo legado. Foram corrigidos escopo de estádio, trava de lista incompleta, idempotência da pré-lista e agendamento do Cartola. Quatro operações de sorteio de rodada também passaram ao padrão: a prévia usa o algoritmo de domínio e atributos escopados da pelada; aplicação aleatória e aplicação aprovada usam as RPCs canônicas.
- **Métrica auditável:** `architecture/operation-parity-status.json` separa revisão de paridade de ponte estrutural e homologação. No aceite anterior, o auditor registrava 113/267 aceitas e 154 pendentes.
- **Aceite atual:** o auditor registra 129/267 aceitas e 138 pendentes; `verified` continua 0 até o smoke no Supabase local restaurado.
- **Rodadas:** 38/38 operações estão aceitas em revisão de código. Além dos leitores, sorteio, pré-lista, ciclo, Draft e equilíbrio adaptativo, as correções de participantes agora usam as RPCs canônicas completas, preservam o motivo da zeragem e mantêm o recálculo de estatísticas, Cartola e overall. A homologação integrada ainda depende do banco local restaurado.

## 1. Unificação de Pontuação e Integridade de Centésimos
- **Descoberta:** O sistema Ranked e o Fantasy possuíam discrepâncias históricas na base (ex: ausência de pontos de empate no Cartola, pesos de gols sofridos e bônus de atleta defensivo acoplado na base do Cartola).
- **Decisão Arquitetural:** 
  - Todo o cálculo BQ opera com centésimos inteiros (`Math.round(x * 100)`) em `src/lib/bq-scoring.ts` para anular qualquer erro de ponto flutuante (`0.1 + 0.2 != 0.3`).
  - O bônus DEF na base do atleta foi completamente eliminado do Cartola (`cleanSheets * 1.0` removido da base). Agora a proteção defensiva é apurada exclusivamente na vaga de escalação DEF.
  - As 8 métricas básicas foram alinhadas tanto em código quanto em banco (`ranking_rules` e `fantasy_settings`).

## 2. Teto e Bônus Posicionais no Cartola
- **Descoberta:** Atletas na vaga de zagueiro/defensor podiam acumular Clean Sheets excessivos gerando distorção estatística em relação a atacantes e meias.
- **Decisão Arquitetural:**
  - DEF: Clean Sheet (+1.5/jogo), Proteção Parcial (+0.5/jogo se sofreu exatamente 1 gol), Bônus Muralha (+3 se ≥ 3 clean sheets). O somatório total do bônus DEF possui teto determinístico de **10.0 pontos** (`min(10.0, rawBonus)`).
  - MEI: Bônus de Assistência (+1.0/assistência) e Bônus Maestro (+3 se ≥ 2 assistências).
  - ATA: Bônus Artilheiro (+3 se ≥ 2 gols).
  - GOL: Bônus Clean Sheet de Goleiro (+4 se ≥ 1 jogo sem sofrer gols atuando no gol).
  - Capitão: Multiplicador exato de 1.5x aplicado diretamente sobre o total da pontuação final da rodada.

## 3. Segurança no Reprocessamento de Temporadas
- **Descoberta:** Reprocessar uma temporada com mercado aberto ou rodada em andamento corrompe snapshots ou gera concorrência no fechamento.
- **Decisão Arquitetural:**
  - Criação das funções SQL `preview_reprocess_season` e `reprocess_active_season_v5` com trava estrita: aborta imediatamente com exceção se houver rodada com status `in_progress` ou com mercado em status `open`.
  - Execução atômica dentro de transação, atualizando `fantasy_lineup_players`, `fantasy_lineups` e o ranking da temporada.
  - Tela admin com prévia detalhada, cards informativos e modal com confirmação dupla para evitar disparos acidentais.

## 4. Algoritmo de Sorteio por Velocidade e Privacidade
- **Descoberta:** O atributo de velocidade dos jogadores é uma métrica subjetiva do administrador e não deve ser exposta aos usuários comuns da liga.
- **Decisão Arquitetural:**
  - Tabela `player_admin_attributes` protegida com RLS restrita ao papel `service_role` ou verificada via server action com credenciais de admin (`requireAdminPermission`).
  - Tratamento de nulos: Atletas sem avaliação de velocidade registrada são tratados estritamente em memória com o valor neutro padrão de **2 estrelas** (`2★`), sem persistência de registros desnecessários.
  - O algoritmo `drawTeamsBySpeed` distribui os jogadores em serpentina ordenados por velocidade e realiza otimização por troca local (`localSwap`) para minimizar a variância da média de velocidade entre os times.
  - Proteção de borda: Se `teamCount < 2`, a troca local é abortada imediatamente sem disparar erro de índice.

## 5. Reorganização de Arquitetura: Contexto Roster (Elenco)
- **Descoberta:** As operações de mutação de jogadores (`savePlayer`, `deletePlayer` e `mergeGuestWithRegistered`) combinam lógica de persistência no PostgreSQL/Supabase, upload/remoção de avatares no Storage e recálculo em cascata (estatísticas de rodadas, recálculo de Fantasy e overall fluido).
- **Decisão Arquitetural:**
  - Cada operação no backend foi encapsulada em seu respectivo caso de uso (`save-player-profile`, `get-roster-registration` com `mergePlayers`) rodando transação autenticada com validação de administrador da pelada via `public.is_league_admin()`.
  - A união de perfis (`mergeGuestWithRegistered`) preserva a verificação `can_merge_profiles_in_league` e a execução da RPC `merge_selectable_player_profiles`, retornando com segurança os `affectedRoundIds` para recálculo.
  - O gateway `httpRosterGateway` no frontend fornece o contrato tipado `mergeGuestWithRegistered` e as Server Actions mantêm um fallback gracioso para RPCs legadas enquanto as pontes de homologação local estiverem sob feature flags.
  - Com isso, o contexto `roster` atinge 100% de cobertura (35 de 35 operações migradas).

## 6. Reorganização de Arquitetura: Contexto Rounds (Rodadas)
- **Descoberta:** O contexto `rounds` com 38 operações inclui fluxos de persistência pesados (criação de rodada com sorteio, encerramento de rodada com recálculo de scouts e integração com o Cartola).
- **Decisão Arquitetural:**
  - Encapsulamento completo no backend sob `backend/src/contexts/rounds/` com repositório PostgreSQL dedicado (`pg-round-repository.ts`) e rotas Express autenticadas.
  - No frontend, o gateway `httpRoundGateway` e a sessão `roundApiFor` abstraem as chamadas REST, mantendo o fallback gracioso nas server actions legadas.
  - Conclusão com 100% de cobertura (38 de 38 operações migradas).

## 7. Reorganização de Arquitetura: Contexto Matches (Partidas)
- **Descoberta:** O contexto `matches` possui 21 operações, com alta sensibilidade a tempo de execução no frontend (ações de cronômetro, substituições ao vivo, auditoria e registro/correção de gols).
- **Decisão Arquitetural:**
  - **Tipagem de Gateways REST vs. Discriminated Unions:** Métodos de gateway que lançam exceção em caso de erro HTTP devem tipar seu retorno com `success: true` literal, e não `success: boolean`. Isso permite que o compilador TypeScript do Next.js discrimine perfeitamente os branches de sucesso e falha (ex.: checagens de `res.matchId`, `res.newDuration`, `res.skipped`), eliminando erros de compilação nos componentes React (`MatchLiveBoard`, `MatchCreator`, `DeleteMatchButton`).
  - **Escopo do Next.js Runtime em Testes:** Funções que usam `after()` de `next/server` ou `cookies()` de `next/headers` (através de `createServerClient()`) devem ter `next/server` mockado nos testes unitários do Vitest e chamadas de gateway devem ser avaliadas antes da inicialização de clientes dependentes de cookies, permitindo execução pura sem request context.
  - O lote `matches` alcançou 100% de cobertura (21 de 21 operações migradas), concluindo integralmente o **Lote 3: Jogo Operacional**.

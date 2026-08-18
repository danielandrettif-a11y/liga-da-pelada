# Descobertas e Auditoria Técnica do Cartola (Findings — V1 para V2)

## 1. Auditoria da V1 do Cartola
- **Estrutura de Dados Existente**:
  - `fantasy_settings`: Tabela de configurações globais de pontuação e valorização da liga.
  - `fantasy_player_prices`: Preços atuais por jogador (`current_price, total_points, rounds_played`).
  - `fantasy_player_price_history`: Histórico de valorização rodada a rodada (`price_before, price_after, variation_rate, round_points, metrics`).
  - `fantasy_lineups` / `fantasy_lineup_players`: Escalações com snapshots de dados travados, palpites e desafio.
  - `fantasy_accounts`: Patrimônio (`current_budget`), pontuação total e estatísticas do usuário.
- **Mecanismos de Valorização V1**:
  - O motor em `src/lib/fantasy/engine.ts` e a procedure `process_fantasy_round` calculavam percentis relativos, mas faltava o decaimento temporal ponderado nas rodadas recentes, a suavização estatística formal no aproveitamento, o cálculo de tendências (`🔥 EM ALTA`, `➡️ ESTÁVEL`, `📉 EM BAIXA`), a forma recente e o custo-benefício.
- **Mercado e Visualização**:
  - Mercado em `FantasyExperience.tsx` possuía ordenação básica e lista compacta.
  - `FantasyPlayerCard.tsx` exibia minigráfico simples no perfil do jogador, mas sem tags automáticas inteligentes nem dados avançados de mercado vivo.
- **Privacidade e Revelação de Escalações**:
  - Antes do fechamento, as escalações estavam seguras, mas não havia mecanismo implementado para "revelação de escalações" no pós-jogo (`🔓 ESCALAÇÕES REVELADAS`) onde os participantes podem visualizar os times completos de todos os rivais em modo somente leitura.
- **Radar Cartola**:
  - Existiam apenas 4 cards estáticos na V1 ("Radar da última Ranked"), sem dados de % escalado agregado em tempo real, % capitão, mais comprado/vendido e favoritos dos palpites.

## 2. Decisões Arquiteturais para a V2
- **Fórmula de Valorização Relativa & Contínua**:
  - Pesos: 40% recente (decaimento [0.40, 0.25, 0.15, 0.12, 0.08]), 35% win rate suavizado por Bayesian smoothing, 15% média histórica válida, 10% consistência (desvio padrão invertido).
  - Variação contínua e normalizada com limites contínuos (+12% máx, -10% máx) e piso C$ 5,00 e teto C$ 25,00.
  - Jogadores ausentes permanecem 100% estáveis (variação = 0.00%).
- **Tags Automáticas Prioritárias**:
  - Priorização com limite de 2 tags no card compacto para evitar poluição visual mobile.
- **Performance & Cache**:
  - Agregações em lote para popularidade e radar no backend/RPC, evitando N+1 queries.

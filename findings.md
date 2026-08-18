# Descobertas e Invariantes da Arquitetura V3 (Cartola Fantasy)

## 1. Regras Fundamentais da V3
- **Ciclo de Recompensa Meritocrático por Participação**:
  - Usuários que tinham escalação válida na rodada que foi finalizada recebem **1 pacote**.
  - A recompensa NÃO depende da pontuação (mesmo com 0 pontos, ganha pacote por participar).
  - Rodadas canceladas NÃO geram pacotes.
  - Processar finalização de rodada múltiplas vezes é estritamente idempotente via restrição `UNIQUE(user_id, round_id)` em `fantasy_round_packs`.
- **Sorteio e Escolha**:
  - Sorteio server-side de 2 opções distintas salvo no banco na primeira abertura.
  - Abertura é 100% idempotente (se recarregar a página, as mesmas 2 cartas são exibidas).
  - Escolha é definitiva: a carta escolhida vai para o inventário como instância individual (`fantasy_user_cards`), a carta rejeitada é descartada.
- **Inventário e Instâncias**:
  - Cada carta no inventário é uma linha em `fantasy_user_cards` com status (`OWNED`, `RESERVED`, `LOCKED`, `CONSUMED`).
  - Duplicatas são permitidas e tratadas como instâncias separadas (agrupadas visualmente na UI).
  - Raridades balanceadas: `COMMON` (55%), `RARE` (30%), `EPIC` (12%), `LEGENDARY` (3%).
- **Ativação e Limite Estrito**:
  - Limite máximo de **1 carta especial ativa por rodada por usuário** (`MAX_CARDS_PER_ROUND = 1`).
  - Ciclo de vida: `OWNED` $\rightarrow$ `RESERVED` (seleção pré-jogo) $\rightarrow$ `LOCKED` (mercado fecha) $\rightarrow$ `CONSUMED` (rodada finalizada).
  - Cancelamento ou escalação inválida devolve a carta para `OWNED` (nunca perde carta por cancelamento).
- **Isolamento de Efeitos e Economia**:
  - Cartas econômicas (`extra_credit` e `bargain`) concedem margem temporária para montar o time na rodada, mas **NÃO alteram o patrimônio real** nem o preço dos jogadores.
  - Cartas de pontuação (`super_captain`, `double_prediction`, `vice_captain`, `golden_goal`, `golden_assist`, `scout`, `duo`, `all_in`) aplicam bônus após a pontuação base, de forma aditiva e transparente, com breakdown detalhado no histórico.

## 2. Catálogo Oficial das 10 Cartas
1. 👑 **Super Capitão** (`LEGENDARY`, `CAPTAIN_MULTIPLIER`): Capitão pontua 3x total.
2. 💰 **Crédito Extra** (`COMMON`, `BUDGET_BONUS`): +C$5 de orçamento na rodada sem alterar patrimônio permanente.
3. 🎯 **Palpite Duplo** (`RARE`, `PREDICTION_MULTIPLIER`): Dobra a recompensa do palpite selecionado (Artilheiro, Garçom ou Desafio).
4. 🤑 **Barganha** (`COMMON`, `PLAYER_DISCOUNT`): 20% de desconto no preço de 1 atleta para montagem de time.
5. 🛡️ **Vice-Capitão** (`RARE`, `VICE_CAPTAIN`): Se o capitão oficial não jogar (`games = 0`), o vice vira 2x.
6. ⚽ **Gol de Ouro** (`COMMON`, `CONDITIONAL_PLAYER_BONUS`): +3 pontos se o jogador escalado fizer 1+ gol.
7. 🍽️ **Passe de Ouro** (`COMMON`, `CONDITIONAL_PLAYER_BONUS`): +3 pontos se o jogador escalado der 1+ assistência.
8. 💎 **Caça-Talentos** (`EPIC`, `CONDITIONAL_PLAYER_BONUS`): 50% dos pontos base (limite +6 pts) para jogador abaixo da mediana de preço.
9. ⚡ **Dobradinha** (`RARE`, `CONDITIONAL_DUO_BONUS`): +5 pontos se 2 jogadores escalados ficarem acima da média da rodada.
10. 🎰 **All-In** (`EPIC`, `CONDITIONAL_PLAYER_BONUS`): +6 pontos se jogador dos 50% mais baratos ficar no TOP 5 da rodada.
- Experimentais (desabilitadas): `safe_prediction` (Palpite Seguro), `emergency_sub` (Reserva de Emergência).

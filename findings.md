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


## 3. Diagnóstico e Regras de Negócio Adicionais
- **Sorteio de Times (Rounds)**:
  - O sorteio direto (`random` ou `balanced`) não deve exigir `attendanceOrder`, permitindo que o administrador sorteie imediatamente com 1 toque sem marcar ordem de chegada prévia.
  - A validação no backend `createRoundWithTeams` exigia `attendanceOrder.length >= minimumPresent` compulsoriamente para qualquer modo não-manual. Ajustado para exigir presenças apenas quando a ordem de chegada foi explicitamente utilizada.
- **Cartas Dobradinha (`duo`) e Vice-Capitão (`vice_captain`) no Fantasy**:
  - Ambas as cartas devem operar exclusivamente sobre os atletas do time escalado (`lineupPlayers`).
  - O modal de inventário precisava receber `lineupPlayers` e `captainPlayerId` na chamada de topo de `FantasyExperience.tsx`.
  - A Dobradinha exige 2 atletas distintos do time escalado e validação de duplicidade.
- **Convocação & Painel Contratar Amigo**:
  - A seção de contratar convidado deve ser colapsada por padrão para não poluir visualmente o fluxo da convocação.
  - O botão de pré-lista lateral foi removido da área de convidados.
- **Banner da Rodada no Mobile**:
  - A imagem de fundo e troféu exigem enquadramento responsivo (`bg-[center_right_25%]` e opacidade otimizada) com gradientes laterais mais suaves para não ofuscar o troféu.
  - O título da rodada com `bg-clip-text` em fonte itálica necessita de `inline-block pr-1.5` e line-height adequado para não truncar caracteres em celulares.
- **Reset de Cartas e Distribuição em Massa de Pacotes (Simulação e Testes Finais)**:
  - `resetMyAccountCards()` limpa em cascata `fantasy_card_activations`, `fantasy_user_cards`, `fantasy_pack_offers` e `fantasy_round_packs` da conta autenticada, garantindo inventário zerado e pronto para novos ciclos.
  - `distributePackToAllLineupUsers()` busca todos os `user_id`s com histórico em `fantasy_lineups`, garante remoção de ofertas/pacotes pendentes da rodada alvo e insere um pacote com status `available` para cada um deles.
  - O painel de administração em `/admin/cartola` (`FantasyCardTester.tsx`) disponibiliza os botões com confirmação visual e feedback instantâneo.

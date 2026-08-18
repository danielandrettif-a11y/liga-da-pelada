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

## 2. Diagnóstico de Layout & UI Mobile (Encaixe da Página do Cartola)
- **Header Occlusion**: O Header fixo possuía 90% de opacidade com blur, permitindo vazamento ótico de textos escuros/neon por trás da logo no scroll.
- **Safe Area Inferior**: `main` estava com `pb-24` fixo sobrepondo a `padding-bottom` dinâmica do safe-area do iOS + altura da barra (`BottomNav`), fazendo os cards inferiores ficarem ocultos.
- **Overflow de Ordenação e Cards**: O header do Mercado com `flex items-end justify-between` comprimia o dropdown em telas menores (<400px), truncando textos (`Mais po...`).
- **Navegação em Abas (Meu Time × Mercado)**: Padrão moderno e oficial dos melhores fantasy games para evitar rolagem infinita vertical de 10 telas em smartphones.

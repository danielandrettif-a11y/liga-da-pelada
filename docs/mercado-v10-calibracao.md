# Mercado V10 — calibração gradual após a rodada 3

## Objetivo

O mercado precisa criar decisões de escalação já no começo da temporada sem
produzir atletas caríssimos. Ao mesmo tempo, quem perdeu patrimônio deve ter um
caminho claro de recuperação: comprar um atleta barato e acertar uma grande
rodada precisa gerar valorização relevante.

## Dados usados e limitação do export

O arquivo `cartola-audit.json.md` contém 53 linhas distribuídas pelas rodadas
1, 2 e 3. A R1 tem 14 participantes com jogos e a R2 tem 18. As 18 linhas da
R3 estão no export local com `games = 0`, sem pontos e sem preços calculados;
portanto, elas não podem ser tratadas como resultados esportivos válidos.

Para não inventar dados, o grid local foi calibrado com as rodadas efetivamente
preenchidas. A migração V10 faz a etapa definitiva: lê `player_round_stats` do
banco e reexecuta, em ordem, todas as rodadas oficiais encerradas da R1 à R3.

## Cenários testados

O script `scripts/analyze-gradual-market.mjs` testa 243 combinações de:

- piso justo: C$ 6,00, C$ 6,50 ou C$ 7,00;
- teto justo: C$ 17,00, C$ 18,00 ou C$ 19,00;
- curva: 1,5, 1,7 ou 1,9;
- velocidade de aproximação: 18%, 22% ou 26%;
- peso da rodada: 60%, 70% ou 80%;
- limites progressivos de alta e queda.

O cenário escolhido usa 70% da rodada porque a diferença de equilíbrio para
60% foi desprezível, enquanto 70% responde melhor à prioridade de recuperação
por uma boa atuação atual.

## Parâmetros escolhidos

| Parâmetro | V10 |
| --- | ---: |
| Rodada atual | 70% |
| Média por rodada na temporada | 30% |
| Comparação dentro da função | 65% |
| Comparação geral | 35% |
| Piso/teto da curva justa | C$ 6,00 / C$ 18,00 |
| Expoente da curva | 1,90 |
| Distância percorrida até o alvo | 26% por rodada |
| Limite R1 | +8% / -6% |
| Limite R2 | +10% / -8% |
| Limite R3 | +12% / -10% |
| Limite R4 | +14% / -12% |
| Limite R5 em diante | +15% / -12% |
| Piso/teto absoluto | C$ 5,00 / C$ 20,00 |

Presença isolada não gera valorização. Um jogador precisa entrar em quadra e a
comparação usa pontos por rodada, o que evita premiar alguém apenas por ter mais
jogos registrados.

## Resultado observado no replay local

Após as duas rodadas utilizáveis do export:

| Indicador | Resultado |
| --- | ---: |
| Menor preço | C$ 8,65 |
| Percentil 25 | C$ 9,40 |
| Mediana | C$ 10,00 |
| Média | C$ 9,99 |
| Percentil 75 | C$ 10,36 |
| Maior preço | C$ 11,88 |
| Custo dos seis mais caros | C$ 67,10 |
| Aposta barata com grande rodada | +10% na R2 |
| Atleta caro entre os piores | -8% na R2 |

Na R3, o limite sobe para +12%/-10%. Mesmo no caso extremo de um atleta de
C$ 10,00 atingir o teto de alta três vezes seguidas, ele chega apenas a
C$ 13,31. No extremo oposto, três quedas máximas levam a C$ 7,78. Assim, já há
separação suficiente para obrigar escolhas com orçamento de C$ 66,00, mas sem
um salto precoce para preços de C$ 18–20.

## Regra de recuperação

O preço não depende somente da colocação. Ele caminha 26% da diferença entre o
preço atual e o preço justo. Isso cria a assimetria desejada:

- atleta barato em grande rodada: tem uma distância positiva grande e tende a
  usar todo o limite de alta;
- atleta caro em rodada ruim: tem uma distância negativa grande e tende a usar
  todo o limite de queda;
- atleta barato ainda em má fase: cai pouco porque já está perto do piso justo;
- atleta caro que entrega o esperado: valoriza de forma moderada, sem disparar.

O patrimônio futuro passa a ser exatamente caixa restante mais valor de venda
do time. O V10 remove a compressão artificial de orçamento, para que boas
apostas realmente recuperem poder de compra. A recalibração de implantação não
altera escalações, preços travados nem patrimônios das rodadas já encerradas.

## Implementação

- `src/lib/fantasy/engine.ts`: referência TypeScript do cálculo.
- `supabase/migrations/140_gradual_recovery_market_v10.sql`: motor definitivo,
  configuração e replay real da R1 à R3.
- `scripts/analyze-gradual-market.mjs`: análise reproduzível dos cenários.
- `src/lib/fantasy/engine.test.ts`: limites, recuperação e segurança da R3.
- `src/lib/fantasy/simulation.test.ts`: simulação econômica por 15 rodadas.

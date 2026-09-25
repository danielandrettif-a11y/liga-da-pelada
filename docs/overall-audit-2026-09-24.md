# Auditoria do OVR — 24/09/2026

## Resultado

- 28 jogadores oficiais foram verificados no banco.
- 24 possuem características de OVR definidas e o OVR geral de todos eles confere com a fórmula v11.
- A diferença máxima antes do arredondamento foi de 0,05 ponto, causada apenas pela exibição das posições com uma casa decimal.
- 4 jogadores estão sem características: André Balada, Johnata França, João Pedro Viana e Wallison.
- André, Johnata e Wallison ainda apareciam nas cartas usando snapshots antigos. A migration 184 passa a ocultar esses snapshots até que as características sejam definidas e o OVR recalculado.

## Por que Matheus fica acima de Lucas

O OVR geral não é a média das quatro posições. Ele usa apenas as características escolhidas pelo administrador.

- Lucas Alencar tem `ofensivo + defensivo`: `73,1 DEF/VOL × 70% + 69,7 ATA × 30% = 72,08`, exibido como **72,1**.
- Matheus Correa (MT9) tem `meio-campo + defensivo`: `73,1 DEF/VOL × 70% + 70,2 ALA × 30% = 72,23`, exibido como **72,2**.
- O ALA 70,5 de Lucas e o ATA 67,9 de Matheus aparecem na carta, mas não participam do OVR geral desses jogadores.
- O GOL também não participa porque ambos são jogadores de linha. Atuar ocasionalmente no gol gera a nota GOL, mas não muda o geral.

## Conferência por jogador

| Jogador | Características atuais | OVR | Conferência |
|---|---|---:|---|
| Daniel Andretti | ATA + ALA | 75,7 | `75,9 × 70% + 75,2 × 30% = 75,69` ✓ |
| Nathan França | DEF/VOL | 75,2 | `75,2 × 100%` ✓ |
| Johnata França | Nenhuma | 74,6 antigo | Inválido enquanto não houver característica; será ocultado pela migration 184 |
| Pedro Canholato | DEF/VOL | 74,2 | `74,2 × 100%` ✓ |
| Luís Felipe | DEF/VOL | 73,8 | `73,8 × 100%` ✓ |
| Pedro Alencar | ATA + ALA | 73,2 | `73,2 × 70% + 73,2 × 30%` ✓ |
| Thyago Andrade | ATA | 73,2 | `73,2 × 100%` ✓ |
| João Victor Ribeiro Costa | DEF/VOL | 73,0 | `73,0 × 100%` ✓ |
| Wallison | Nenhuma | 72,3 antigo | Inválido enquanto não houver característica; será ocultado pela migration 184 |
| Gabriel Silveira | ATA | 72,2 | `72,2 × 100%` ✓ |
| Matheus Correa (MT9) | DEF/VOL + ALA | 72,2 | `73,1 × 70% + 70,2 × 30% = 72,23` ✓ |
| Lucas Alencar | DEF/VOL + ATA | 72,1 | `73,1 × 70% + 69,7 × 30% = 72,08` ✓ |
| Vitor | DEF/VOL + ALA | 71,9 | `71,9 × 70% + 71,8 × 30% = 71,87` ✓ |
| Caio Fraga | DEF/VOL | 71,6 | `71,6 × 100%` ✓ |
| Marlon | ALA + ATA | 71,4 | `71,6 × 70% + 70,9 × 30% = 71,39` ✓ |
| Yann Barbosa | ALA + ATA | 70,8 | `70,9 × 70% + 70,4 × 30% = 70,75` ✓ |
| Tucho | ALA | 70,7 | `70,7 × 100%` ✓ |
| André Balada | Nenhuma | 70,3 antigo | Inválido enquanto não houver característica; será ocultado pela migration 184 |
| Bis | DEF/VOL | 70,0 | Sem rodada: base neutra 70 ✓ |
| João Pedro Bastos | DEF/VOL | 70,0 | Sem rodada: base neutra 70 ✓ |
| Leonardo Maciel | ATA + ALA | 70,0 | Sem rodada: base neutra 70 ✓ |
| Matheus Moraes | ATA + ALA | 70,0 | Sem rodada: base neutra 70 ✓ |
| Rafael Viana | DEF/VOL + ALA | 70,0 | Sem rodada: base neutra 70 ✓ |
| Rhielme Lucas | DEF/VOL; goleiro | 70,0 | Sem rodada: base neutra 70 ✓ |
| George Lucas | ATA; goleiro | 69,4 | Só 1 rodada no gol; geral ainda usa ATA 69,4 ✓ |
| Matheus Correa | ALA | 68,5 | `68,5 × 100%` ✓ |
| Pedro Henrique Tavares Caldas | ATA; goleiro | 68,3 | Só 2 rodadas no gol; geral ainda usa ATA 68,3 ✓ |
| João Pedro Viana | Nenhuma | Sem OVR | Comportamento correto: aguarda característica |

## Fórmula v11 em linguagem direta

1. Só entram rodadas oficiais finalizadas. Ausência não conta como atuação ruim.
2. A nota começa em 70 e considera até as 8 rodadas mais recentes, com peso maior para as novas e meia-vida de 3 rodadas.
3. Várias partidas da mesma pelada contam como uma amostra semanal. A confiança cresce conforme minutos e semanas observados.
4. O desempenho defensivo usa gols sofridos por 7 minutos comparados à liga (50%), tempo até o primeiro gol sofrido (35%), participação (10%) e ausência de gol contra (5%).
5. DEF/VOL usa 70% defesa, 5% gols, 20% assistências e 5% resultado.
6. ALA usa 40% defesa, 25% gols, 30% assistências e 5% resultado.
7. ATA usa 10% defesa, 60% gols, 25% assistências e 5% resultado.
8. GOL usa somente desempenho defensivo nas partidas em que o atleta realmente atuou no gol.
9. Uma característica forma 100% do geral; duas usam 70% da maior e 30% da outra; três usam 60%, 25% e 15%.
10. Para um goleiro cadastrado, o OVR GOL só pode assumir o geral depois de pelo menos 3 rodadas no gol e apenas se for maior que o OVR de linha.

Os valores auditados vieram do último cálculo v11 concluído em 19/09/2026 às 14:06:08. Mudanças posteriores nas características exigem novo cálculo para produzir um snapshot atualizado.

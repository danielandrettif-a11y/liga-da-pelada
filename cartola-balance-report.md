# Auditoria de balanceamento do Cartola

Gerado em 01/09/2026, 23:40:58. A auditoria é somente leitura; nenhuma regra ou dado de produção foi alterado.

## Resumo executivo

- Nota provisória do sistema de pontuação: **9,3/10**.
- Nota provisória do projeto Cartola completo: **8,9/10**.
- Confiança estatística: **muito baixa** (1 rodada(s) pontuada(s) com posições e 1 rodada(s) legada(s)).
- Integridade da recomposição: **98,8%** de 812 verificações; 10 divergência(s).
- O melhor cenário foi escolhido por busca numérica no histórico, não atingiu todas as metas e não deve ser aplicado.

## Notas por posição

| Posição | Nota | Amostra | Média/jogo | Mediana | P75 | P90 | Máximo | Zero | Negativo | Bônus no pacote | Confiança |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| GOL | 7,7 | 18 | 2,30 | 2,13 | 2,33 | 3,90 | 3,90 | 0,0% | 0,0% | 0,0% | baixa |
| DEF | 9,6 | 21 | 3,32 | 1,90 | 4,90 | 4,90 | 4,90 | 0,0% | 0,0% | 23,2% | baixa |
| MEI | 7,9 | 6 | 4,57 | 4,60 | 4,60 | 4,60 | 4,60 | 0,0% | 0,0% | 10,9% | baixa |
| ATA | 9,7 | 22 | 2,67 | 2,58 | 2,67 | 4,20 | 4,20 | 0,0% | 0,0% | 10,5% | baixa |

- **GOL:** A vaga é aberta, mas o bônus depende de atuação real no gol e pode acumular por rodízio. Componentes — retorno 7,0, oportunidade 5,5, teto 10,0, formação 10,0 e clareza 7,0.
- **DEF:** A proteção aparece uma vez na base do atleta defensivo e outra na vaga correta; é potente, porém pouco óbvia. Componentes — retorno 10,0, oportunidade 10,0, teto 10,0, formação 10,0 e clareza 5,5.
- **MEI:** Assistência fecha em 4 pontos e o Maestro cria um degrau adicional ao chegar a duas. Componentes — retorno 4,0, oportunidade 10,0, teto 10,0, formação 10,0 e clareza 7,5.
- **ATA:** O gol-base é universal e o Artilheiro acrescenta um único degrau ao marcar dois gols. Componentes — retorno 9,6, oportunidade 10,0, teto 10,0, formação 10,0 e clareza 8,5.

## Ranking dos desequilíbrios

| # | Risco | Gravidade relativa | Evidência |
|---:|---|---:|---|
| 1 | MEI: retorno médio por jogo | 42,1% | 4,57 pts/jogo contra referência 3,21. |
| 2 | GOL: retorno médio por jogo | 28,4% | 2,30 pts/jogo contra referência 3,21. |
| 3 | ATA: retorno médio por jogo | 17,0% | 2,67 pts/jogo contra referência 3,21. |
| 4 | GOL: teto P90 | 11,4% | P90 3,90 contra referência 4,40. |
| 5 | DEF: teto P90 | 11,4% | P90 4,90 contra referência 4,40. |
| 6 | Vantagem estrutural entre formações | 4,9% | Maior diferença observada por vaga: 4,9%. |
| 7 | ATA: teto P90 | 4,5% | P90 4,20 contra referência 4,40. |
| 8 | MEI: teto P90 | 4,5% | P90 4,60 contra referência 4,40. |
| 9 | DEF: retorno médio por jogo | 3,3% | 3,32 pts/jogo contra referência 3,21. |
| 10 | Peso dos palpites | 1,2% | 1,2% dos pontos absolutos vieram de palpites/desafios. |

## Formações e tamanho da liga

| Jogadores | Formação | Escalações | Média por vaga |
|---:|---|---:|---:|
| 6 | 2-1-2 | 17 | 27,38 |
| 6 | 2-2-1 | 3 | 28,75 |

Maior vantagem estrutural observada: **4,9%**. Meta de aceitação: abaixo de 5%.

## Capitão, palpites e consistência

- Capitão + palpites/desafios representam **10,2%** dos pontos absolutos armazenados.
- Nota do bloco capitão/palpites: **10,0/10**.
- Nota de consistência entre itens e total final: **9,9/10**.
- Cartas continuam isoladas da proposta: seus pontos são preservados na simulação e não entram no preço de mercado.

## Cenários típicos e extremos

Os valores abaixo excluem capitão, palpites e cartas para expor apenas o pacote da posição.

| Posição | Cenário | Atual | Proposta |
|---|---|---:|---:|
| GOL | Típico: 1 jogo no gol, vitória e 1 gol sofrido | 6,00 | 5,00 |
| GOL | Extremo: 2 jogos no gol, 2 vitórias e 2 clean sheets | 22,00 | 20,00 |
| DEF | Típico: vitória e jogo com apenas 1 gol sofrido | 6,00 | 5,25 |
| DEF | Extremo: gol, assistência, vitória e clean sheet | 16,00 | 15,00 |
| MEI | Típico: vitória e 1 assistência | 8,00 | 7,00 |
| MEI | Extremo: gol, vitória e 2 assistências | 20,00 | 16,50 |
| ATA | Típico: vitória e 1 gol | 9,00 | 8,50 |
| ATA | Extremo: vitória e 2 gols | 17,00 | 16,50 |

## Melhor cenário testado — não recomendado para aplicação

| Regra | Atual | Proposta |
|---|---:|---:|
| Gol (base, todas as posições) | 5 | 5 |
| Assistência (base) | 3 | 3 |
| Vitória (base) | 4 | 3.5 |
| Derrota (base) | -2 | -1.5 |
| Atuação no gol (base) | 3 | 2.5 |
| Gol sofrido no gol (base) | -1 | -1 |
| GOL: clean sheet por jogo | 4 | 4 |
| DEF: clean na base | 2 | 2 |
| DEF: até 1 gol na base | 1 | 1 |
| DEF: clean na vaga | 2 | 1.5 |
| DEF: até 1 gol na vaga | 1 | 0.75 |
| MEI: total por assistência | 4 | 3.5 |
| MEI: Maestro (2+ assistências) | 3 | 1 |
| ATA: Artilheiro (2+ gols) | 3 | 3 |
| Capitão | 1.5x | 1.5x |
| Palpite de artilheiro | 3 | 3 |
| Palpite de garçom | 3 | 3 |

A simulação proposta ficou com diferença de retorno esperado de **62,0%**, diferença de P90 de **18,1%** e vantagem entre formações de **4,7%**.

**Decisão:** não transformar estes valores em migration. A diferença média continua acima da meta e a amostra contém apenas uma rodada pontuada com posições.

Classificação das mudanças:

- **Indispensável:** corrigir qualquer divergência de recomposição antes de mexer nos pesos; reduzir parâmetros que ultrapassem as metas de 15%/20%/5%.
- **Opcional:** suavizar vitória/derrota e reduzir o peso combinado de capitão e palpites quando a classificação depender demais de eventos binários.
- **Manter:** snapshots por rodada, Rodada 1 separada, mercado 65% posição/35% geral e cartas fora da valorização.

## Impacto histórico simulado

A Rodada 1 permanece intocada. As linhas abaixo mostram as maiores mudanças anônimas nas temporadas exportadas.

| Gestor | Pontos atuais | Pontos simulados | Diferença | Rank atual | Rank simulado | Variação |
|---:|---:|---:|---:|---:|---:|---:|
| 12 | 309,50 | 304,50 | -5,00 | 6 | 10 | -4 |
| 18 | 297,00 | 306,25 | 9,25 | 12 | 9 | +3 |
| 22 | 309,00 | 308,00 | -1,00 | 9 | 7 | +2 |
| 19 | 309,00 | 308,50 | -0,50 | 8 | 6 | +2 |
| 9 | 339,50 | 330,50 | -9,00 | 4 | 5 | -1 |
| 3 | 260,00 | 267,50 | 7,50 | 14 | 13 | +1 |
| 10 | 307,50 | 300,50 | -7,00 | 10 | 11 | -1 |
| 6 | 262,00 | 259,25 | -2,75 | 13 | 14 | -1 |
| 2 | 309,00 | 306,75 | -2,25 | 7 | 8 | -1 |
| 4 | 149,00 | 147,50 | -1,50 | 19 | 20 | -1 |
| 16 | 336,00 | 335,00 | -1,00 | 5 | 4 | +1 |
| 1 | 297,00 | 298,00 | 1,00 | 11 | 12 | -1 |
| 13 | 149,00 | 149,50 | 0,50 | 20 | 19 | +1 |
| 7 | 355,50 | 346,50 | -9,00 | 2 | 2 | 0 |
| 5 | 378,50 | 370,50 | -8,00 | 1 | 1 | 0 |

## Nota geral do sistema de pontuação

| Bloco | Peso | Nota |
|---|---:|---:|
| Posições | 50% | 8,7 |
| Capitão e palpites | 20% | 10,0 |
| Equilíbrio das formações | 20% | 10,0 |
| Prévia/final e recomposição | 10% | 9,9 |
| **Total** | **100%** | **9,3** |

## Nota geral do projeto Cartola

| Bloco | Peso | Nota | Base da avaliação |
|---|---:|---:|---|
| Pontuação | 35% | 9,3 | Dados reais e regras |
| Mercado/patrimônio | 20% | 9,0 | dados reais + auditoria de código |
| Escalação e clareza | 20% | 8,4 | Completude, capitão e vagas |
| Experiência/rankings | 15% | 8,5 | Auditoria funcional do projeto |
| Integridade/testes | 10% | 9,2 | Recomposição + proteções existentes |
| **Total** | **100%** | **8,9** | |

## Divergências encontradas

As somas internas fecharam; as divergências abaixo aparecem ao recalcular os scouts com o snapshot da rodada.

Os 10 apontamentos de fórmula estão concentrados em **4 escolha(s)** de **1 atleta(s) anônimo(s)**. Isso indica um caso histórico localizado, não uma quebra generalizada da aritmética armazenada.

| Rodada | Componente | Ocorrências | Maior diferença |
|---:|---|---:|---:|
| 2 | base | 4 | 4,00 |
| 2 | position | 2 | 4,00 |
| 2 | total | 4 | 8,00 |

## Limites e próximos passos

- As notas são provisórias enquanto houver menos de duas rodadas pontuadas com o sistema de posições.
- A busca testa alternativas próximas das regras atuais, não combinações arbitrárias que descaracterizem o jogo.
- Antes de qualquer aplicação, revisar manualmente os cenários extremos e executar a suíte de testes de prévia/final.
- Este arquivo é uma recomendação: não cria migration, não chama o Supabase e não altera produção.


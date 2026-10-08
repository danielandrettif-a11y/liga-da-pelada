# Auditoria de equilíbrio — DEF/VOL × ATA/ALA

Esta análise usa diretamente as regras V14 do aplicativo. Ela isola atletas com os mesmos scouts para medir a vantagem estrutural criada somente pela tag.

| Cenário por partida | DEF/VOL | ATA/ALA | Diferença DEF |
| --- | ---: | ---: | ---: |
| Sem gol/assistência, 0 sofridos | 3,00 | 0,00 | +3,00 |
| Sem gol/assistência, 1 sofrido | 0,25 | -0,50 | +0,75 |
| Sem gol/assistência, 2 sofridos | -1,75 | -1,00 | -0,75 |
| 1 gol e 0 sofridos | 8,00 | 4,00 | +4,00 |
| 1 assistência e 1 sofrido | 3,25 | 2,00 | +1,25 |
| 1 gol e 2 sofridos | 3,25 | 3,00 | +0,25 |

Com uma distribuição ilustrativa de 25% de jogos sem sofrer, 45% com um sofrido e 30% com dois sofridos, antes de gols e assistências:

- DEF/VOL: +0,34 ponto por partida;
- ATA/ALA: -0,53 ponto por partida;
- vantagem estrutural do DEF/VOL: aproximadamente +0,86 por partida.

Em dez partidas com dois gols e duas assistências para os dois perfis, a diferença acumulada chega a aproximadamente +11,63 pontos para DEF/VOL. Isso ocorre porque DEF/VOL também recebe +1 por gol e +0,5 por assistência em relação a ATA/ALA.

## Diagnóstico

- ATA/ALA está coerente e simples: produção ofensiva menos 0,5 por gol sofrido pelo time.
- DEF/VOL tem risco maior quando sofre dois gols, mas o clean sheet de +3 e os scouts ofensivos mais valiosos compensam esse risco com folga na maior parte dos cenários.
- A tag fixa resolve a instabilidade de identidade, mas aumenta a importância de o ADM classificar corretamente cada jogador.
- Nota atual de equilíbrio: **6,5/10 para DEF/VOL**, **7,5/10 para ATA/ALA** e **7/10 para o sistema conjunto**.

## Ajuste recomendado para uma próxima revisão

Não foi aplicado automaticamente neste pacote. A opção mais conservadora é reduzir o clean sheet de DEF/VOL de +3 para +2. Se ainda houver vantagem após duas ou três rodadas, aproximar gol e assistência defensivos para 4,5 e 2,75. A penalidade de dois gols em -1,75 já é forte e não deve ser aumentada antes de observar dados reais com a tag fixa.

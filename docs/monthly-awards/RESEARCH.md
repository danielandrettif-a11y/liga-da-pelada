# Prêmios mensais — pesquisa

## Objetivo
Exibir no perfil conquistas mensais para Melhor Defensor, Melhor Ala/Meio, Melhor Atacante, Melhor Goleiro, Chuteira de Ouro, Garçom e Melhor Técnico.

## Fonte dos resultados
- Atletas: soma de `player_round_stats.points` nas rodadas oficiais finalizadas do mês, separada pela tag congelada em cada rodada; mudanças futuras não reclassificam pontos antigos.
- Técnico: soma de `fantasy_lineups.total_points` das escalações pontuadas no mês.
- Goleiro: menor total de gols sofridos nas partidas em que atuou no gol.
- Chuteira de Ouro e Garçom: totais mensais de gols e assistências, respectivamente.
- Amistosos, convidados e rodadas não finalizadas não participam.

## Decisões
- O mês atual é provisório; meses anteriores são títulos definitivos.
- Um vencedor por categoria, com desempate determinístico.
- Em todas as categorias, depois do critério principal, os primeiros desempates são mais vitórias e depois mais empates no mês.
- Cálculo automático a partir dos dados canônicos, sem tarefa manual ou cron.
- A consulta pública retorna apenas os prêmios do perfil solicitado.
- A home consulta somente o mês anterior e recebe os quatro vencedores em uma resposta, evitando uma busca por jogador.
- O mês de referência é calculado no fuso de São Paulo para não trocar prematuramente durante a virada do mês em UTC.

## Riscos tratados
- A posição precisa estar entre `defensive`, `midfield` e `offensive`.
- O Técnico precisa ter conta vinculada a um jogador.
- A função usa `SECURITY DEFINER`, parâmetros tipados e `search_path` fixo, sem expor dados das escalações.
- A consulta da home expõe apenas nome, foto e placar já consolidado dos vencedores.
- Rodadas antigas recuperam a posição das escalações do Cartola quando possível; sem snapshot histórico, usam a posição atual como aproximação inicial.

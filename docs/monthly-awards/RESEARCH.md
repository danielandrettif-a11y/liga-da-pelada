# Prêmios mensais — pesquisa

## Objetivo
Exibir no perfil conquistas mensais para Melhor DEF, Melhor MEI, Melhor ATA e Melhor Técnico.

## Fonte dos resultados
- Atletas: soma de `player_round_stats.points` nas rodadas oficiais finalizadas do mês, separada pela posição atual do atleta.
- Técnico: soma de `fantasy_lineups.total_points` das escalações pontuadas no mês.
- Amistosos, convidados e rodadas não finalizadas não participam.

## Decisões
- O mês atual é provisório; meses anteriores são títulos definitivos.
- Um vencedor por categoria, com desempate determinístico.
- Cálculo automático a partir dos dados canônicos, sem tarefa manual ou cron.
- A consulta pública retorna apenas os prêmios do perfil solicitado.
- A home consulta somente o mês anterior e recebe os quatro vencedores em uma resposta, evitando uma busca por jogador.
- O mês de referência é calculado no fuso de São Paulo para não trocar prematuramente durante a virada do mês em UTC.

## Riscos tratados
- A posição precisa estar entre `defensive`, `midfield` e `offensive`.
- O Técnico precisa ter conta vinculada a um jogador.
- A função usa `SECURITY DEFINER`, parâmetros tipados e `search_path` fixo, sem expor dados das escalações.
- A consulta da home expõe apenas nome, foto e placar já consolidado dos vencedores.

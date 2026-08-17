# Descobertas e Restrições Técnicas (Findings)

## Estrutura Atual do Banco de Dados
- Tabela `leagues`: Possui `stadium_name` e `stadium_map_url` globais da liga (migration 028).
- Tabela `callups`: Possui `date`, `round_type`, `capacity`, `waitlist_capacity`, `status`, `round_id`. Não possuía colunas próprias para estádio específico ou horário específico, usando defaults.
- Tabela `rounds`: Possui `start_time` (migration 028), mas usava o estádio global da liga.
- Tabela `fantasy_lineups`: Salva as escalações dos usuários vinculadas a `fantasy_round_id` e `user_id`, com status `open`, `locked`, `scored`.

## Regras de Negócio e Requisitos
1. **Estádios Múltiplos**:
   - Cada liga pode jogar em campos diferentes por rodada.
   - Os estádios devem ser cadastrados na aba `/mais/estadios` com nome, endereço, URL do Google Maps e ordem de exibição.
   - O select de estádios na abertura da convocação e criação da rodada deve respeitar essa ordem cadastrada.
2. **Banner de Convocação na Home**:
   - Deve adaptar seu texto e ações baseado na lotação (vagas normais cheias -> lista de espera) e no status do usuário (se ainda não confirmou -> convite; se já confirmou -> confirmação ativa com check; se na fila -> aviso de posição).
   - Deve exibir botão para ver a localização no mapa se houver estádio definido.
3. **Página de Convocação**:
   - Deve evidenciar os 3 dados cruciais: Dia, Horário e Estádio.
4. **Cartola - Ranking da Rodada**:
   - Antes do fechamento do mercado, o ranking por rodada deve mostrar o status de escalação de todos os participantes (quem já salvou o time e quem falta salvar). Logo após salvar o time, o usuário passa para o grupo de confirmados.

# Rodadas incompletas — pesquisa

## Objetivo
Permitir rodadas com 12 a 17 participantes sem alterar permanentemente a configuração da liga.

## Estado atual
- A montagem aceita times abaixo da capacidade, mas a conversão de uma convocação exige todos os confirmados.
- A criação de partidas já empresta atletas para cobrir ausências e registra o time original em `match_players`.
- A rotação de goleiro é persistida por jogador; isso reinicia quando a vaga é ocupada por um emprestado diferente.

## Abordagem
- Salvar na rodada o alvo de cinco ou seis jogadores por time.
- Numerar uma fila independente de empréstimos em cada time.
- Completar automaticamente as vagas estruturais com o time que estiver fora.
- Persistir a posição lógica usada na rotação do goleiro.

## Regras decididas
- Mínimo de 12 jogadores e três times distribuídos com diferença máxima de um.
- 6x6 aceita de 12 a 18; 5x5 aceita de 12 a 15.
- Acima de 15 no 5x5, o ADM remove os excedentes manualmente.
- A escolha é exclusiva da rodada e não muda a configuração da liga.


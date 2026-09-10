# Rodadas incompletas — implementação

## Fase 1: regras e persistência
- Criar helpers determinísticos para validação e fila.
- Criar a migration 152 com os novos snapshots e números de ordem.

## Fase 2: montagem da rodada
- Adicionar as duas confirmações.
- Validar mínimo, limite do 5x5 e equilíbrio quantitativo.
- Fazer o servidor repetir todas as validações.

## Fase 3: partidas e goleiros
- Preencher vagas estruturais com empréstimos automáticos.
- Continuar a fila lógica do goleiro mesmo quando o emprestado muda.
- Mostrar as duas numerações nas telas administrativas.

## Fase 4: qualidade
- Cobrir as regras com testes unitários.
- Executar typegen, TypeScript, testes e build.


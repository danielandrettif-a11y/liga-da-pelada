# ADR 002 — retirada atômica de convidado pelo criador

Status: aceito no código; migration pendente de aplicação e validação integrada.

## Contexto

A retirada por um membro criador fazia `DELETE` da entrada e, numa segunda chamada não bloqueante, tentava executar `normalize_callup_positions`. A função interna não tem permissão de execução para `authenticated` desde a migration 017. Uma exclusão poderia portanto deixar a fila sem promoção. As duas chamadas também permitiam estado parcial em caso de falha.

## Decisão

Expor uma RPC estreita, `remove_my_added_callup_player`, que valida autenticação, pertencimento à pelada, convocação aberta e autoria da entrada. Ela bloqueia convocação e entrada e delega à função interna `remove_callup_player_before_first_match`, que já cuida de exclusão, normalização e vínculos da rodada na mesma transação. A permissão de execução é concedida apenas a `authenticated`; `normalize_callup_positions` continua privada.

## Alternativas e consequências

- Conceder `EXECUTE` direto à normalização: mudança menor, mas permitiria a uma conta autenticada normalizar convocação arbitrária, além de manter duas operações não atômicas. Rejeitada.
- Reimplementar toda a retirada no TypeScript: exigiria múltiplas chamadas, reabriria corridas e duplicaria regras do banco. Rejeitada.
- A RPC adiciona uma migration e exige implantação na ordem banco → aplicativo. O aviso externo ao Cartola continua posterior ao commit e não é parte da transação.

## Validação exigida antes da publicação

Aplicar a migration em ambiente de teste; remover um convidado da fila e um confirmado com espera; confirmar promoção, ordem, pré-lista e isolamento entre duas peladas. Verificar também rejeição após conversão e ao tentar remover entrada criada por outra conta. Nenhuma dessas verificações contra banco real é substituída pelos testes unitários.

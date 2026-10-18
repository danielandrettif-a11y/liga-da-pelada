# ADR 003 — Autorizar RPCs de partida pela pelada do alvo

## Status

Aceito no código; validação em Supabase de teste pendente.

## Contexto

Depois da separação em peladas, a RLS da migration 255 passou a filtrar partidas, substituições e jogadores pela liga. Porém três RPCs da migration 015 ainda exigiam `is_app_admin()`, um papel global da conta. Assim, um ADM de outra pelada podia ser impedido de gerenciar suas partidas, enquanto a regra de autorização da RPC não expressava o isolamento desejado.

## Alternativas

| Alternativa | Vantagem | Custo/risco |
| --- | --- | --- |
| Manter `is_app_admin()` e confiar na RLS | Nenhuma migration | ADM apenas da pelada continua bloqueado; duas fontes de autorização divergentes. |
| Confiar somente na RLS | Menos código na RPC | A permissão fica implícita e uma política permissiva futura pode reabrir a operação. |
| Conferir `is_league_admin()` da rodada-alvo e manter RLS | Regra explícita no limite transacional, independente da pelada escolhida no navegador | Requer reimplantar as três funções e testar em banco real. |

## Decisão

Usar a liga da rodada vinculada à partida/substituição, ou a própria rodada na alteração de disponibilidade, para chamar `is_league_admin()`. Manter `SECURITY INVOKER`, as políticas RLS por pelada e as assinaturas das RPCs. Revogar acesso anônimo. A interface continua fazendo sua checagem inicial, mas a decisão final permanece no banco.

## Consequências e validação

- Um ADM de pelada sem papel global deve poder agir na sua rodada; um ADM de outra pelada e um jogador comum devem falhar.
- A migration 326 não altera dados existentes; substitui apenas funções e permissões de execução.
- O ensaio descartável `npm run test:multi-league` ganhou casos para disponibilidade, incluindo jogador, ADM local e outra pelada. Ele **não** prova ainda substituição/desfazer nem substitui inspeção da RLS efetiva; esses casos precisam de rodadas e partidas de teste.
- Reavaliar se o esquema de papéis das contas e a RLS de partidas mudarem novamente.

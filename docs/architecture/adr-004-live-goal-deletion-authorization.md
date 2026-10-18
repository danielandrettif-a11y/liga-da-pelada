# ADR 004 — Autorizar a exclusão de gol na própria RPC

## Status

Aceito no código; validação em Supabase de teste pendente.

## Contexto

`delete_match_event` foi criada como `SECURITY DEFINER` na migration 047. A Server Action exige ADM e verifica a pelada selecionada, mas a RPC era executável diretamente por uma conta autenticada sem verificar seu papel. Como `SECURITY DEFINER` não depende da RLS do chamador, a proteção da tela não é suficiente.

## Alternativas

| Alternativa | Vantagem | Custo/risco |
| --- | --- | --- |
| Confiar apenas na Server Action | Nenhuma alteração SQL | Chamada direta à RPC contorna a autorização. |
| Trocar para `SECURITY INVOKER` | RLS do chamador passaria a valer | Pode afetar a transação de exclusão/placar e não expressa explicitamente o papel de ADM. |
| Verificar o ADM da pelada-alvo dentro da RPC | Mantém atomicidade, contrato e limite de confiança explícito | Exige migration e teste integrado. |

## Decisão

Manter `SECURITY DEFINER`, mas obter a liga da rodada vinculada à partida bloqueada e exigir `is_league_admin()` antes de consultar ou apagar o evento. Bloquear a linha do evento e manter o filtro de partida também no `DELETE`. Revogar execução de `PUBLIC` e `anon`. A Server Action permanece como checagem inicial, não como autoridade única. A abordagem acompanha `register_goal`, que recebeu a mesma proteção na migration 279.

## Consequências e validação

- A migration 327 substitui somente a função e seus privilégios; não altera dados persistidos nem o formato da resposta.
- O ensaio descartável entre duas peladas usa partidas pendentes para comprovar que jogador comum e ADM de outra pelada são barrados, enquanto o ADM local chega à validação de estado. Não executa a exclusão real de um gol.
- Ainda são necessários teste integrado de exclusão em partida ao vivo, revisão de auditoria/RLS efetivas e implantação da migration antes do código da aplicação.

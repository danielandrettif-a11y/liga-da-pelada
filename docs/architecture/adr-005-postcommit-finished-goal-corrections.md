# ADR 005 — Distinguir correção gravada de reprocessamento pendente

## Status

Aceito no código; validação integrada pendente.

## Contexto

As RPCs de correção de gols finalizados gravam evento, placar e auditoria numa transação. Em seguida, a Server Action recalcula Ranking, Cartola e Overall por chamadas separadas. Antes, remover ou editar um gol podia retornar `success: false` se uma dessas etapas posteriores falhasse, embora o gol já tivesse sido corrigido. Isso incentivava repetir uma operação não idempotente.

## Alternativas

| Alternativa | Vantagem | Custo/risco |
| --- | --- | --- |
| Manter erro único para qualquer etapa | Menos tipos de resposta | Confunde falha da mutação com falha posterior e pode induzir duplicação. |
| Tornar todas as projeções uma única transação SQL | Consistência imediata | Mudança ampla nas RPCs de Ranking, Cartola e Overall; maior risco e custo agora. |
| Separar sucesso da RPC de aviso de reprocessamento | Correção honesta para o ADM e compatibilidade com a tela | Projeções podem ficar temporariamente divergentes e exigem reparo operacional. |

## Decisão

Usar um caso de uso comum para remover, editar e adicionar gols finalizados. Antes da RPC, falhas retornam erro. Após resposta bem-sucedida da RPC, falhas de recálculo ou revalidação retornam `success: true` com `warning`; a UI mostra que o gol foi corrigido e que há trabalho pendente. A aplicação continua usando o alvo retornado pela RPC e a Server Action revalida as mesmas telas.

## Consequências e validação

- As regras de elegibilidade e autorização seguem nas RPCs SQL da migration 280.
- Não há migration neste lote. Testes unitários cobrem os três comandos, as etapas de reprocessamento e as falhas antes/depois da RPC.
- Ainda falta validar em Supabase de teste o cálculo real de Ranking/Cartola/Overall e um procedimento de recuperação para projeções pendentes. Erro de rede após commit mas antes da resposta da RPC continua ambíguo; idempotência/auditoria da correção são trabalho futuro.

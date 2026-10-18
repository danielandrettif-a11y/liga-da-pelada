# ADR 006 — Confirmar a escalação pelo recibo da RPC transacional

## Status

Aceito no código; validação integrada pendente.

## Contexto

Depois de `save_fantasy_lineup_with_reserve` retornar, o aplicativo fazia outra consulta a `fantasy_lineup_reserves`. Se essa leitura falhasse ou não enxergasse a linha, a ação devolvia erro e sugeria salvar de novo, apesar de a RPC já ter concluído. As migrations 250, 251 e 311 mostram que titulares e reserva são gravados na mesma transação, e a RPC retorna o ID da escalação apenas depois da inserção da reserva.

## Alternativas

| Alternativa | Benefício | Custo/risco |
| --- | --- | --- |
| Manter a segunda leitura e reportar erro | Confere o estado observado por outro cliente | A leitura pode falhar após o commit e produzir falso erro; acrescenta latência. |
| Ler novamente e tratar falha como aviso | Evita recomendar repetição imediata | Ainda mantém uma chamada redundante e exige distinguir ausência real de falha de leitura. |
| Usar a RPC transacional e seu ID retornado | Uma fonte de confirmação, menos latência e nenhuma janela entre gravação e leitura | Depende do contrato SQL da RPC; resposta sem ID exige estado cauteloso. |

## Decisão

O salvamento oficial usa a resposta da RPC como confirmação de titulares e reserva. Erro da RPC é falha de salvamento. Resposta sem erro e com ID é `success: true, confirmed: true`. Resposta sem erro mas sem ID é `success: true, confirmed: false` com aviso para conferir o time; a interface preserva o rascunho até uma leitura posterior confirmar. Falhas de revalidação da tela depois do commit também viram aviso, não erro de gravação.

## Consequências

- Remove uma consulta pós-gravação (inclusive a necessidade de service role nesse caminho) e evita falso erro por RLS/latência dessa leitura.
- A RPC continua autoridade para mercado, elegibilidade, preço, reserva e isolamento da pelada. Não há migration neste lote.
- É necessário testar em Supabase de teste o recibo com reserva, a leitura posterior do time e a versão das migrations instalada. Falha de rede depois do commit mas antes da resposta da RPC permanece ambígua; idempotência por operação seria trabalho futuro.

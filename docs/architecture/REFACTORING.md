# Refatoração do app — acompanhamento

Este arquivo é a fonte de progresso da migração arquitetural. Atualizar no mesmo commit de cada lote, incluindo o que mudou, testes, migrations, riscos e próximo passo. Não marcar uma área como concluída só por mover arquivos: a ação deve ficar fina e os contratos e fluxos críticos devem estar verificados.

## Decisões vigentes

- Monólito modular e DDD pragmático; regras puras em domínio, orquestração em aplicação e Supabase na infraestrutura. Ver [ADR 001](./adr-001-modular-monolith.md).
- Manter RPCs SQL e RLS como autoridade para transações, consistência e isolamento entre peladas. Não duplicar essas regras em TypeScript.
- Preservar assinaturas e respostas públicas das Server Actions durante a migração; converter uma fatia vertical por vez.
- Não criar agora tabela de estatísticas acumuladas: a view `player_season_stats` já agrega `player_round_stats`. Medir antes de alterar esquema.

## Etapas

| Etapa | Estado | Evidência / próximo passo |
| --- | --- | --- |
| Base, limites entre camadas e registro de decisões | Em andamento | ADR 001 criado; continuar mapa de dependências e testes de regressão por área. |
| Piloto — criação de pelada no lobby | Concluído | Validação de nome/tipo/visibilidade em domínio; caso de uso com porta para criação; adaptador Supabase; Server Action mantém autenticação, cookie, revalidação e redirecionamento. |
| Convocação e rodadas | Em andamento | Formato, abertura, pré-lista e edição da convocação extraídos; próximo recorte: fechamento/visibilidade ou testes integrados com duas peladas. |
| Partidas e pontuação | Pendente | Preservar cálculo e correções de scouts/goleiros; testar reprocessamento. |
| Cartola e cosméticos | Pendente | Preservar RPCs, inventário e isolamento por pelada/conta. |
| Pagamentos | Pendente | Cobrir parcelas, correções e autorizações administrativas. |
| Estatísticas e demais áreas | Pendente | Consolidar leitores, reduzir consultas repetidas, remover dependências entre actions. |
| Avaliação de tabela de acumulados | Aguardando medições | Decidir somente com dados de latência, linhas retornadas, plano SQL e consistência após correções. |

## Registro de lotes

### 2026-10-17 — edição da convocação

- Extraído `updateCallup` para domínio (normalização da entrada), aplicação (data única, estádio, atualização e sincronização da rodada) e gateway Supabase. A Server Action ainda verifica ADM e convocação na pelada selecionada, devolve as mesmas mensagens e revalida somente no sucesso.
- A edição mantém o comportamento existente de copiar data, horário, estádio e tipo para a rodada vinculada apenas quando ela ainda está em rascunho. Leituras e gravações agora filtram explicitamente por `league_id`. O erro `23505` segue traduzido para data duplicada.
- Testes novos cobrem formato, conflito de data, falha da consulta, estádio de outra pelada, estádio padrão, sincronização e filtros do gateway. `npm run check` aprovado: tipagem, 549 testes em 82 arquivos e build.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. Risco preexistente: convocação e rodada são atualizadas em chamadas separadas; falha na segunda não desfaz a primeira. Corrigir isso requer RPC transacional próprio, fora deste lote de preservação de comportamento. O fluxo completo ainda precisa de teste integrado com duas peladas.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — preparação da pré-lista

- Extraído `createCallupPrelist` para domínio (estado e jogadores confirmados), aplicação (pré-lista existente, criação e lembretes) e gateway Supabase. A Server Action mantém a verificação de ADM e pelada selecionada, além das revalidações após criação. A abertura da convocação usa o mesmo caso de uso, sem chamar outra Server Action internamente.
- Preservados o RPC `save_round_prelist`, seus parâmetros, o retorno da pré-lista já vinculada, a restrição a convocações abertas e o agendamento não bloqueante dos lembretes do Cartola apenas na pelada completa e rodada oficial. A leitura da convocação agora também filtra explicitamente por `league_id`.
- Testes novos cobrem jogadores confirmados, estados, pré-lista existente, falhas, lembretes, filtros e payload do gateway. `npm run check` aprovado: tipagem, 540 testes em 79 arquivos e build.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. Ainda falta validar o fluxo completo com duas peladas em ambiente de teste.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — abertura da convocação

- Extraído `openCallup` para domínio (entrada e capacidade), aplicação (data única, estádio, criação, pré-lista e reversão) e gateway Supabase. A Server Action ainda exige ADM, obtém a pelada selecionada, chama a pré-lista existente e revalida as páginas no sucesso.
- Preservados: filtro de data por pelada e status `open`/`locked`/`converted`; proteção da restrição única do banco (`23505`); estádio da pelada; formato 5–7 jogadores e 2–6 times; pré-lista imediata; exclusão da convocação se a pré-lista falhar; mensagem de recuperação se também falhar a reversão.
- Testes novos cobrem padrões do formulário, limites, isolamento lógico por `league_id`, estádio inválido, sucesso, falha da pré-lista, falha da reversão e corrida de data duplicada. Tipagem, 529 testes em 76 arquivos e build aprovados.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. O fluxo completo ainda precisa de teste integrado com duas peladas em ambiente de teste.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — capacidade da convocação

- Extraído `setCallupFormat` para `src/modules/callups/{domain,application,infrastructure}`. A validação de 5–7 jogadores e 2–6 times, a consulta restrita à convocação aberta da pelada ativa e o RPC `set_callup_format` mantêm o contrato anterior. `setCallupMatchSize` continua delegando à mesma ação.
- A Server Action ainda verifica ADM e pelada ativa, e continua responsável pelas mesmas revalidações e mensagens públicas. O RPC permanece como autoridade para o ajuste do Cartola.
- Testes novos: limites de formato, bloqueio de convocação de outra pelada/fechada, filtros do gateway e retorno do tamanho do Cartola. Tipagem, 511 testes em 73 arquivos e build aprovados.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. Não foram executados testes integrados contra duas peladas reais neste lote.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — piloto e diagnóstico das estatísticas

- Antes da mudança: testes de criação de pelada e ranking, 10 testes aprovados.
- Extraído o fluxo `createLeague` para `src/modules/leagues/{domain,application,infrastructure}`. O RPC `create_league_for_user`, o cookie de pelada ativa, os redirecionamentos e a revalidação continuam com o mesmo comportamento.
- Adicionados testes de domínio e caso de uso, incluindo entrada inválida, normalização e falha do repositório.
- Adicionado diagnóstico opcional (`STATS_QUERY_DIAGNOSTICS=1`) para duração e quantidade de linhas das leituras de ranking da temporada, histórico do ranking e totais do elenco. Logs não incluem IDs nem dados pessoais. Sem a variável, o diagnóstico não emite logs.
- Migrations: nenhuma. Banco e dados de produção não foram alterados.
- Verificação: `npm run typecheck` aprovado; `npm test` aprovado (70 arquivos, 497 testes); `npm run build` aprovado após permitir o download das fontes Inter/Oswald. A primeira tentativa em rede restrita falhou apenas ao buscar essas fontes.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

## Medição de estatísticas antes de uma nova tabela

1. Em ambiente de teste representativo, ativar `STATS_QUERY_DIAGNOSTICS=1` temporariamente e carregar ranking, elenco e histórico repetidas vezes, com temporada curta e longa. Registrar p50/p95 de `durationMs`, `rowCount` e erros por operação. Essa métrica mede a consulta/agregação, não todo o carregamento da página.
2. Examinar com `EXPLAIN (ANALYZE, BUFFERS)` as consultas lentas em cópia de dados ou ambiente seguro; conferir índices e filtros de temporada/pelada antes de mudar o esquema. Não executar explicações pesadas no banco oficial sem janela apropriada.
3. Medir a página no navegador separadamente (rede, JavaScript e renderização). Um gargalo de interface não justifica tabela de totais.
4. Primeiro otimizar consulta, seleção de colunas, índices e leituras redundantes. Somente considerar acumulados se a consulta ainda dominar a latência de forma consistente.
5. Se houver tabela: chave por pelada, temporada, tipo de rodada e jogador; reconstrução dos dados antigos; atualização após finalização, edição ou reprocessamento; teste de paridade com `player_round_stats`; RLS e rollback próprios. A fonte original permanece autoritativa até a paridade ser comprovada.

## Critério de conclusão de cada lote

- Tipagem, testes e build aprovados; cenários de segurança e isolamento pertinentes executados.
- Nenhuma regra nova dependente do cliente; autorização preservada dentro do caminho da ação e do banco.
- Registrar migrations, resultados, riscos e commit neste arquivo antes de iniciar o lote seguinte.

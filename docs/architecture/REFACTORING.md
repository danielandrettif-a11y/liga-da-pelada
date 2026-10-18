# Refatoração do app — acompanhamento

Este arquivo é a fonte de progresso da migração arquitetural. Atualizar no mesmo commit de cada lote, incluindo o que mudou, testes, migrations, riscos e próximo passo. Não marcar uma área como concluída só por mover arquivos: a ação deve ficar fina e os contratos e fluxos críticos devem estar verificados.

## Decisões vigentes

- Monólito modular e DDD pragmático; regras puras em domínio, orquestração em aplicação e Supabase na infraestrutura. Ver [ADR 001](./adr-001-modular-monolith.md).
- Manter RPCs SQL e RLS como autoridade para transações, consistência e isolamento entre peladas. Não duplicar essas regras em TypeScript.
- A retirada de convidado pelo criador usa RPC específica e atômica, sem conceder acesso direto à normalização interna. Ver [ADR 002](./adr-002-atomic-callup-creator-removal.md).
- As RPCs de substituição, desfazer substituição e disponibilidade conferem o ADM da pelada do alvo, além da RLS. Ver [ADR 003](./adr-003-match-rpc-league-authorization.md).
- Preservar assinaturas e respostas públicas das Server Actions durante a migração; converter uma fatia vertical por vez.
- Não criar agora tabela de estatísticas acumuladas: a view `player_season_stats` já agrega `player_round_stats`. Medir antes de alterar esquema.

## Etapas

| Etapa | Estado | Evidência / próximo passo |
| --- | --- | --- |
| Base, limites entre camadas e registro de decisões | Em andamento | ADR 001 criado; continuar mapa de dependências e testes de regressão por área. |
| Piloto — criação de pelada no lobby | Concluído | Validação de nome/tipo/visibilidade em domínio; caso de uso com porta para criação; adaptador Supabase; Server Action mantém autenticação, cookie, revalidação e redirecionamento. |
| Convocação e rodadas | Em andamento | Formato, abertura, pré-lista, edição, estado e participação extraídos; retirada pelo criador corrigida no código com migration 325 ainda não aplicada. Falta validação integrada com duas peladas. |
| Partidas e pontuação | Em andamento | Registro de gol, encerramento, goleiros e substituição extraídos; migration 326 corrige três RPCs legadas (não aplicada); falta teste integrado, correções e reprocessamento. |
| Cartola e cosméticos | Pendente | Preservar RPCs, inventário e isolamento por pelada/conta. |
| Pagamentos | Pendente | Cobrir parcelas, correções e autorizações administrativas. |
| Estatísticas e demais áreas | Pendente | Consolidar leitores, reduzir consultas repetidas, remover dependências entre actions. |
| Avaliação de tabela de acumulados | Aguardando medições | Decidir somente com dados de latência, linhas retornadas, plano SQL e consistência após correções. |

## Registro de lotes

### 2026-10-17 — autorização das RPCs legadas de substituição

- A migration `326_scope_match_substitution_rpcs_to_league.sql` troca `is_app_admin()` por `is_league_admin()` nas RPCs `substitute_match_player`, `undo_last_match_substitution` e `set_round_player_availability`. A liga é derivada da partida ou rodada persistida, nunca de um parâmetro enviado pelo cliente. A RLS da migration 255 continua como segunda barreira; assinaturas, regras de elegibilidade e `SECURITY INVOKER` foram preservados.
- A migration revoga `EXECUTE` de `PUBLIC` e `anon` e concede somente a `authenticated`. Ela não atualiza linhas. Ver [ADR 003](./adr-003-match-rpc-league-authorization.md) para alternativas e riscos.
- O ensaio `test:multi-league` foi ampliado com rodadas amistosas descartáveis e verifica que um jogador comum e um ADM de outra pelada não passam pela autorização de disponibilidade, enquanto um ADM local sem papel global passa e chega à validação do jogador. As rodadas são apagadas antes das peladas na limpeza.
- `node --check scripts/verify-multi-league-isolation.mjs` e `npm run check` aprovados: tipagem, 624 testes em 106 arquivos e build. O ensaio de banco não foi executado nesta etapa.
- **Ainda não aplicada nem testada contra banco.** A migration 325 também segue pendente. Aplicar 325 e depois 326 no Supabase de teste antes do aplicativo; executar o ensaio somente em base marcada como descartável. Testar manualmente substituição e desfazer com ADMs de duas peladas, pois o ensaio automatizado ainda não cobre esses dois caminhos. A auditoria das demais RPCs legadas com `is_app_admin()` segue pendente por área.

### 2026-10-17 — substituição durante a partida

- Extraída `substituteMatchPlayer` para domínio (dados obrigatórios e presença do substituto), aplicação (ordem da checagem/execução) e gateway Supabase. A Server Action mantém autorização de ADM, mensagens públicas e revalidação da partida e rodada somente após sucesso.
- Preservados o filtro da partida pela pelada ativa, a checagem do substituto na rodada, a exceção do modo de formação manual e os parâmetros da RPC `substitute_match_player`. A rodada para revalidação agora vem da primeira leitura da partida, eliminando uma segunda consulta depois da gravação e o falso erro que ela poderia provocar.
- Testes novos cobrem entrada inválida, substituto ausente/sem presença, saída sem substituto, escopo da pelada, ordem de operações, payload da RPC e falhas. `npm run check` aprovado: tipagem, 624 testes em 106 arquivos e build. Nenhuma migration foi criada ou aplicada.
- **Risco de autorização preexistente:** a RPC SQL em `015_match_substitutions_and_availability.sql` ainda usa `is_app_admin()` global, enquanto a ação usa ADM da pelada selecionada. Outras RPCs da mesma migration também usam essa checagem antiga. Auditar e corrigir no banco, além de validar com ADMs de duas peladas, antes de considerar esse fluxo seguro para implantação. Este lote estrutural não substitui teste integrado nem mede ganho real de latência.

### 2026-10-17 — goleiro fixo e troca durante a partida

- Extraídas `setRoundTeamFixedGoalkeeper` e `changeMatchGoalkeeper` para domínio (validação e saneamento da dica de tempo), aplicação (escopo, estado e elegibilidade) e infraestrutura Supabase. A Server Action ainda exige ADM, obtém a pelada selecionada e revalida as mesmas telas após sucesso.
- Preservados o filtro da equipe por rodada/pelada, a exigência de jogador do time para a fixação, a remoção da fixação com `null`, a exigência de partida `live` e time participante na troca. A RPC `change_match_goalkeeper` continua autoridade pelo relógio oficial e pela autorização final; o valor vindo do navegador é apenas dica saneada.
- Testes novos cobrem entradas inválidas, time de outra pelada/partida, jogador externo ao time, remoção da fixação, estado da partida, parâmetros da RPC e erros. `npm run check` aprovado: tipagem, 614 testes em 103 arquivos e build. Nenhuma migration foi criada ou aplicada. Falta validar os dois fluxos em Supabase de teste.

### 2026-10-17 — encerramento da partida e recálculo

- Extraído `finishMatch` para cálculo puro do tempo em `domain`, sequência de encerramento/recuperação em `application` e gravações e início rápido em `infrastructure`. A Server Action mantém autorização de ADM, revalidação, recálculo já existente e agendamento de notificação via `after`.
- Preservada a ordem: consulta da partida na pelada ativa; atualização condicional; gravação de `left_elapsed_seconds` sem filtro `is_active` (o trigger pode desativar jogadores); revalidação; desativação; recálculo; aviso só após sucesso; sugestão da próxima partida. Uma partida já encerrada refaz tempos/estatísticas sem reenviar aviso.
- Testes novos cobrem tempo corrido/pausado, deslocamento oficial, ordem das operações, recuperação idempotente, ausência de novo aviso, falha de atualização, falha dos participantes/estatísticas, parâmetros enviados ao Supabase e sugestão da próxima partida. `npm run check` aprovado: tipagem, 603 testes em 100 arquivos e build.
- Nenhuma migration foi criada ou aplicada. **Risco preexistente:** a atualização da partida, dos participantes e das estatísticas ainda atravessa chamadas separadas; falha intermediária pode deixar estado parcial até nova tentativa. Não mudar a transação sem teste integrado no Supabase de teste. Este lote é estrutural; ainda não há medição de ganho de desempenho.

### 2026-10-17 — registro de gol ao vivo

- Extraído o registro de gol para `src/modules/matches/{domain,application,infrastructure}`. A validação mínima dos IDs fica em domínio, o caso de uso confere a partida antes de gravar e o gateway preserva todos os parâmetros da RPC `register_goal`, inclusive chave de idempotência e gol contra.
- A consulta compartilhada da partida foi movida para infraestrutura sem mudar os filtros por rodada e pelada selecionada. A Server Action continua exigindo ADM, devolvendo placar/evento para a atualização otimista da tela ao vivo e revalidando rodada e Cartola; não revalida a própria tela da partida a cada gol.
- A RPC SQL permanece autoridade para autorização final, escalação, tempo oficial, placar e atomicidade. Nenhuma migration foi criada ou aplicada. Testes novos cobrem validação, ordem da checagem de pelada, idempotência, parâmetros da RPC, escopo entre peladas e falhas. `npm run check` aprovado: tipagem, 592 testes em 96 arquivos e build.
- Pendente: teste integrado com Supabase de teste e medição da latência do fluxo ao vivo. Este lote é estrutural e **não comprova melhora de desempenho**. Os demais fluxos de partidas e pontuação ainda não foram migrados.

### 2026-10-17 — retirada atômica de convidado pelo criador

- Corrigida a retirada pelo criador que fazia `DELETE` e depois tentava chamar `normalize_callup_positions` sem permissão. A Server Action preserva autenticação, seleção da pelada e resposta pública; o caso de uso mantém o aviso ao Cartola somente depois do sucesso.
- Nova RPC `remove_my_added_callup_player` verifica a conta, a participação na pelada, o estado aberto da convocação e a autoria da entrada. Sob bloqueio da convocação e da entrada, ela reutiliza a função interna de retirada que remove o jogador, promove a fila e sincroniza vínculos em uma transação. Não concede `EXECUTE` da normalização interna ao cliente.
- Testes de unidade e gateway atualizados para a chamada atômica, inclusive falhas de estado/autoria e ausência de aviso quando a retirada falha. `npm run check` aprovado: tipagem, 581 testes em 92 arquivos e build.
- Migration: `325_atomic_creator_callup_removal.sql`. **Não aplicada ao banco neste lote. Aplicar e validar no Supabase de teste antes de publicar o código; publicar a migration antes do aplicativo.** Verificação integrada real com duas peladas e confirmação da promoção da fila seguem pendentes.

### 2026-10-17 — convidados e remoção pelo criador

- Extraídos `inviteGuestToCallup` e `removeCallupEntry` para regras puras (nome e autoria), caso de uso e gateway Supabase. As Server Actions continuam verificando autenticação e pelada selecionada, revalidando após sucesso e devolvendo o mesmo contrato à UI. A via administrativa reutiliza o caso de uso de retirada do lote anterior.
- Mantido o RPC `create_callup_guest`, que cria perfil, vínculo e entrada em uma transação; na retirada pelo criador, mantidos estado `open`, checagem de autoria, DELETE protegido por RLS, aviso ao Cartola e tentativa não bloqueante de normalização. A leitura da convocação agora também filtra `league_id`.
- Testes novos cobrem nome inválido, status confirmado/fila, erro do RPC, autorização por autoria, bloqueio após sorteio, via administrativa, erro de DELETE, ordem do aviso e filtros do gateway. `npm run check` aprovado: tipagem, 582 testes em 92 arquivos e build.
- Migrations: nenhuma neste lote. Banco e dados de produção não foram alterados. **Pendência identificada neste lote e tratada no lote posterior com a migration 325:** a migration 017 revoga EXECUTE de `normalize_callup_positions` para autenticados, logo a promoção da fila no caminho anterior não estava garantida. Teste integrado entre duas peladas ainda pendente.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — adicionar e retirar outros jogadores

- Extraídas `adminAddCallupPlayer`, `addRosterPlayerToCallup` e `adminRemoveCallupPlayer` para um caso de uso e gateway Supabase. A retirada administrativa da tela de convocação (`removeCallupEntry`) reutiliza o mesmo caso de uso. Autenticação, checagem de convocação/jogador na pelada ativa e revalidação permanecem nas Server Actions.
- Preservadas as RPCs diferentes para ADM e membro (`admin_add_callup_player` e `add_player_to_callup`), o retorno `confirmed`/`waitlist` da via administrativa, e o aviso ao Cartola somente após remoção bem-sucedida. Elegibilidade, fila, reposição e autorização final continuam no SQL/RLS, sem regras duplicadas no domínio TypeScript.
- Testes novos cobrem seleção da via administrativa/colaborativa, status, falhas e ordem do aviso, além dos parâmetros enviados a cada RPC. `npm run check` aprovado: tipagem, 571 testes em 89 arquivos e build.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. A remoção pelo criador do convidado e o teste integrado entre duas peladas permanecem pendentes.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — entrada e saída do próprio jogador

- Extraídos `joinActiveCallup` e `leaveActiveCallup` para um caso de uso e gateway Supabase. As Server Actions continuam responsáveis por autenticação, confirmação de que a convocação pertence à pelada ativa e revalidação das telas. A entrada preserva a criação/reparação do perfil antes do RPC `join_callup`; a saída preserva a leitura da rodada, o RPC `leave_callup` e o aviso aos usuários afetados no Cartola.
- O banco continua responsável por vagas, fila, elegibilidade e permissões. Não foi criada uma regra de domínio redundante em TypeScript. A leitura da rodada agora também filtra explicitamente por `league_id`.
- Testes novos verificam ordem das operações, retorno `confirmed`/`waitlist`, erros, ausência de aviso após falha, parâmetros dos RPCs e filtro de pelada. `npm run check` aprovado: tipagem, 565 testes em 87 arquivos e build.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. O fluxo completo entre duas peladas ainda precisa de teste integrado em ambiente de teste; a suíte deste lote usa gateways simulados.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

### 2026-10-17 — fechamento, visibilidade e bloqueio da convocação

- Extraídas as três operações de gerenciamento para um caso de uso e gateway Supabase compartilhados. A regra de lotação exata da lista ficou em domínio. As Server Actions mantêm as checagens de ADM, pelada selecionada, mensagens públicas e revalidação no sucesso.
- As gravações e a leitura da capacidade agora incluem explicitamente `league_id`; o bloqueio ainda exige status `open` e mantém os mesmos filtros de jogadores confirmados.
- Testes novos cobrem fechamento, visibilidade, lotação incompleta/completa, erros de leitura/gravação e escopo dos filtros do gateway. `npm run check` aprovado: tipagem, 557 testes em 85 arquivos e build.
- Migrations: nenhuma. Banco e dados de produção não foram alterados. Risco preexistente: a contagem e o bloqueio da lista são operações separadas, sujeitas a alterações concorrentes; uma operação transacional no banco seria necessária para fechar essa janela. Falta testar os fluxos integrados com duas peladas em ambiente de teste.
- Commit: consultar o registro Git deste lote; nenhuma implantação efetuada.

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

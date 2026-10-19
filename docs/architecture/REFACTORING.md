# Refatoração do app — acompanhamento

Este arquivo é a fonte de progresso da migração arquitetural. Atualizar no mesmo commit de cada lote, incluindo o que mudou, testes, migrations, riscos e próximo passo. Não marcar uma área como concluída só por mover arquivos: a ação deve ficar fina e os contratos e fluxos críticos devem estar verificados.

## Decisões vigentes

- Monólito modular e DDD pragmático; regras puras em domínio, orquestração em aplicação e Supabase na infraestrutura. Ver [ADR 001](./adr-001-modular-monolith.md).
- Manter RPCs SQL e RLS como autoridade para transações, consistência e isolamento entre peladas. Não duplicar essas regras em TypeScript.
- A retirada de convidado pelo criador usa RPC específica e atômica, sem conceder acesso direto à normalização interna. Ver [ADR 002](./adr-002-atomic-callup-creator-removal.md).
- As RPCs de substituição, desfazer substituição e disponibilidade conferem o ADM da pelada do alvo, além da RLS. Ver [ADR 003](./adr-003-match-rpc-league-authorization.md).
- A exclusão de gol ao vivo exige autorização de ADM dentro da RPC `SECURITY DEFINER`, não apenas na Server Action. Ver [ADR 004](./adr-004-live-goal-deletion-authorization.md).
- Em correções finalizadas, a RPC concluída é sucesso mesmo se uma projeção posterior falhar; a pendência volta como aviso. Ver [ADR 005](./adr-005-postcommit-finished-goal-corrections.md).
- O Cartola confirma titulares e reserva pelo recibo da RPC transacional, sem uma segunda leitura de reserva; resposta sem ID exige conferência posterior. Ver [ADR 006](./adr-006-fantasy-lineup-atomic-receipt.md).
- Ranking, perfil e elenco interpretam a pontuação pela mesma regra de domínio; o read model detalhado pode ser reutilizado apenas na requisição atual. Ver [ADR 007](./adr-007-canonical-statistics-read-model.md).
- Preservar assinaturas e respostas públicas das Server Actions durante a migração; converter uma fatia vertical por vez.
- Não criar agora tabela de estatísticas acumuladas: a view `player_season_stats` já agrega `player_round_stats`. Medir antes de alterar esquema.

## Etapas

| Etapa | Estado | Evidência / próximo passo |
| --- | --- | --- |
| Base, limites entre camadas e registro de decisões | Em andamento | ADR 001 criado; continuar mapa de dependências e testes de regressão por área. |
| Piloto — criação de pelada no lobby | Concluído | Validação de nome/tipo/visibilidade em domínio; caso de uso com porta para criação; adaptador Supabase; Server Action mantém autenticação, cookie, revalidação e redirecionamento. |
| Convocação e rodadas | Em andamento | Formato, abertura, pré-lista, edição, estado e participação extraídos; retirada pelo criador corrigida no código com migration 325 ainda não aplicada. Falta validação integrada com duas peladas. |
| Partidas e pontuação | Em andamento | Gols ao vivo/finalizados, encerramento, goleiros e substituições extraídos; migrations 326–327 corrigem autorização SQL (não aplicadas); falta teste integrado e recuperação de projeções. |
| Cartola e cosméticos | Concluído nesta fase | Salvamento de escalação, comandos administrativos, mutações/limpezas do Passe, equipamento da conta, painel, loadouts, prévia e inventário extraídos. As projeções analíticas extensas ficam na etapa de estatísticas. |
| Pagamentos | Concluído nesta fase | Itens, parcelas, PIX, rateio, obrigações, checklist e auditoria separados em domínio, aplicação e infraestrutura, mantendo RPCs e escopo por pelada. |
| Estatísticas e demais áreas | Concluído nesta fase | Pontuação canônica extraída; leitores de temporada/histórico separados; ranking duplicado removido; cache limitado à requisição. Projeções analíticas do Cartola continuam como trabalho futuro separado. |
| Avaliação de tabela de acumulados | Instrumentada; sem justificativa para criar | Logs opcionais agora agregam p50/p95. Coletar amostra no Supabase de teste e analisar plano SQL antes de reconsiderar uma tabela. |

## Registro de lotes

### 2026-10-19 — consolidação e medição das estatísticas

- Criado `modules/statistics` com regra de pontuação em domínio, composição do modelo do elenco em aplicação e leitores Supabase em infraestrutura. `ranking_points` passa a ser a fonte oficial, com fallback legado; amistosos continuam fora do ranking. O perfil calcula os pontos Ranked pelas seis melhores participações, como a classificação.
- Removido o segundo leitor de ranking que somava toda a temporada. `getRanking`, página completa, home e cartões agora convergem para `getRankingExperienceData`. A projeção detalhada usa `React.cache` somente dentro da requisição atual, sem compartilhar sessão, temporada ou pelada entre usuários.
- O histórico do jogador deixou de usar `select(*)` e solicita somente os campos usados. O fallback do elenco também reduziu o payload. A view `player_season_stats` continua sendo o agregado leve; não foi criada tabela nova.
- `STATS_QUERY_DIAGNOSTICS=1` registra cada consulta sem IDs ou dados pessoais. A cada 20 amostras por operação/fonte (ajustável por `STATS_QUERY_SUMMARY_EVERY`) também registra contagem, falhas, linhas médias, p50, p95 e máximo. A memória é limitada às 200 amostras mais recentes por chave e existe somente no processo atual.
- Auditoria estática confirmou os índices existentes para os filtros usados. `npm run check` aprovado: tipagem, 762 testes em 143 arquivos e build de produção. Nenhuma migration foi criada ou aplicada; nenhum dado foi alterado.
- Pendente operacional: no Supabase de teste representativo, coletar ao menos 20 amostras de ranking, elenco e histórico; registrar p50/p95 e executar `EXPLAIN (ANALYZE, BUFFERS)` somente nas consultas cujo p95 permanecer alto. Sem essa evidência não há justificativa para tabela acumulada ou novo índice.

### 2026-10-19 — conclusão estrutural de pagamentos

- `src/lib/actions/payments.ts` passou a concentrar somente autenticação/autorização de entrada, seleção da pelada/temporada, revalidação e contratos públicos. Tipos e validações de itens, parcelas, destinatários PIX e detalhes da cobrança foram movidos para `modules/payments/domain`; a ordem das operações ficou em `application/payment-commands.ts`; consultas e RPCs foram isoladas em dois adaptadores Supabase.
- Preservados os filtros de `league_id` para itens, destinatários, rodadas e auditoria. A cobrança só pode ser sincronizada em rodada finalizada; o destinatário precisa estar ativo na pelada; parcelas anteriores mais parcelas lançadas não podem exceder o total; a limpeza da Coletiva só ocorre depois da confirmação do pagamento. Revalidações agora são executadas somente após sucesso.
- O rateio continua autoritativo nas RPCs `update_round_payment_details_v2`, `sync_round_payment_plan` e `set_round_payment_obligation_paid`. Se os dados principais forem gravados e a recomposição do rateio falhar, o contrato continua informando explicitamente o sucesso parcial para evitar repetição cega da primeira gravação.
- `npm run check` aprovado: tipagem, 754 testes em 141 arquivos e build de produção. Os testes novos cobrem validações, isolamento, limite de parcelas, ordem de gravação, pagamento, falha parcial e parâmetros das RPCs.
- Nenhuma migration criada ou aplicada; nenhum pagamento real foi alterado. Pendente de implantação: teste integrado no Supabase de teste com duas peladas, incluindo item parcelado, edição de parcelas anteriores, múltiplos destinatários e correção do rateio.

### 2026-10-19 — conclusão da fase Cartola e cosméticos

- As operações administrativas restantes de `fantasy.ts` foram separadas: configuração, prévia de mercado, reprocessamento com regras salvas/atuais, reparo legado e sessões de teste agora usam domínio, casos de uso e gateway Supabase. A reconstrução dos scouts continua obrigatoriamente antes do reprocessamento e a rodada é conferida na pelada selecionada antes de qualquer RPC.
- As leituras de pacotes, inventário, contagem leve e carta ativa saíram de `fantasy-cards.ts`. O adaptador mantém `user_id + league_id` no inventário e na ativação; pacotes oriundos de rodada ou Passe são filtrados pela pelada derivada das relações persistidas. O mapeamento de relações e agrupamento de cartas ficou no domínio.
- A parte já extraída de cosméticos permanece global por conta onde previsto, enquanto temporada, Passe e prévia continuam escopados pela pelada. As grandes projeções de dashboard, ranking e histórico ainda presentes em `fantasy.ts` são modelos de leitura analíticos e serão tratadas junto da consolidação de estatísticas, não como mutações desta fase.
- `npm run check` aprovado: tipagem, 754 testes em 141 arquivos e build de produção. Testes novos cobrem payload de configurações, pelada básica, escopo de temporada/rodada, ordem do recálculo, roteamento das RPCs, relações do Passe e isolamento do inventário.
- Nenhuma migration criada ou aplicada; nenhum reprocessamento, reparo ou alteração de inventário foi executado em banco. Pendente de implantação: validar as RPCs e os leitores no Supabase de teste com duas peladas e conferir visualmente Cartola, Passe, inventário e painel administrativo.

### 2026-10-18 — limpezas administrativas do Passe

- Extraídas `cleanupMyLegacyCosmeticsPreview`, `dismissMyUnopenedBronzePassPack` e `resetMyTestPassRewardClaims` para `application/admin-cleanup.ts` e `infrastructure/supabase-admin-cleanup-gateway.ts`. A consulta da temporada do Cartola, compartilhada com resgate e compra, agora fica no gateway e continua filtrada por `season_id` e `league_id`.
- As Server Actions continuam exigindo sessão e papel ADM da pelada selecionada antes de consultar a temporada. O reset confere o ID enviado contra a temporada selecionada antes da RPC. As três RPCs recebem `p_fantasy_season_id`; a migration 263 já impõe `is_league_admin` no banco e limita a alteração à própria conta. Mensagens públicas, contagens e caminhos revalidados após sucesso foram preservados.
- `npm run check` aprovado: tipagem, 717 testes em 131 arquivos e build de produção. Doze testes novos cobrem ausência/troca de temporada, negação antes da consulta, parâmetros das RPCs, erros, contagens e revalidação somente após sucesso.
- Nenhuma migration criada ou aplicada; nenhuma limpeza foi executada contra banco real neste lote. Pendente: validar as três RPCs no Supabase de teste com duas peladas e confirmar o comportamento visual da coleção após cada operação. O lote é estrutural, sem ganho de velocidade medido.

### 2026-10-18 — prévia administrativa dos cosméticos

- A prévia de `getAdminCosmeticsPreview` foi extraída para `application/admin-preview.ts` e `infrastructure/supabase-admin-preview-gateway.ts`. A Server Action mantém a identidade da sessão; o caso de uso exige ADM da pelada selecionada e que o jogador solicitado seja o perfil vinculado à própria conta **antes** de consultar o catálogo.
- Os IDs recebidos por URL continuam sendo conferidos com o catálogo e com o slot de cada item. Entradas adulteradas com slots desconhecidos ou IDs que não sejam strings são descartadas; IDs repetidos geram uma só consulta. O retorno público continua limitado às oito chaves visuais, nunca às linhas brutas do catálogo.
- `npm run check` aprovado: tipagem, 705 testes em 128 arquivos e build de produção. Sete testes novos cobrem negação pré-consulta, entrada adulterada, correspondência do slot, erro/catálogo vazio e filtros enviados ao Supabase.
- Nenhuma migration criada ou aplicada e nenhum banco alterado. Não há ganho de desempenho medido. Pendente: teste integrado da prévia no Supabase de teste. As operações administrativas de limpeza foram extraídas no lote seguinte.

### 2026-10-18 — leitura dos cosméticos equipados

- Extraídas as leituras de `getMyEquippedCosmetics`, `getPlayerEquippedCosmetics` e `getAllPlayersEquippedCosmeticsMap` para `src/modules/cosmetics/infrastructure/supabase-loadout-reader.ts`; o mapeamento de slots e perfis fica em `application/build-equipped-summary.ts`. As Server Actions preservam assinaturas, uso do cliente de sessão e `React.cache` somente por requisição para o próprio perfil.
- Mantidos os filtros por `user_id` e `player_id`, a deduplicação dos IDs pedidos, o caminho sem filtro já existente e o fallback para as seis relações antigas caso a seleção de `showcase`/`pitch` falhe. Não foi introduzido cache global ou consulta de serviço. O preview administrativo continua com sua checagem própria na Action e será tratado separadamente.
- `npm run check` aprovado: tipagem, 698 testes em 126 arquivos e build de produção. Doze testes novos cobrem slots atuais/legados, associação conta–jogador, filtros, lista vazia e fallback nas leituras individual e coletiva.
- Nenhuma migration criada ou aplicada e nenhum banco alterado. A mudança é estrutural, sem ganho de desempenho medido. Pendente: validar as relações reais no Supabase de teste com duas peladas e conferir visualmente perfil e elenco após troca de pelada.

### 2026-10-18 — leitura do painel de cosméticos no adaptador Supabase

- As consultas de `getMyCosmeticsDashboard` foram movidas para `src/modules/cosmetics/infrastructure/supabase-dashboard-reader.ts`. A Server Action mantém autenticação e seleção da pelada/temporada; o adaptador retorna as linhas tipadas para o modelo de leitura extraído no lote anterior. O cliente da sessão e a RLS continuam sendo usados, sem acesso de serviço.
- Preservados os filtros de `league_id` na descoberta da temporada do Cartola, `user_id` na coleção, escolhas, loadout, Passe e loja, e `fantasy_season_id` nas leituras sazonais. Coleção, catálogo e loadout seguem disponíveis mesmo quando a pelada não tem temporada do Passe. As sete leituras continuam paralelas; erros de coleção, catálogo ou recompensas tornam o painel indisponível, enquanto erros de Passe/loja permanecem não bloqueantes.
- `npm run check` aprovado: tipagem, 686 testes em 124 arquivos e build de produção. Sete testes novos verificam os filtros, ausência de temporada, falhas obrigatórias e falhas complementares. Não há schema TypeScript gerado para os embeds do PostgREST: o adaptador faz casts explícitos nos relacionamentos singulares; a forma real da resposta ainda precisa de teste integrado.
- Nenhuma migration criada ou aplicada e nenhum banco alterado. O lote não muda a quantidade de consultas nem comprova ganho de velocidade. Pendente: teste integrado no Supabase de teste com duas peladas e medição da tela antes de qualquer cache ou otimização de consulta.

### 2026-10-18 — modelo de leitura do painel de cosméticos

- Extraído de `getMyCosmeticsDashboard` o mapeamento da coleção, recompensas, equipamento e loja para `src/modules/cosmetics/application/build-dashboard.ts`, com tipos de entrada/saída em `domain/dashboard-types.ts`. A Server Action continua responsável por sessão, pelada/temporada ativa e consultas; as sete leituras paralelas e o formato público da resposta foram preservados.
- O modelo mantém a coleção e o equipamento globais da conta mesmo sem temporada do Cartola na pelada atual. A escolha explícita da recompensa prevalece, com fallback pela proveniência de resgates antigos; a prévia do catálogo continua restrita a ADM e omite molduras legadas. Opções nulas de uma recompensa são tratadas como lista vazia, como antes.
- `npm run check` aprovado: typecheck, 679 testes em 123 arquivos e build de produção. Os cinco testes novos cobrem retorno vazio, coleção global, catálogo de ADM, escolha/proveniência e saldo/itens da loja.
- Nenhuma migration criada ou aplicada; banco e produção não foram alterados. Este lote é estrutural e **não demonstra melhora de desempenho**. Continuam pendentes a separação das consultas em gateway tipado, teste integrado com duas peladas no Supabase de teste e medição da carga da tela antes de otimizar consultas.

### 2026-10-18 — equipar cosméticos globais da conta

- `equipCosmetic` agora usa validação de slot em domínio, caso de uso para execução e gateway Supabase para a RPC `equip_account_cosmetic`. A Server Action continua exigindo sessão e revalidando as mesmas telas; equipar e desequipar (`null`) mantêm o contrato público.
- O slot é conferido em runtime antes de chamar o banco, pois uma Server Action recebe dados não confiáveis. A RPC da migration 317 permanece autoridade para posse global do item, correspondência entre item e slot e gravação do loadout da conta. Não foi feita uma segunda consulta ou regra de posse em TypeScript.
- `npm run check` aprovado: typecheck, 674 testes em 122 arquivos e build de produção. Testes novos cobrem todos os slots, entrada adulterada, equipar/desequipar, parâmetros e erro da RPC.
- Nenhuma migration criada ou aplicada. Ainda falta teste integrado em Supabase de teste com duas peladas que compartilham a mesma conta, inclusive visibilidade após a troca de pelada.

### 2026-10-18 — resgate e compra de cosméticos do Passe

- `claimPassCosmetic` e `purchaseSeasonPassShopItem` agora usam domínio para validação e mensagens, aplicação para a sequência de vínculo/compra, e gateway Supabase para consultas e RPCs. As Server Actions mantêm autenticação, temporada da pelada selecionada, revalidação e o contrato de retorno usado pela interface.
- Preservados os filtros da recompensa por temporada e do item da loja por temporada e usuário. As RPCs `claim_fantasy_pass_cosmetic` e `purchase_fantasy_pass_shop_item` continuam autoridade transacional para desbloqueio, saldo, inventário global e autorização. Nenhuma política foi enfraquecida nem substituída por checagem do cliente.
- `npm run check` aprovado: typecheck, 670 testes em 119 arquivos e build de produção. Testes novos cobrem mensagens, bloqueio antes da RPC, vínculos e payloads de ambas as RPCs.
- Nenhuma migration criada ou aplicada. Falta teste integrado com duas peladas e compras/resgates reais no Supabase de teste. A leitura prévia de vínculo ainda trata erro de consulta como ausência, preservando o contrato atual; diagnósticos mais explícitos ficam para outro lote.

### 2026-10-17 — confirmação do banco de reserva do Cartola

- A RPC `save_fantasy_lineup_with_reserve` já grava escalação e reserva na mesma transação. Removida a consulta posterior de `fantasy_lineup_reserves`, que podia falhar após o commit e induzir o usuário a repetir o salvamento. O ID retornado pela RPC agora é o recibo da gravação; sem ID e sem erro, o resultado pede conferência e mantém o rascunho local. Ver [ADR 006](./adr-006-fantasy-lineup-atomic-receipt.md).
- Falha ao revalidar as telas depois da gravação passa a ser aviso, não falha de salvamento. A interface prioriza o aviso e só limpa o rascunho quando o recibo confirma a escalação; sempre solicita atualização dos dados após sucesso.
- `npm run check` aprovado: typecheck, 663 testes em 116 arquivos e build de produção. Os testes do caso de uso cobrem recibo confirmado, resposta sem ID e erro da RPC; o gateway garante que não há leitura pós-gravação.
- Nenhuma migration criada ou aplicada. Falta validação integrada em Supabase de teste da resposta com reserva e da leitura posterior. Erro de rede entre o commit e a resposta da RPC segue ambíguo.

### 2026-10-17 — salvamento da escalação do Cartola

- Extraído `saveFantasyLineup` para validações e mapeamento dos slots em domínio, escolha entre rodada de teste/oficial e verificação da reserva em aplicação, e chamadas Supabase em infraestrutura. A Server Action mantém autenticação, pelada ativa, revalidação e contrato público. As RPCs SQL seguem responsáveis por elegibilidade, mercado, preços e autorização final.
- O tamanho exigido continua vindo do snapshot da rodada, com fallback para a configuração da pelada. Preservadas as mensagens de validação, os parâmetros das duas RPCs e a confirmação de reserva após salvar. Uma falha na consulta de sessão de teste agora interrompe o salvamento, evitando enviar por engano à rotina oficial.
- `npm run check` aprovado: typecheck, 663 testes em 116 arquivos e build de produção. Testes novos cobrem validação, isolamento por pelada, caminhos oficial/de teste, falhas das RPCs, parâmetros e verificação do banco de reserva.
- Nenhuma migration criada ou aplicada. Falta teste integrado em Supabase de teste com duas peladas e rodadas oficiais/de teste. A confirmação posterior da reserva foi eliminada no lote seguinte, com base na atomicidade da RPC.

### 2026-10-17 — correção de gols em partidas finalizadas

- Remover, editar autor/assistência e adicionar gol passaram a compartilhar validação de domínio, caso de uso e gateway Supabase. A Server Action mantém autenticação, a confirmação `EDITAR`, mensagens públicas e revalidação. As RPCs da migration 280 continuam autoridade para elegibilidade, placar, auditoria e autorização pela pelada.
- O recálculo de Ranking, Cartola e Overall continua sequencial e fora da transação da RPC. Após a RPC confirmar a mutação, falhas nessas etapas agora devolvem `success: true` com `warning`, inclusive nos fluxos de remoção e edição. A tela mostra o aviso e atualiza os dados, reduzindo o risco de repetição de uma correção já salva. Ver [ADR 005](./adr-005-postcommit-finished-goal-corrections.md).
- Verificação local: `npm run check` passou (typecheck, 653 testes em 113 arquivos e build de produção). Os testes novos cobrem os três comandos, escopo da pelada, resposta incompleta da RPC e falhas antes/depois da gravação.
- Nenhuma migration nova ou aplicação no banco neste lote. Permanecem pendentes testes integrados com duas peladas e um caminho de recuperação quando as projeções falharem; erro de rede depois do commit da RPC ainda exige inspeção antes de repetir.

### 2026-10-17 — exclusão de gol ao vivo e autorização da RPC

- Extraída `deleteEvent` para validação em domínio, sequência de checagens em aplicação e gateway Supabase. A Server Action preserva a exigência de ADM, o contrato do placar, os erros e as revalidações de partida, rodada e Cartola após sucesso. A RPC permanece responsável pela exclusão e ajuste atômico do placar.
- Identificada lacuna preexistente: `delete_match_event` era `SECURITY DEFINER` e não verificava a conta chamadora. A migration `327_scope_live_goal_deletion_to_league.sql` exige `is_league_admin()` da liga da partida antes da mutação e revoga `EXECUTE` anônimo; ver [ADR 004](./adr-004-live-goal-deletion-authorization.md).
- O ensaio descartável entre duas peladas foi ampliado para chamadas diretas à RPC com partida pendente: jogador comum e ADM de outra pelada devem falhar na autorização; ADM da pelada sem papel global deve chegar à validação do estado. Esse ensaio **não foi executado** neste lote e não cobre exclusão real em partida ao vivo.
- Testes novos cobrem entrada inválida, ordem das checagens, evento de outra partida/pelada, payload da RPC, placar retornado e falhas. `node --check` no ensaio e `npm run check` aprovados: tipagem, 639 testes em 110 arquivos e build.
- Migrations 325–327 ainda não aplicadas. Aplicar em ordem e validar no Supabase de teste antes de publicar. Testar também a exclusão real do gol, placar, eventos e reprocessamento posterior em duas peladas.

### 2026-10-17 — desfazer a última substituição

- Extraída `undoLastMatchSubstitution` para validação em domínio, sequência de checagem/execução em aplicação e gateway Supabase. A Server Action mantém autenticação de ADM, resposta pública, tratamento de erros e revalidação após sucesso.
- Preservados o escopo da partida na pelada selecionada, o vínculo da substituição à partida e os parâmetros da RPC `undo_last_match_substitution`. A rodada para revalidação vem da primeira leitura da partida, evitando a segunda consulta depois da gravação e uma falha tardia que poderia relatar erro apesar do desfazer ter ocorrido.
- Testes novos cobrem entradas ausentes, ordem das checagens, substituição de outra partida, filtro do gateway, payload da RPC e erros. `npm run check` aprovado: tipagem, 632 testes em 108 arquivos e build. Não houve migration neste lote; a autorização final continua na RPC e depende da migration 326 para ADMs sem papel global. Falta ensaio integrado em Supabase de teste com duas peladas e uma partida real.

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

1. Em ambiente de teste representativo, ativar `STATS_QUERY_DIAGNOSTICS=1` temporariamente e carregar ranking, elenco e histórico repetidas vezes, com temporada curta e longa. O evento `stats_query_summary` já informa p50/p95, linhas médias e erros por operação a cada 20 amostras; `STATS_QUERY_SUMMARY_EVERY` altera o intervalo. Essa métrica mede a consulta/agregação, não todo o carregamento da página.
2. Examinar com `EXPLAIN (ANALYZE, BUFFERS)` as consultas lentas em cópia de dados ou ambiente seguro; conferir índices e filtros de temporada/pelada antes de mudar o esquema. Não executar explicações pesadas no banco oficial sem janela apropriada.
3. Medir a página no navegador separadamente (rede, JavaScript e renderização). Um gargalo de interface não justifica tabela de totais.
4. Primeiro otimizar consulta, seleção de colunas, índices e leituras redundantes. Somente considerar acumulados se a consulta ainda dominar a latência de forma consistente.
5. Se houver tabela: chave por pelada, temporada, tipo de rodada e jogador; reconstrução dos dados antigos; atualização após finalização, edição ou reprocessamento; teste de paridade com `player_round_stats`; RLS e rollback próprios. A fonte original permanece autoritativa até a paridade ser comprovada.

## Critério de conclusão de cada lote

- Tipagem, testes e build aprovados; cenários de segurança e isolamento pertinentes executados.
- Nenhuma regra nova dependente do cliente; autorização preservada dentro do caminho da ação e do banco.
- Registrar migrations, resultados, riscos e commit neste arquivo antes de iniciar o lote seguinte.

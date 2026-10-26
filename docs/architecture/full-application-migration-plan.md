# Plano de migração da aplicação inteira

**Estado em 25/10/2026:** plano de execução, não declaração de conclusão. A branch `codex/architecture-reorganization-continued` contém o primeiro recorte vertical de peladas (oito operações de lobby/admin com backend e ponte de Server Actions), o piloto de registro de gol e um núcleo puro de ranking sem API. As pontes permanecem desativadas por padrão fora da homologação local e o frontend ainda usa majoritariamente o caminho antigo. A remoção do código legado é o **último lote da refatoração**, depois de paridade e testes locais.

**Execução iniciada:** `npm run audit:migration` valida o catálogo de progresso contra as 267 operações e contra os arquivos usados como evidência. Oito operações do contexto de peladas estão em `frontend-migrated`; o registro de gol segue em `backend-pilot`. Nenhuma foi marcada como verificada de ponta a ponta: a flag local ainda precisa ser exercitada pelas telas com duas contas e duas peladas antes de avançar para `verified`.

Este plano interpreta a proposta em `REFACTOR_PROMPT.md` conforme as dependências reais do projeto. O [mapa de contextos](application-context-map.md), [`application-contexts.json`](../../architecture/application-contexts.json) e [`application-operations.json`](../../architecture/application-operations.json) são o inventário de escopo. `npm run audit:contexts` confirmou **15 contextos, 9 módulos, 58 páginas, 41 arquivos de entrada e 267 operações exportadas**. `npm run audit:architecture` encontrou, por busca estática aproximada, 127 arquivos de código com padrões de Supabase SDK, 91 de Auth, 4 de Storage e 9 de Realtime. Esses números medem o trabalho a substituir; não indicam paridade funcional.

## Arquitetura de destino e decisões

```text
frontend/                         Next.js: telas, estado otimista, cliente HTTP e SSE
backend/src/contexts/<contexto>/  domínio, casos de uso, portas, PostgreSQL e rotas
backend/src/shared/               identidade, escopo, transações, erros e outbox
database/                         baseline, migrations incrementais, paridade e restore
deploy/                           Compose, proxy HTTPS, volumes, backup e observabilidade
```

- **Banco e serviços:** usar PostgreSQL 17 na stack Supabase auto-hospedada no primeiro corte. As migrations atuais dependem de `auth.users`, RLS, papéis e Storage; um contêiner PostgreSQL 16 vazio com scripts de inicialização não reproduz o app. Auth e Storage ficam locais, atrás dos adaptadores do backend. Retirá-los futuramente será outra decisão, com migração própria. Ver [ADR 011](adr-011-frontend-backend-local-postgres.md).
- **Limites:** cada contexto concentra suas regras. Domínio e aplicação não importam Next, Fastify ou cliente Supabase. O backend é a entrada para comandos e consultas migrados; o navegador usa o cliente HTTP do próprio app. Ações de interface podem continuar finas durante a transição.
- **Autoridade transacional:** manter inicialmente as RPCs SQL e a RLS existentes nas operações complexas. Só substituir uma RPC por TypeScript depois de provar paridade de autorização, concorrência, atomicidade e resultado. Usar papel de conexão limitado com identidade verificada; nunca aceitar `userId` ou papel informado pelo cliente como autoridade.
- **Eventos:** fatos entre contextos são gravados em outbox na mesma transação do comando. Consumidores têm chave de idempotência e reprocessamento. SSE entrega snapshot autorizado, sequência de eventos e reconexão; um `EventEmitter` isolado não é a única fonte de estado.
- **Integrações externas:** Google OAuth, Storage, QStash, Resend, Web Push e BQ Manager entram por portas próprias, com credenciais fora do repositório. Migrar os jobs e suas tentativas de reenvio junto com o contexto que os produz; preservar links públicos/privados e o comportamento PWA das telas.
- **Ranking:** preservar seis melhores rodadas, filtros e desempates atuais. Comparar a nova consulta/projeção com o resultado existente antes de otimizar ou materializar.
- **Migrações:** criar baseline e runner de versão para instalações limpas e upgrades. `/docker-entrypoint-initdb.d` não substitui migrations futuras. O dump de testes restaurado localmente não continha `create_league_for_user`; por isso a migration 313 foi aplicada localmente, assim como a 351. Antes dos fluxos completos, reconciliar o estado real das **357 migrations SQL** com o esquema da origem e do destino; a numeração não prova aplicação.

## Controle de cobertura

Cada uma das 267 operações terá registro de migração com: origem, contexto, destino (`rota`, `job`, `estado de interface` ou `descontinuada com justificativa`), contrato de entrada/saída, regra de acesso, transação/efeitos, teste de paridade e tela consumidora. Consultas internas compartilhadas devem ter contexto dono ou projeção explícita. Uma operação só fica concluída quando o caminho novo é usado pela interface e o caminho antigo não recebe tráfego. Atualizar catálogo e estado no mesmo commit de cada fatia; `audit:contexts` continua obrigatório.

| Contexto | Operações | Entrega funcional para concluir |
| --- | ---: | --- |
| Identidade e acesso | 8 | login, cadastro, Google OAuth, redefinição, sessão, perfil e papéis globais |
| Peladas | 27 | criação, catálogo, entrada, convites, pedidos, membros, temporadas, estádios e configuração |
| Elenco | 35 | cadastro, edição, importação, vínculo e mescla de identidade, aptidão, velocidade e privacidade |
| Convocações | 21 | abertura, convite, confirmação, fila, retirada, pré-lista, fechamento e concorrência de vagas |
| Rodadas e times | 38 | criação, sorteio, draft, escalação, estado, início e encerramento |
| Partidas | 21 | abertura, relógio, gol, correção, substituição, goleiro, encerramento e placar ao vivo |
| Estatísticas | 22 | scouts, reprocessamento, ranking, overall, histórico e configuração de pontos |
| Cartola | 22 | mercado, escalação, preços, pontuação, carteira, classificação e histórico |
| Cartas | 15 | pacotes, concessão, abertura, inventário, resgate e ativação |
| Cosméticos | 11 | loja, propriedade, loadout, passe e recompensas |
| Financeiro | 19 | cobranças, PIX, pagamentos, despesas, parcelas, obrigações e auditoria |
| Coletiva | 8 | publicação, edição, exclusão, leitura e acesso por pelada |
| Notificações | 16 | inbox, preferências, push, lembretes, cancelamento e jobs internos |
| Integrações | 2 | BQ Manager e credenciais/fontes externas isoladas |
| Operação | 2 | métricas, observabilidade, saúde e rotinas administrativas |

As contagens são de **operações exportadas**, não de endpoints necessários: um caso de uso pode atender mais de uma entrada, e algumas operações pertencem apenas à interface. Todas precisam de destino ou justificativa de retirada.

## Sequência de implementação

Cada lote é dividido em fatias verticais pequenas: contrato e fixture de paridade; domínio/aplicação; adaptador e rota; cliente/tela; testes; ativação local. As dependências entre contextos determinam a ordem abaixo.

| Lote | Trabalho | Condição para avançar |
| --- | --- | --- |
| **0. Baseline verificável** | Congelar inventário e resultados representativos; comparar migrations, funções, grants, RLS, índices e extensões entre origem de teste e destino; criar runner versionado e instalação limpa repetível. | Restore local repetido sem diferença inexplicada; Auth, Storage e duas peladas com perfis distintos verificados. |
| **1. Plataforma comum** | Completar backend compartilhado: sessão/cookie, CSRF, papéis e escopo, PostgreSQL com transação, erros, idempotência, outbox, jobs, logs e contratos HTTP. Preparar cliente tipado, configuração local, proxy e Compose. Mover o Next para `frontend/` em commit mecânico separado e manter as telas funcionando. | Build e testes isolados de frontend/backend; sessão expirada e acesso cruzado negados; Compose sobe do zero no computador. |
| **2. Núcleo de contas e peladas** | Migrar **identidade, peladas e elenco** completos. Expandir o piloto `POST /api/leagues` para consultas e comandos restantes; resolver conta↔jogador e mídia de perfil; trocar as telas desses contextos para API. | Login real, Google OAuth de teste, senha, convites, membro/ADM de duas peladas e upload/download passam localmente. |
| **3. Jogo operacional** | Migrar **convocações, rodadas/times e partidas** completos. Reusar RPCs transacionais até provar substituições; implementar gol, desfazer/corrigir, relógio, substituição, goleiro, encerramento e SSE com snapshot/outbox. | Jornada convocar→sortear→jogar→encerrar passa; retry, concorrência, reconexão/restart e isolamento por pelada passam. |
| **4. Pontuação e dinheiro** | Migrar **estatísticas, Cartola e financeiro** com consumidores idempotentes para efeitos de partida/rodada. Conferir ranking oficial, overall, escalação, mercado, obrigações e pagamentos. | Paridade dos resultados do banco de testes e nenhuma dupla recompensa/cobrança em replay. |
| **5. Complementos** | Migrar **cartas, cosméticos, coletiva, notificações, integrações e operação**. Transferir cron/jobs internos para worker/backend e substituir canais Realtime restantes após paridade. | Todas as 15 áreas têm tela, API/job, autorização, testes e observabilidade; nenhum fluxo ativo depende das antigas Server Actions. |
| **6. Homologação integral local** | Executar suíte completa, jornadas Playwright, teste multi-pelada, Auth/Storage/Google, dados e arquivos restaurados, backup+restore do destino, carga e p95. Corrigir diferenças. Testar frontend e backend no Compose final no computador. | Checklist abaixo inteiro aprovado; nenhuma chamada ao Supabase Cloud no runtime; o usuário consegue testar o app completo localmente antes da VPS. |
| **7. Limpeza do repositório** | Remover, em commits por área, código e pastas antigas sem consumidores; atualizar imports, scripts, catálogos, docs e dependências. Recriar ambiente do zero a partir de checkout limpo. | Build, testes, auditorias, instalação limpa e restore continuam aprovados **depois** da remoção. |
| **8. VPS e banco real** | Ensaiar na VPS dimensionada sem tráfego; então seguir [PRODUCTION-MIGRATION.md](../../database/PRODUCTION-MIGRATION.md) com backup recente, janela sem escritas, importação, Storage, verificação, corte e retorno. | Dados oficiais só entram depois da aprovação local e da prova de backup/restore; produção só recebe tráfego após smoke e autorização. |

## Critério de pronto de cada contexto

1. Entradas do inventário com destino e dono explícitos; contrato HTTP/evento versionado onde necessário.
2. Regras e validação no domínio/aplicação, infraestrutura isolada, autenticação e autorização de servidor; testes com membro, ADM local, ADM de outra pelada e sessão vencida.
3. Mutações atômicas, retry idempotente ou recuperação de resposta incerta, e efeitos entre contextos após commit.
4. Leituras e telas conectadas ao novo caminho, incluindo estados vazios, erro, offline/reconexão quando aplicável e acessibilidade básica.
5. Paridade com fixtures do comportamento anterior e com o banco de testes restaurado; nenhuma diferença de dados sem explicação.
6. Testes de unidade/contrato onde há regra, testes integrados para SQL/RLS e pelo menos uma jornada E2E da área; typecheck, build e auditorias aprovados.
7. Flag local ativada e observada; o caminho legado permanece disponível até a homologação integral. Depois, é candidato à limpeza final.

## Aceite local antes da limpeza e da VPS

- **Dados:** instalação limpa + migrations; restauração do dump de testes; contagens e amostras de linhas por pelada/temporada; grants, RLS, Storage e backup/restauração do próprio destino.
- **Jornadas:** cadastro/login/logout/recuperação; criar/entrar em pelada; jogador; convocação; draft; partida ao vivo e encerramento; ranking; Cartola, cartas/passe; pagamentos; coletiva; notificações; integrações e administração.
- **Segurança:** conta comum, ADM da pelada, ADM de outra pelada e sessão expirada em comandos e leituras; URLs privadas de mídia; jobs autenticados.
- **Resiliência:** dois ADMs concorrentes, falha de rede após commit, retry de gol/escalação/pagamento, restart do backend no SSE e processamento repetido da outbox.
- **Qualidade:** `npm run audit:contexts`, typecheck, testes e build de ambos os pacotes, Playwright e teste multi-pelada; auditoria de chamadas antigas com revisão manual dos falsos positivos. Medir toque→pintura, toque→recibo e commit→espectador antes de afirmar ganho de latência.

## Limpeza final do repositório

O pedido de limpeza significa **remover o que foi substituído**, preservando dados, histórico e ferramentas necessárias. Primeiro gerar lista rastreável com `git ls-files` e buscas de import/referência; revisar cada grupo e confirmar que o novo caminho passou no aceite local. Então remover em commits separados:

1. Server Actions antigas, adaptadores Supabase e módulos sob `src/` que ficaram sem consumidor após a mudança para `frontend/` e `backend/`; apagar flags e pontes temporárias junto com seus testes de compatibilidade.
2. Configuração Next, assets e scripts duplicados na raiz após a transferência para `frontend/`; dependências npm sem uso, aliases obsoletos e imports mortos.
3. Documentação de progresso substituída, experimentos e artefatos versionados que não servem ao produto, **após conferir propriedade e referências**. `scratch/`, `reports/`, `manager/` e o POC de placar exigem inspeção antes de qualquer remoção; a existência dessas pastas não prova que são lixo.
4. Migrations históricas só saem de `supabase/migrations/` depois que `database/` tiver baseline auditável, caminho de upgrade testado e registro das versões já aplicadas. Manter cópia rastreável no histórico Git; nunca remover o único caminho reproduzível para criar ou atualizar o banco.

Depois da limpeza, rodar a mesma matriz de aceite em **checkout limpo** e verificar que não restaram imports, scripts ou variáveis de ambiente apontando para o Supabase Cloud ou para pastas removidas. Dados de produção, dumps, `.env` e chaves continuam fora do Git. Só então preparar a VPS.

# Homologação local da migração no Windows

**Destino escolhido:** Docker no computador do proprietário, dentro de Ubuntu/WSL2. Este ambiente é descartável e serve para ensaiar a restauração do **projeto de testes** antes de qualquer exportação do banco oficial. A produção continua no Supabase Cloud até o corte planejado em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md).

**Situação em 25/10/2026:** Windows 10 Home 22H2, 16 GB de RAM e 4 processadores lógicos. Ubuntu 26.04.1 já roda em WSL2; Docker Engine 29.9.2, Compose 5.6.1 e Supabase CLI 2.122.0 estão instalados. A stack local da tag `self-hosted/v0.8.3` (commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`) está em `/home/danie/pelada-homologacao/supabase-project`, com PostgreSQL 17.6. As portas 8000, 5432 e 6543 estão vinculadas somente a `127.0.0.1`. O banco **de testes** já foi restaurado; nenhum dado do banco real de produção foi importado.

### Exportação do banco de testes, já concluída

O comando usado no PowerShell normal do Windows foi:

```powershell
wsl --user root --exec bash /home/danie/pelada-homologacao/export-test.sh
```

O script [`export-test-supabase-wsl.sh`](../scripts/export-test-supabase-wsl.sh) também está versionado nesta branch e foi copiado para a pasta de homologação. Ele pede **a senha do banco de testes** sem exibi-la, exporta `roles.sql`, `schema.sql` e `data.sql` com a Supabase CLI para uma pasta privada em `/home/danie/pelada-homologacao/exports/` e imprime somente caminho e hashes SHA256. A URL usa o session pooler do projeto de testes `dukjlpdkyngiqxffrxgc`. Não envie senha, `.env`, arquivos SQL ou logs sem anonimização pelo chat. Após o comando terminar, basta informar se concluiu e o caminho da pasta gerada. A senha fica apenas em memória durante a execução, mas a URL com a senha é passada como argumento temporário à CLI; execute somente no computador confiável.

Se falhar, o script deixa um log privado na mesma pasta; não o compartilhe sem revisar URLs e credenciais. A primeira execução pode demorar enquanto a CLI baixa a imagem PostgreSQL de dump.

### Ensaio executado em 25/10/2026

- A exportação filtrada do projeto **de testes** foi concluída em `/home/danie/pelada-homologacao/exports/test-y2A27oth`: `roles.sql`, `schema.sql` e `data.sql`. O dump contém dados sensíveis e permanece fora do Git.
- A restauração oficial em uma transação única terminou com sucesso no Supabase local. A conta `postgres` desta versão não é superusuária e falhou em `GRANT SET ON PARAMETER log_min_messages` do `roles.sql`; o ensaio foi repetido com o superusuário interno `supabase_admin`. A primeira transação foi revertida. Não usar esse papel na aplicação.
- O inventário de contagens do `data.sql` e do destino bateu em **92 de 92 tabelas** selecionadas (`public`, `auth.users`, `storage.buckets`, `storage.objects`), sem diferenças. Exemplos: `auth.users` 47, `leagues` 3, `players` 72, `rounds` 11, `matches` 140, `match_events` 254 e `player_round_stats` 155. `storage.objects` tem 0 registros no projeto de testes.
- As **89 tabelas públicas** do destino estão com RLS habilitado. Um membro autenticado enxergou 140 partidas; um ator autenticado sem vínculo enxergou 0. Todos os 11 serviços da stack continuaram saudáveis depois da restauração.
- A Supabase CLI alertou sobre chaves estrangeiras circulares no dump de dados; o restore com `SET session_replication_role = replica` passou. Ainda faltam testes de login, grants, funções críticas, Storage, políticas entre duas peladas com dados, paridade de fluxos e ensaio de backup/restauração do próprio destino.
- O dump do projeto de testes não continha `public.create_league_for_user` nem as colunas de branding adicionadas depois. A migration `313_league_catalog_and_self_service_creation.sql` e a `351_goal_request_consistency.sql` já tinham sido aplicadas somente no destino local. Em 26/10/2026, [`apply-local-post-restore-migrations.sh`](../scripts/apply-local-post-restore-migrations.sh) criou o backup privado `/home/danie/pelada-homologacao/backups/pre-314-349-20261026T104044Z.dump` e aplicou, em ordem, todas as migrations 314-349. Assim, o teste da nova API usa **dump de testes mais migrations locais**; isso não comprova que a origem já recebeu essas migrations.
- Um papel local limitado `liga_backend` (sem superusuário e sem criação de papéis) conecta ao PostgreSQL e pode assumir `authenticated`. O backend piloto roda em `liga-backend-local`, na rede `supabase_default`, com porta `127.0.0.1:3001`. O arquivo privado de ambiente fica em `/home/danie/pelada-homologacao/backend-local.env`, fora do Git.
- `GET /health` respondeu 200; as duas rotas piloto rejeitaram ausência de token com 401. `POST /api/leagues` respondeu 201 com token sintético validado pelo Auth **local** e criou uma pelada apenas no banco descartável. A RPC de criação também passou em transação revertida com o papel limitado. O backend passou em 23 testes automatizados; a primeira execução excedeu o limite padrão de 5 s enquanto a stack iniciava, e a repetição passou com `--testTimeout=15000`.
- A primeira ampliação do contexto de peladas adicionou `POST /api/leagues/:leagueId/membership-requests`. Na imagem local reconstruída, uma conta que já era membro recebeu 200 com `requested=false`, a ausência de token recebeu 401 e um tipo de conteúdo não suportado recebeu 415. A suíte passou com 29 testes em 11 arquivos.
- Entrada em pelada aberta, favorito e solicitação por convite também passaram pela API local usando um membro existente. O ensaio abriu temporariamente uma pelada, alternou o favorito duas vezes e restaurou explicitamente `visibility=private` e `is_favorite=false`; a conferência final retornou `private|false`. A entrada idempotente retornou `joined=false` e o convite devolveu a mesma pelada. Depois desse ensaio, o contrato novo de favorito foi substituído por uma gravação explícita e idempotente do estado desejado. A imagem foi reconstruída e [`verify-local-league-favorite.sh`](../scripts/verify-local-league-favorite.sh) repetiu o mesmo `PATCH` duas vezes com 200, conferiu o valor no PostgreSQL e restaurou o valor original também com 200.
- Revisão administrativa, inclusão de conta e visibilidade foram exercitadas na API local. Solicitação inexistente retornou 404, conta inexistente retornou 422, e a visibilidade mudou para `open` e voltou a `private`, com conferência final do banco. O ensaio revelou uma pelada sintética legada com UUID de versão/variante zero; o parser do backend passou a aceitar qualquer valor no formato PostgreSQL `uuid`, preservando compatibilidade com os dados existentes. A suíte passou com 38 testes em 15 arquivos.
- Leitura e alteração de configuração agora possuem contrato HTTP e ponte de frontend: nome, duração, formato de times, estádio/mapa, duração do evento e pré-temporada. O backend bloqueia mudança de formato durante convocação ativa dentro da mesma transação. A imagem Docker foi reconstruída e [`verify-local-league-config.sh`](../scripts/verify-local-league-config.sh) obteve 200 nas quatro rotas usando um ADM do Auth local e reenviando os valores atuais, sem alterar o conteúdo. O recorte ainda precisa ser exercitado pela tela antes de receber estado `verified`.
- Upgrade para modo completo e exclusão permanente também possuem contratos autenticados. O verificador local usa uma pelada já completa para testar upgrade idempotente e envia um nome deliberadamente incorreto na exclusão, confirmando a rejeição sem remover dados. A exclusão positiva deve ser exercitada somente em fixture criada para esse fim.
- Todas as 140 partidas do dump estão encerradas e seus 1.604 vínculos de jogador estão inativos. A API de gol autenticada respondeu 404 para partida inexistente. Em uma transação revertida, uma partida e um jogador foram temporariamente ativados; a RPC `register_goal` criou o gol e a repetição com a mesma chave retornou `idempotent=true`. Ainda não houve teste positivo de gol **pela API HTTP**. O WSL reiniciou serviços durante algumas verificações; confirme a saúde da stack antes de cada sessão de testes.
- Em 26/10, o contexto de identidade foi exercitado com [`verify-local-identity.sh`](../scripts/verify-local-identity.sh): login `200`, reparo de perfil, recuperação aceita `202`, URL Google `200`, senha `204`, logout `204`, novo login `200`, listagem de contas `200` e papel idempotente `200`. A conta temporária foi removida e a busca residual retornou zero. A stack restaurada não executa o host SMTP configurado `supabase-mail`; por isso cadastro com confirmação chegou ao Auth mas falhou no envio. Confirmação por e-mail, consumo real do callback e Google continuam gates manuais, não resultados aprovados.
- Para as fatias de elenco, habilite `ENABLE_ROSTER_API=true` no backend local e execute [`verify-local-roster.sh`](../scripts/verify-local-roster.sh). O script usa contas já existentes, cria duas fixtures de jogador com nomes `Codex roster ...` e `Codex import ...`, exercita criação, edição, troca de fotos e importação, remove primeiro os vínculos de convocação e depois os jogadores e confirma contagem residual zero. Em 27/10, as quatro mutações, as estatísticas oficiais, os quatro grupos do elenco e todas as projeções anteriores passaram. A migration local `352_fix_guest_roster_import_profile.sql` foi necessária porque a RPC legada ainda gravava `midfield`, valor rejeitado pelo esquema vigente. Isso não comprova que a origem recebeu a migration.

Este resultado comprova a viabilidade do restore **do projeto de testes** nesta stack. O banco de produção real ainda não foi exportado ou importado.

### Repetir os testes piloto locais

No PowerShell, confirme os contêineres e a API:

```powershell
wsl --user root --exec docker ps --format '{{.Names}} {{.Status}}'
wsl --user root --exec docker start liga-backend-local
Invoke-RestMethod http://127.0.0.1:3001/health
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-league-favorite.sh
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-league-config.sh
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-league-lifecycle.sh
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-quick-match.sh
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-seasons.sh
wsl --user root --exec bash /mnt/c/Users/danie/.codex/worktrees/architecture-reorganization/Liga-da-pelada/scripts/verify-local-identity.sh
```

Se o WSL acabou de iniciar, aguarde os serviços `supabase-db`, `supabase-auth` e `supabase-envoy` ficarem saudáveis antes de testar rotas autenticadas. Nesta máquina, chamadas isoladas de `wsl.exe` deixaram a distribuição encerrar entre verificações; manter um terminal Ubuntu aberto durante a sessão de testes preservou os contêineres ativos e todos ficaram saudáveis. Os segredos e dumps continuam fora do repositório. As flags `ENABLE_GOAL_API`, `ENABLE_LEAGUE_API` e `ENABLE_IDENTITY_API` estão ligadas **somente** no contêiner local de homologação. Para exercitar as operações conectadas pelas Server Actions, iniciar o Next local com as flags e URLs correspondentes; sem elas, ele preserva o caminho Supabase legado. Os demais fluxos ainda usam majoritariamente a arquitetura antiga e precisam ser migrados e validados localmente antes da VPS.

No PowerShell da branch, com as variáveis Supabase locais já configuradas fora do Git:

```powershell
$env:LEAGUE_API_ENABLED='true'
$env:LEAGUE_BACKEND_URL='http://127.0.0.1:3001/'
$env:IDENTITY_API_ENABLED='true'
$env:IDENTITY_BACKEND_URL='http://127.0.0.1:3001/'
npm run dev
```

Entrar com uma conta **do projeto de testes**, nunca de produção, e testar criação, entrada aberta, pedido fechado, convite, favorito, revisão, inclusão de conta e visibilidade. A flag não elimina as verificações da Server Action nem do backend; ela apenas troca o adaptador de persistência. Remover as duas variáveis ou usar `LEAGUE_API_ENABLED=false` restaura o caminho legado.

## 1. Preparar WSL2 (ação do proprietário)

Em um **PowerShell aberto como administrador**:

```powershell
wsl --install -d Ubuntu
```

Reinicie o Windows se solicitado. Abra Ubuntu, conclua a criação do usuário Linux e confirme no PowerShell:

```powershell
wsl --list --verbose
```

Ubuntu deve aparecer com versão `2`. Se `wsl --install` mostrar apenas a ajuda, siga a [alternativa oficial da Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install): `wsl --list --online` e `wsl --install -d Ubuntu`; se o comando ainda não funcionar, use o [procedimento manual para WSL2](https://learn.microsoft.com/en-us/windows/wsl/install-manual). Não copie saídas que mostrem dados de conta ou segredos.

## 2. Instalar Docker Engine no Ubuntu

Dentro do terminal **Ubuntu**, siga o [repositório apt oficial do Docker](https://docs.docker.com/engine/install/ubuntu/#install-using-the-apt-repository) para instalar `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` e `docker-compose-plugin`. O guia cobre a criação da chave GPG e da fonte apt; use os comandos da página atual, pois os pacotes e versões mudam. Confirme:

```bash
sudo systemctl status docker
sudo docker run hello-world
sudo docker compose version
```

Se o WSL ainda não tiver `systemd` ativo, siga a [configuração oficial](https://learn.microsoft.com/en-us/windows/wsl/systemd) e reinicie a distribuição com `wsl --shutdown` no PowerShell. É possível usar `sudo docker` em vez de adicionar o usuário ao grupo `docker` (esse grupo equivale a privilégio de root no host).

Reserve pelo menos 40 GB livres para imagens, volumes e dumps; 80 GB ou mais dá margem confortável conforme a [referência da stack completa](https://supabase.com/docs/guides/self-hosting/docker#system-requirements). Guarde a stack e os dumps **no sistema de arquivos Linux do WSL**, fora da pasta OneDrive e fora do Git; por exemplo `~/pelada-homologacao/`. Não copie o dump do teste para o repositório.

## 3. Subir uma stack Supabase local limpa

Depois que Docker funcionar, usar a [instalação manual oficial](https://supabase.com/docs/guides/self-hosting/docker#manual-installation) com uma versão `self-hosted/v*` fixa (a documentação consultada em 25/10/2026 exemplifica `self-hosted/v0.8.3`). Copiar `supabase/docker/` para uma pasta de projeto separada, criar `.env` a partir de `.env.example`, executar `sh utils/generate-keys.sh` e `sh utils/add-new-auth-keys.sh`, configurar URLs locais e iniciar com `sh run.sh start`. Guardar a tag e o hash do commit usados para repetir o ensaio.

Antes de restaurar, confirmar `docker compose ps` com serviços saudáveis e `SHOW server_version;` no PostgreSQL; o destino deste projeto deve ser PostgreSQL 17. Os endpoints locais usam `http://localhost:8000` por padrão. Restringir as portas publicadas ao computador local antes de colocar dados reais; não expor Studio, banco ou API de homologação à rede pública. O login Google OAuth exigirá callback/HTTPS apropriados para um ensaio completo; login local e autorização com usuários de teste podem ser testados primeiro.

## 4. Restaurar **somente os dados de teste**

1. Validar a tag da stack e a versão do banco; manter a stack sem dados de usuário.
2. Com Docker, `psql` e Supabase CLI disponíveis, obter no dashboard **Connect** a URL do banco de **teste**. Não escrever a senha no chat, no Git ou em comando salvo no histórico.
3. Gerar fora do Git `roles.sql`, `schema.sql` e `data.sql` com os três comandos oficiais reproduzidos em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md#2-fazer-ensaio-com-o-projeto-de-testes). O `.dump` bruto anterior é útil para auditoria, mas não substitui estes arquivos filtrados.
4. Restaurar na stack descartável inicializada pelo comando `psql` do guia. Em caso de falha, reiniciar com **outro destino limpo**; não tentar corrigir uma importação parcial por cima.
5. Comparar os inventários da origem e do destino usando `database/migration-inventory.sql` e `scripts/compare-db-inventories.mjs`; verificar também grants, RLS, funções e versões de extensões. Conferir Auth, Storage, imagens, login, isolamento de peladas e fluxos principais da aplicação.
6. Registrar o resultado do ensaio sem credenciais: tag da stack, versões de CLI/PostgreSQL, hashes/tamanhos dos três arquivos, diferenças de contagem, falhas e correções. Testar backup **e restauração** do destino local.

O dump do banco contém os metadados de Storage, mas não os bytes dos objetos. Para dados de produção, copiar arquivos pelo [procedimento S3 oficial](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3) e validar contagem/tamanho/amostras por bucket.

## 5. Critério para avançar ao banco real

O ensaio local precisa terminar sem erros de restore, diferenças de contagem sem explicação ou vazamento de autorização entre peladas. O backend e frontend novos ainda não têm paridade funcional com toda a aplicação; isso também precisa ser concluído e testado antes do corte de produção. Só então executar a exportação **nova** do banco oficial, uma janela sem escritas, o restore no destino de produção dimensionado e o plano de retorno descrito em [PRODUCTION-MIGRATION.md](PRODUCTION-MIGRATION.md#5-fazer-o-corte-de-produção).

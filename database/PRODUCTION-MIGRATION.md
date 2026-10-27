# Migração do Supabase oficial para a VPS — roteiro de corte

**Estado:** roteiro para execução após homologação. Não executar no banco oficial antes de o ambiente novo, a restauração de teste e os testes de aplicação passarem. O banco de produção continua sendo a autoridade até o corte.

O ambiente de homologação escolhido é Docker no computador do proprietário; veja o [roteiro local](LOCAL-HOMOLOGATION.md). WSL2, Docker Engine e a stack Supabase local já estão ativos. A exportação/restauração do projeto de testes foi concluída e as contagens de 92 tabelas bateram. Testes de paridade completos ainda faltam. O ensaio local não substitui o dimensionamento do destino definitivo na VPS.

## 1. Preparar o destino

**Capacidade observada em 25/10/2026:** a VPS atual do Coolify tem 2 vCPUs, 7,8 GiB de RAM, cerca de 4,8 GiB disponíveis naquele instante, 79 GiB livres em disco e nenhum swap. Ela já hospeda o frontend e outros recursos. A [referência oficial da stack completa](https://supabase.com/docs/guides/self-hosting/docker#system-requirements) pede no mínimo 2 cores/4 GB e recomenda 4 cores/8 GB **para o Supabase**. Portanto, não subir uma stack completa de homologação nessa VPS compartilhada sem medir carga e reservar capacidade: o espaço livre momentâneo não garante margem para picos, build e restore. Preferir ambiente de homologação isolado; para produção, dimensionar host ou VPS separada antes do corte.

1. Instalar a [stack Supabase auto-hospedada com Docker](https://supabase.com/docs/guides/self-hosting/docker) em ambiente de homologação isolado. Usar PostgreSQL 17, conforme o [guia da versão 17](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17). Manter banco e Studio fora da internet pública; expor a API por proxy HTTPS.
2. Configurar segredos novos fora do Git, volumes persistentes, backup do PostgreSQL **e** do Storage, restauração ensaiada e monitoramento. Auth, Storage, PostgREST e Realtime devem estar saudáveis antes da importação.
3. Configurar OAuth Google e SMTP no novo host. A migração de `auth.users` preserva contas, mas tokens assinados pela chave antiga deixam de valer: os usuários precisam entrar novamente. Atualizar a URL de callback no Google quando o destino estiver pronto.

## 2. Fazer ensaio com o projeto de testes

Usar a senha **do banco de testes**, não a senha da conta Supabase. Obter a conexão no botão **Connect** do projeto de testes, preferindo a conexão direta ou session pooler. Guardar a URL de conexão em variável local temporária; não colocar senha em shell history, logs, Git ou chat.

Com Docker e Supabase CLI instalados (a CLI usa Docker para o dump), seguir a [exportação oficial para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform):

```bash
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
```

Esses três arquivos são sensíveis e ficam fora do repositório. O script `scripts/backup-test-supabase.ps1` também gera um `.dump` completo para auditoria, mas usa `pg_dump` bruto e **não** substitui a exportação filtrada da CLI na importação definitiva.

Restaurar em uma instância self-hosted **descartável e já inicializada**, depois de conferir extensões necessárias:

```bash
psql --single-transaction --set ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$NEW_DB_URL"
```

O comando segue o [procedimento oficial](https://supabase.com/docs/guides/self-hosting/restore-from-platform). Se qualquer etapa falhar, descartar o destino de teste, corrigir a causa e repetir em instância limpa; nunca continuar sobre uma importação parcialmente conhecida.

## 3. Copiar os arquivos do Storage

O banco contém metadados de buckets/objetos, não o conteúdo dos arquivos. Usar o [guia oficial de cópia S3 com rclone](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3): criar credenciais S3 separadas na origem e no destino, confirmar os buckets e copiar cada bucket. Não copiar arquivos diretamente para `volumes/storage/`; a estrutura interna e os metadados precisam ser gerados pelo serviço Storage. Comparar número e tamanho dos objetos e abrir amostras de avatares, escudos e imagens privadas/públicas.

## 4. Verificar homologação

- Conferir contagens e checksums por tabela principal, pelada e temporada: `auth.users`, `players`, `leagues`, `rounds`, `matches`, `match_events`, `player_round_stats`, pagamentos, Cartola e cosméticos.
- Conferir funções, extensões, índices, grants e RLS; repetir o ensaio de isolamento entre duas peladas.
- Testar login Google, sessão expirada, upload/download, partida ao vivo, gol com retry, correção e encerramento, ranking das seis melhores rodadas, Cartola, pagamentos e notificações.
- Medir p95 de gol, ranking e propagação ao vivo antes de afirmar melhora de desempenho. Validar `npm run check` e os fluxos Playwright com contas do ambiente descartável.
- Ensaiar backup e restauração do **novo** ambiente; backups do banco e arquivos do Storage são independentes.

### Conferência reproduzível de contagens

O arquivo [`migration-inventory.sql`](migration-inventory.sql) faz somente leituras, em uma transação com snapshot consistente, de todas as tabelas `public`, `auth.users`, `storage.buckets` e `storage.objects`. Ele produz apenas nomes e contagens, sem exportar linhas. No PowerShell, na raiz do projeto e com `psql` instalado:

```powershell
$auditDir = Join-Path $env:LOCALAPPDATA 'PeladaBQ\migration-audit'
New-Item -ItemType Directory -Force -Path $auditDir | Out-Null
$origem = Join-Path $auditDir 'origem.tsv'
$destino = Join-Path $auditDir 'destino.tsv'

& psql -X -q -t -A -v ON_ERROR_STOP=1 -h '<host-da-origem>' -p 5432 -U '<usuario-da-origem>' -d postgres -W -f database/migration-inventory.sql | Set-Content -Encoding utf8 $origem
if ($LASTEXITCODE -ne 0) { throw 'Inventario da origem falhou' }

& psql -X -q -t -A -v ON_ERROR_STOP=1 -h '<host-do-destino>' -p 5432 -U '<usuario-do-destino>' -d postgres -W -f database/migration-inventory.sql | Set-Content -Encoding utf8 $destino
if ($LASTEXITCODE -ne 0) { throw 'Inventario do destino falhou' }

node scripts/compare-db-inventories.mjs $origem $destino
```

O `-W` solicita cada senha localmente; não a coloque no comando. Guarde os TSV fora do Git. Uma diferença dá código de saída 1; arquivo malformado ou incompleto dá código 2. Igualdade de contagens é necessária, mas não prova igualdade das linhas, grants, RLS ou conteúdo dos arquivos no Storage. Faça essa comparação com a origem sem novas escritas após a exportação, ou registre e explique o delta esperado. Também valide `rclone size` e amostras de arquivos por bucket.

## 5. Fazer o corte de produção

1. Agendar uma janela curta e avisar os usuários. Suspender escritas no app oficial; sem replicação/dual-write, qualquer escrita após o dump final cria divergência.
2. Gerar uma exportação **nova** do banco oficial (`roles.sql`, `schema.sql`, `data.sql`) e copiar o delta final de arquivos do Storage. Registrar horário, tamanhos, hashes e contagens, sem registrar segredos.
3. Restaurar em destino de produção limpo e executar a mesma validação automática/manual do ensaio. Não aplicar novamente migrations já incorporadas no dump; registrar um baseline coerente no novo runner antes de migrations futuras.
4. Trocar URL/chave públicas do Supabase na build do frontend, URLs internas no backend, callback Google e proxy/DNS. O Next.js embute variáveis `NEXT_PUBLIC_*` durante o build, portanto precisa ser reconstruído para o novo host.
5. Abrir tráfego só após testes de leitura e escrita no destino. Monitorar erros, p95 e integridade. Manter o projeto Cloud intacto e sem novas escritas durante a janela de observação.

A homologação local mostrou que o dump de testes estava atrás do repositório: faltavam `313` e o lote `314-349`, além de `351`. A migration `352_fix_guest_roster_import_profile.sql`, criada depois do restore, também precisa ser reconciliada: sem ela, a RPC tenta gravar `midfield` e a importação falha no esquema vigente. Isso **não autoriza** reaplicar cegamente o mesmo intervalo em produção. Antes do corte, comparar o schema do dump oficial novo com cada migration versionada, montar a lista exata que ainda não está incorporada e aplicá-la uma única vez, em ordem, depois de um backup verificável. Se `351` ou `352` ainda não estiverem no Cloud, incluí-las nessa lista. Repetir os testes de gol/retry, branding, configuração de pelada e importação de convidados no schema completo antes de ativar as APIs.

## Retorno

Antes de aceitar escritas no destino, retornar consiste em apontar o app para o Cloud e reabrir escritas lá. **Depois** de aceitar escritas no destino, um simples retorno de DNS perde esses novos dados; exigirá exportação reversa ou conciliação explícita. Por isso, o teste de restauração e o corte de tráfego devem estar completos antes de liberar mutações.

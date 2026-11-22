# Banco local — início da migração

O alvo inicial é PostgreSQL **17**. `supabase/config.toml` já declara 17 e o backup local disponível de 15/10/2026 foi produzido pelo servidor 17.6. A proposta original de PostgreSQL 16 requer um projeto de downgrade lógico à parte; não restaurar esse arquivo diretamente no 16.

## Verificação de arquivo

```powershell
$env:PG_RESTORE_BIN = 'C:\caminho\para\pg_restore.exe'
npm run audit:db-archive -- 'C:\caminho\para\backup-completo.dump' --target-major 17
```

O comando lê somente o catálogo do arquivo e verifica versão de origem, schemas `auth`/`storage` e extensões. Ele não restaura dados nem garante que roles, grants, extensões ou aplicativo funcionarão. Use `--json` para integração com scripts. Um dump restrito a `public` falha nessa verificação, salvo uso explícito de `--allow-partial` para inspeção.

## Exportação para a migração real

O arquivo `.dump` criado por `scripts/backup-test-supabase.ps1` é útil para auditoria e ensaios locais, mas é um `pg_dump` bruto. Para importar uma instância Supabase Cloud em Supabase auto-hospedado, seguir o [guia oficial de restauração](https://supabase.com/docs/guides/self-hosting/restore-from-platform): a CLI exporta `roles.sql`, `schema.sql` e `data.sql` separadamente e filtra objetos internos da plataforma. Não usar o `.dump` bruto como restore direto de produção.

O destino inicial recomendado é a stack Supabase auto-hospedada com PostgreSQL 17, pois o aplicativo ainda usa Auth, Storage, PostgREST e Realtime. O [guia oficial de PostgreSQL 17](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17) confirma essa versão para novas instalações. Depois de validar a importação, o backend próprio poderá substituir cada dependência por fatia.

Os objetos do Storage exigem cópia separada: o dump do banco leva metadados, não os bytes dos arquivos. Usar o [procedimento oficial via S3/rclone](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3) ou validar um adaptador equivalente; cópia direta para `volumes/storage/` não é suficiente. Login Google, URLs de callback, chaves JWT/API e SMTP também precisam de configuração no novo ambiente.

## Ensaio descartável de 24/10/2026

- Ferramentas: PostgreSQL 17.11 local; backup **oficial antigo** de 15/10/2026 (origem 17.6). Nenhuma conexão ou alteração em banco remoto.
- Foi restaurado **somente o schema** em banco local descartável, sem dados de usuários. O arquivo completo contém `auth`, `storage`, `realtime`, `vault` e outras dependências da plataforma.
- Restore direto em PostgreSQL nativo falhou por ausência dos papéis `authenticated`/`anon` e da extensão `supabase_vault`. A extensão não existe na instalação PostgreSQL usada no ensaio.
- Com papéis locais `anon`, `authenticated`, `service_role` e exclusão **apenas no ensaio** das entradas `supabase_vault` do catálogo, o restore do schema terminou com zero erros.
- As migrations 253–259 passaram. A 260 exige que exista a pelada original; foi inserida uma única pelada **sintética** no banco descartável. Então as migrations 260–349 passaram. Ao todo, 98 arquivos SQL de 253 a 349 foram aplicados; há dois arquivos numerados 312.
- Estado estrutural final observado: 91 tabelas `public`, 1 view `public`, 212 políticas RLS, função `register_goal` e view `player_season_stats` presentes.

Esse resultado demonstra replay de **schema** a partir do backup antigo com adaptações explícitas. Não demonstra migração de dados, preservação de grants, funcionamento de Auth/Storage/Realtime, equivalência de pontuação ou segurança em runtime. O uso de `--no-acl` no ensaio significa que permissões antigas não foram restauradas. A extensão `supabase_vault` e seus dados também não foram migrados.

## Ensaio da migration 351 em 25/10/2026

Em outra base PostgreSQL 17 descartável, `goal-idempotency-fixture.sql` criou somente as tabelas e funções necessárias à RPC. A migration 351 e `goal-idempotency-assertions.sql` passaram com `ON_ERROR_STOP=1`: primeiro gol, repetição após encerramento, rejeição de payload diferente e placar/evento únicos. O cluster foi encerrado e removido. Esse teste ainda não valida a migration contra o esquema completo nem contra dados reais; repetir após restaurar a exportação atualizada de testes.

## Ensaio com o backup atualizado de testes em 25/10/2026

- O script `scripts/backup-test-supabase.ps1` gerou os arquivos **fora do Git** `peladabq-test-before-restore-full-20261025-124055.dump` (2.476.998 bytes; SHA256 `F8044D82DEE0EFE5CD3018080F7315AEE30CF0F40770017A98A1989F204A7A3E`) e `peladabq-test-before-restore-public-20261025-124055.dump` (2.140.171 bytes; SHA256 `92B76454C13B2CB9DEF6F54EAD77CA6A11A683BBE8678E8624A9AC016C6F1C24`). Ambos passaram em `pg_restore --list`.
- A origem declara PostgreSQL 17.11, schemas `auth`, `public`, `storage`, `realtime` e dados de tabelas. O verificador `npm run audit:db-archive` não encontrou problema de versão/esquema.
- O backup completo foi restaurado em PostgreSQL 17.11 **nativo, local e descartável**, com papéis `anon`, `authenticated` e `service_role` de ensaio. Para contornar a ausência da extensão `supabase_vault`, foram excluídos somente sua entrada no catálogo e o schema `vault`; `--no-owner --no-acl` também foi necessário. Essas exclusões são específicas do ensaio e não são um procedimento de produção.
- A restauração terminou sem erro. Contagens conferidas com consultas somente de leitura no Supabase de testes: `auth.users` 47, peladas 3, jogadores 72, rodadas 11, partidas 140, eventos 254, estatísticas por rodada 155 e objetos de Storage 0. A cópia local tem 89 tabelas `public` e 207 políticas RLS. A migration 351 aplicou sem erro **sobre o esquema restaurado**.

Esse ensaio confirma restauração de dados e compatibilidade estrutural da migration 351 com o backup de testes. Ainda não comprova proprietários, grants, segredos do Vault, login/OAuth, Storage e Realtime em execução, autorização em runtime ou paridade funcional completa. O destino de homologação deve ser uma stack Supabase auto-hospedada atual, restaurada com a exportação filtrada da CLI oficial.

## Próximo gate

Montar a stack Supabase auto-hospedada de homologação com PostgreSQL 17 e exportação filtrada da CLI oficial; restaurar papéis, esquema e dados sem as exclusões deste ensaio; conferir grants, extensões, Auth, RLS, Storage/Realtime e resultados de RPCs. Só depois conectar o backend novo a esse banco. Não versionar dumps, senhas ou arquivos de Storage.

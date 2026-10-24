# Banco local — início da migração

O alvo inicial é PostgreSQL **17**. `supabase/config.toml` já declara 17 e o backup local disponível de 15/10/2026 foi produzido pelo servidor 17.6. A proposta original de PostgreSQL 16 requer um projeto de downgrade lógico à parte; não restaurar esse arquivo diretamente no 16.

## Verificação de arquivo

```powershell
$env:PG_RESTORE_BIN = 'C:\caminho\para\pg_restore.exe'
npm run audit:db-archive -- 'C:\caminho\para\backup-completo.dump' --target-major 17
```

O comando lê somente o catálogo do arquivo e verifica versão de origem, schemas `auth`/`storage` e extensões. Ele não restaura dados nem garante que roles, grants, extensões ou aplicativo funcionarão. Use `--json` para integração com scripts. Um dump restrito a `public` falha nessa verificação, salvo uso explícito de `--allow-partial` para inspeção.

## Ensaio descartável de 24/10/2026

- Ferramentas: PostgreSQL 17.11 local; backup **oficial antigo** de 15/10/2026 (origem 17.6). Nenhuma conexão ou alteração em banco remoto.
- Foi restaurado **somente o schema** em banco local descartável, sem dados de usuários. O arquivo completo contém `auth`, `storage`, `realtime`, `vault` e outras dependências da plataforma.
- Restore direto em PostgreSQL nativo falhou por ausência dos papéis `authenticated`/`anon` e da extensão `supabase_vault`. A extensão não existe na instalação PostgreSQL usada no ensaio.
- Com papéis locais `anon`, `authenticated`, `service_role` e exclusão **apenas no ensaio** das entradas `supabase_vault` do catálogo, o restore do schema terminou com zero erros.
- As migrations 253–259 passaram. A 260 exige que exista a pelada original; foi inserida uma única pelada **sintética** no banco descartável. Então as migrations 260–349 passaram. Ao todo, 98 arquivos SQL de 253 a 349 foram aplicados; há dois arquivos numerados 312.
- Estado estrutural final observado: 91 tabelas `public`, 1 view `public`, 212 políticas RLS, função `register_goal` e view `player_season_stats` presentes.

Esse resultado demonstra replay de **schema** a partir do backup antigo com adaptações explícitas. Não demonstra migração de dados, preservação de grants, funcionamento de Auth/Storage/Realtime, equivalência de pontuação ou segurança em runtime. O uso de `--no-acl` no ensaio significa que permissões antigas não foram restauradas. A extensão `supabase_vault` e seus dados também não foram migrados.

## Próximo gate

Obter backup atualizado e anonimizado do ambiente de teste com esquema e dados representativos; separar inventário de objetos da plataforma; restaurar em PostgreSQL 17 com extensões/roles apropriadas; comparar contagens, checksums, políticas e resultados de RPCs. Só depois conectar o backend novo a esse banco. Não versionar dumps, senhas ou arquivos de Storage.

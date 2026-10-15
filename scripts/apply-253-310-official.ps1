param(
  [string]$BackupDirectory = 'C:\Users\danie\AppData\Local\PeladaBQ\backups',
  [string]$PgBin = (Join-Path $env:TEMP 'peladabq-postgres-17.11\pgsql\bin')
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgBin 'psql.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
foreach ($tool in @($psql, $pgRestore)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "Ferramenta não encontrada: $tool" }
}

$migrationRoot = Join-Path $PSScriptRoot '..\supabase\migrations'
$migrations = Get-ChildItem -LiteralPath $migrationRoot -File |
  Where-Object { $_.BaseName -match '^(25[3-9]|2[6-9][0-9]|30[0-9]|310)_' } |
  Sort-Object Name

if ($migrations.Count -ne 58) {
  throw "Esperadas 58 migrations de 253 a 310; encontradas $($migrations.Count)."
}
if ($migrations[0].Name -ne '253_multi_league_lobby_foundation.sql' -or
    $migrations[-1].Name -ne '310_cartola_round_lineup_size.sql') {
  throw 'A sequência de migrations 253–310 não está completa.'
}

$officialFull = Get-ChildItem -LiteralPath $BackupDirectory -Filter 'peladabq-official-full-*.dump' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$officialPublic = Get-ChildItem -LiteralPath $BackupDirectory -Filter 'peladabq-official-public-*.dump' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

foreach ($backup in @($officialFull, $officialPublic)) {
  if ($null -eq $backup -or $backup.Length -le 1024) { throw 'Backup oficial válido não encontrado.' }
  & $pgRestore --list $backup.FullName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Backup oficial inválido: $($backup.FullName)" }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $BackupDirectory "official-migrations-253-310-$stamp.log"
$preflightPath = Join-Path $BackupDirectory "official-preflight-$stamp.txt"
$postflightPath = Join-Path $BackupDirectory "official-postflight-$stamp.txt"

Write-Host 'Digite a senha do BANCO OFICIAL Supabase. Os caracteres não serão exibidos.'
$securePassword = Read-Host -Prompt 'Senha do banco oficial' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:PGPASSWORD = $plainPassword
$env:PGSSLMODE = 'require'
$env:PGCONNECT_TIMEOUT = '20'
$env:PGOPTIONS = '-c lock_timeout=15000 -c statement_timeout=600000'
Remove-Variable plainPassword -ErrorAction SilentlyContinue
Remove-Variable securePassword -ErrorAction SilentlyContinue

$connection = @(
  '--host=aws-0-sa-east-1.pooler.supabase.com',
  '--port=5432',
  '--username=postgres.qffxktwxsqyiijboeftr',
  '--dbname=postgres',
  '--no-password',
  '--set=ON_ERROR_STOP=1',
  '--no-psqlrc'
)

$preflightSql = @'
select 'server_version=' || current_setting('server_version');
select 'leagues=' || count(*) from public.leagues;
select 'league_members=' || count(*) from public.league_members;
select 'players=' || count(*) from public.players;
select 'rounds=' || count(*) from public.rounds;
select 'fantasy_seasons=' || count(*) from public.fantasy_seasons;
select 'migration_253_present=' || (to_regclass('public.league_invites') is not null);
select 'leagues_slug_present=' || exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='leagues' and column_name='slug'
);
'@

$postflightSql = @'
select 'leagues=' || count(*) from public.leagues;
select 'league_members=' || count(*) from public.league_members;
select 'players=' || count(*) from public.players;
select 'rounds=' || count(*) from public.rounds;
select 'fantasy_seasons=' || count(*) from public.fantasy_seasons;
select 'league_invites_present=' || (to_regclass('public.league_invites') is not null);
select 'slug_present=' || exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='leagues' and column_name='slug'
);
select 'feature_tier_present=' || exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='leagues' and column_name='feature_tier'
);
select 'callup_format_present=' || (
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='callups' and column_name='players_per_team')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='callups' and column_name='teams_per_round')
);
select 'original_league_name=' || coalesce((select name from public.leagues where id='b0000000-0000-0000-0000-000000000001'::uuid), '<missing>');
'@

try {
  Write-Host 'Executando diagnóstico anterior às migrations...'
  $preflight = & $psql @connection --tuples-only --no-align --command=$preflightSql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha no diagnóstico inicial:`n$($preflight -join [Environment]::NewLine)" }
  $preflight | Set-Content -LiteralPath $preflightPath -Encoding utf8
  $preflight | ForEach-Object { Write-Host $_ }

  if (($preflight -join "`n") -notmatch 'migration_253_present=f') {
    throw 'A migration 253 parece já aplicada. Execução interrompida para evitar duplicidade.'
  }

  "[$(Get-Date -Format o)] Início da aplicação 253–310" | Set-Content -LiteralPath $logPath -Encoding utf8
  foreach ($migration in $migrations) {
    $number = [int]($migration.BaseName.Substring(0, 3))
    Write-Host ("Aplicando {0} ({1}/58)..." -f $migration.Name, ($number - 252))
    "[$(Get-Date -Format o)] START $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8

    $content = Get-Content -LiteralPath $migration.FullName -Raw
    $hasOwnTransaction = $content -match '(?im)^\s*BEGIN\s*;' -and $content -match '(?im)^\s*COMMIT\s*;'
    $arguments = @($connection)
    if (-not $hasOwnTransaction) { $arguments += '--single-transaction' }
    $arguments += "--file=$($migration.FullName)"

    $output = & $psql @arguments 2>&1
    $output | Add-Content -LiteralPath $logPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
      "[$(Get-Date -Format o)] FAILED $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8
      throw "Falha na migration $($migration.Name). Consulte $logPath"
    }
    "[$(Get-Date -Format o)] OK $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8
  }

  Write-Host 'Executando verificações finais...'
  $postflight = & $psql @connection --tuples-only --no-align --command=$postflightSql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha na verificação final:`n$($postflight -join [Environment]::NewLine)" }
  $postflight | Set-Content -LiteralPath $postflightPath -Encoding utf8
  $postflight | ForEach-Object { Write-Host $_ }

  $joined = $postflight -join "`n"
  foreach ($expected in @(
    'league_invites_present=t',
    'slug_present=t',
    'feature_tier_present=t',
    'callup_format_present=t',
    'original_league_name=Pelada BQ'
  )) {
    if ($joined -notmatch [regex]::Escape($expected)) { throw "Verificação final ausente: $expected" }
  }

  "[$(Get-Date -Format o)] Concluído com sucesso" | Add-Content -LiteralPath $logPath -Encoding utf8
  Write-Host "Migrations 253–310 aplicadas com sucesso. Log: $logPath"
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
}

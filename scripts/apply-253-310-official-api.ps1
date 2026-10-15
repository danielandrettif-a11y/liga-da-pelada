param(
  [string]$ProjectRef = 'qffxktwxsqyiijboeftr',
  [string]$BackupDirectory = 'C:\Users\danie\AppData\Local\PeladaBQ\backups'
)

$ErrorActionPreference = 'Stop'
$migrationRoot = Join-Path $PSScriptRoot '..\supabase\migrations'
$migrations = Get-ChildItem -LiteralPath $migrationRoot -File |
  Where-Object { $_.BaseName -match '^(25[3-9]|2[6-9][0-9]|30[0-9]|310)_' } |
  Sort-Object Name

if ($migrations.Count -ne 58 -or
    $migrations[0].Name -ne '253_multi_league_lobby_foundation.sql' -or
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
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $BackupDirectory "official-api-migrations-253-310-$stamp.log"
$preflightPath = Join-Path $BackupDirectory "official-api-preflight-$stamp.json"
$postflightPath = Join-Path $BackupDirectory "official-api-postflight-$stamp.json"

function Invoke-SupabaseQuery {
  param(
    [string]$Sql,
    [string]$File
  )

  $arguments = @('--yes', 'supabase', 'db', 'query', '--linked', '--project-ref', $ProjectRef, '--output', 'json')
  if ($File) { $arguments += @('--file', $File) } else { $arguments += $Sql }
  $output = & npx @arguments 2>&1
  $exitCode = $LASTEXITCODE
  [pscustomobject]@{ ExitCode = $exitCode; Output = @($output) }
}

$preflightSql = "select current_setting('server_version') as server_version, (select count(*) from public.leagues) as leagues, (select count(*) from public.league_members) as league_members, (select count(*) from public.players) as players, (select count(*) from public.rounds) as rounds, (select count(*) from public.fantasy_seasons) as fantasy_seasons, to_regclass('public.league_invites') is not null as migration_253_present;"

$postflightSql = "select (select count(*) from public.leagues) as leagues, (select count(*) from public.league_members) as league_members, (select count(*) from public.players) as players, (select count(*) from public.rounds) as rounds, (select count(*) from public.fantasy_seasons) as fantasy_seasons, to_regclass('public.league_invites') is not null as league_invites_present, exists (select 1 from information_schema.columns where table_schema='public' and table_name='leagues' and column_name='slug') as slug_present, exists (select 1 from information_schema.columns where table_schema='public' and table_name='leagues' and column_name='feature_tier') as feature_tier_present, (exists (select 1 from information_schema.columns where table_schema='public' and table_name='callups' and column_name='players_per_team') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='callups' and column_name='teams_per_round')) as callup_format_present, (select name from public.leagues where id='b0000000-0000-0000-0000-000000000001'::uuid) as original_league_name;"

Write-Host 'Confirmando o estado inicial do projeto oficial...'
$preflight = Invoke-SupabaseQuery -Sql $preflightSql
$preflight.Output | Set-Content -LiteralPath $preflightPath -Encoding utf8
if ($preflight.ExitCode -ne 0) { throw "Falha no diagnóstico inicial. Consulte $preflightPath" }
$preflightText = $preflight.Output -join "`n"
if ($preflightText -notmatch '"migration_253_present"\s*:\s*false') {
  throw 'A migration 253 parece já aplicada. Execução interrompida para evitar duplicidade.'
}

"[$(Get-Date -Format o)] Início da aplicação via Management API" | Set-Content -LiteralPath $logPath -Encoding utf8
foreach ($migration in $migrations) {
  $number = [int]$migration.BaseName.Substring(0, 3)
  Write-Host ("Aplicando {0} ({1}/58)..." -f $migration.Name, ($number - 252))
  "[$(Get-Date -Format o)] START $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8
  $result = Invoke-SupabaseQuery -File $migration.FullName
  $result.Output | Add-Content -LiteralPath $logPath -Encoding utf8
  if ($result.ExitCode -ne 0) {
    "[$(Get-Date -Format o)] FAILED $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8
    throw "Falha na migration $($migration.Name). Consulte $logPath"
  }
  "[$(Get-Date -Format o)] OK $($migration.Name)" | Add-Content -LiteralPath $logPath -Encoding utf8
}

Write-Host 'Executando verificações finais...'
$postflight = Invoke-SupabaseQuery -Sql $postflightSql
$postflight.Output | Set-Content -LiteralPath $postflightPath -Encoding utf8
if ($postflight.ExitCode -ne 0) { throw "Falha na verificação final. Consulte $postflightPath" }
$postflightText = $postflight.Output -join "`n"
foreach ($expected in @(
  '"league_invites_present"\s*:\s*true',
  '"slug_present"\s*:\s*true',
  '"feature_tier_present"\s*:\s*true',
  '"callup_format_present"\s*:\s*true',
  '"original_league_name"\s*:\s*"Pelada BQ"'
)) {
  if ($postflightText -notmatch $expected) { throw "Verificação final ausente: $expected" }
}

"[$(Get-Date -Format o)] Concluído com sucesso" | Add-Content -LiteralPath $logPath -Encoding utf8
Write-Host "Migrations 253–310 aplicadas com sucesso. Log: $logPath"

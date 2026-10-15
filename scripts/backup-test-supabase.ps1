param(
  [string]$OutputDirectory = 'C:\Users\danie\AppData\Local\PeladaBQ\backups',
  [string]$PgBin = (Join-Path $env:TEMP 'peladabq-postgres-17.11\pgsql\bin')
)

$ErrorActionPreference = 'Stop'
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
$psql = Join-Path $PgBin 'psql.exe'
foreach ($tool in @($pgDump, $pgRestore, $psql)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "Ferramenta não encontrada: $tool" }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fullPath = Join-Path $OutputDirectory "peladabq-test-before-restore-full-$stamp.dump"
$publicPath = Join-Path $OutputDirectory "peladabq-test-before-restore-public-$stamp.dump"

Write-Host 'Digite a senha do BANCO DE TESTE Supabase. Os caracteres não serão exibidos.'
$securePassword = Read-Host -Prompt 'Senha do banco de teste' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:PGPASSWORD = $plainPassword
$env:PGSSLMODE = 'require'
Remove-Variable plainPassword -ErrorAction SilentlyContinue
Remove-Variable securePassword -ErrorAction SilentlyContinue

$connection = @(
  '--host=aws-0-us-east-1.pooler.supabase.com',
  '--port=5432',
  '--username=postgres.dukjlpdkyngiqxffrxgc',
  '--dbname=postgres',
  '--no-password'
)

try {
  & $psql @connection --set=ON_ERROR_STOP=1 --tuples-only --command="select 'test_connection_ok' as status, count(*) as auth_users from auth.users;"
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível conectar ao banco de teste (código $LASTEXITCODE)." }

  Write-Host 'Criando backup completo do banco de teste...'
  & $pgDump @connection --format=custom --no-owner --no-acl --lock-wait-timeout=5000 --file=$fullPath
  if ($LASTEXITCODE -ne 0) { throw "Falha no backup completo do teste (código $LASTEXITCODE)." }

  Write-Host 'Criando backup separado do schema public do teste...'
  & $pgDump @connection --format=custom --no-owner --no-acl --lock-wait-timeout=5000 --schema=public --file=$publicPath
  if ($LASTEXITCODE -ne 0) { throw "Falha no backup public do teste (código $LASTEXITCODE)." }

  foreach ($path in @($fullPath, $publicPath)) {
    & $pgRestore --list $path | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao validar o arquivo: $path" }
    $file = Get-Item -LiteralPath $path
    if ($file.Length -le 1024) { throw "Arquivo de backup pequeno demais: $path" }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    Write-Host "Backup validado: $($file.FullName) ($($file.Length) bytes; SHA256 $hash)"
  }
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}

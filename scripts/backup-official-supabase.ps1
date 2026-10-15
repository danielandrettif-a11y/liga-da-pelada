param(
  [string]$OutputDirectory = 'C:\Users\danie\AppData\Local\PeladaBQ\backups',
  [string]$PgBin = (Join-Path $env:TEMP 'peladabq-postgres-17.11\pgsql\bin')
)

$ErrorActionPreference = 'Stop'
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'
if (-not (Test-Path -LiteralPath $pgDump) -or -not (Test-Path -LiteralPath $pgRestore)) {
  throw 'pg_dump.exe/pg_restore.exe não encontrados no pacote PostgreSQL 17.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fullPath = Join-Path $OutputDirectory "peladabq-official-full-$stamp.dump"
$publicPath = Join-Path $OutputDirectory "peladabq-official-public-$stamp.dump"

Write-Host 'Digite a senha do BANCO OFICIAL Supabase. Os caracteres não serão exibidos.'
$securePassword = Read-Host -Prompt 'Senha do banco oficial' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
$env:PGPASSWORD = $plainPassword
$env:PGSSLMODE = 'require'
Remove-Variable plainPassword -ErrorAction SilentlyContinue
Remove-Variable securePassword -ErrorAction SilentlyContinue

$connection = @(
  '--host=aws-0-sa-east-1.pooler.supabase.com',
  '--port=5432',
  '--username=postgres.qffxktwxsqyiijboeftr',
  '--dbname=postgres',
  '--no-password',
  '--lock-wait-timeout=5000'
)

try {
  Write-Host 'Criando arquivo completo (somente leitura no banco oficial)...'
  & $pgDump @connection --format=custom --no-owner --no-acl --file=$fullPath
  if ($LASTEXITCODE -ne 0) { throw "Falha no backup completo (código $LASTEXITCODE)." }

  Write-Host 'Criando arquivo separado do schema public...'
  & $pgDump @connection --format=custom --no-owner --no-acl --schema=public --file=$publicPath
  if ($LASTEXITCODE -ne 0) { throw "Falha no backup public (código $LASTEXITCODE)." }

  foreach ($path in @($fullPath, $publicPath)) {
    & $pgRestore --list $path | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao ler o arquivo de backup: $path" }
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

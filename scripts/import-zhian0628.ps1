#Requires -Version 5.1
<#
.SYNOPSIS
  将 d:\工作\POC\zhian0628.sql 导入本机 MySQL 库 zhian0628
.EXAMPLE
  .\import-zhian0628.ps1 -MySqlPassword '你的密码'
#>
param(
  [string]$SqlFile = (Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) '..') 'zhian0628.sql'),
  [string]$DbName = 'zhian0628',
  [string]$MySqlUser = 'root',
  [string]$MySqlHost = '127.0.0.1',
  [int]$MySqlPort = 3307,
  [string]$MySqlPassword = 'zhian0628_dev'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $SqlFile)) {
  throw "SQL file not found: $SqlFile"
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
  throw 'mysql client not found on PATH'
}

$env:MYSQL_PWD = $MySqlPassword
try {
  Write-Host "==> Creating database $DbName (if missing)..."
  & mysql -h $MySqlHost -P $MySqlPort -u $MySqlUser -e "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

  Write-Host "==> Importing $SqlFile (may take several minutes)..."
  Get-Content -LiteralPath $SqlFile -Encoding UTF8 | & mysql -h $MySqlHost -P $MySqlPort -u $MySqlUser $DbName

  Write-Host "==> Done. admin@126.com is already in the dump (users table)."
  Write-Host "    Next: edit zhian-safe/.env DB_PASSWORD, then npm run dev"
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

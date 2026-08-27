#Requires -Version 5.1
<#
.SYNOPSIS
  将 scan-venv 打成 bundled/*.zip，供提交 Git（他人 clone 后首次扫描自动解压）
#>
param(
  [string]$ToolsRoot = (Join-Path (Join-Path $PSScriptRoot '..') 'tools')
)

$ErrorActionPreference = 'Stop'
$venv = Join-Path $ToolsRoot 'scan-venv'
$bundledDir = Join-Path $ToolsRoot 'bundled'
$zip = Join-Path $bundledDir 'scan-venv-win-amd64.zip'

if (-not (Test-Path $venv)) {
  throw "scan-venv not found. Run install-scan-tools.ps1 first."
}

New-Item -ItemType Directory -Force -Path $bundledDir | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }

Write-Host "==> Packing $venv -> $zip (may take a few minutes)..."
Compress-Archive -Path $venv -DestinationPath $zip -CompressionLevel Optimal

$sizeMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "==> Done. Bundle size: ${sizeMb} MB"
Write-Host "    Commit: git add capability-audit/tools/bin capability-audit/tools/bundled capability-audit/tools/manifest.json"

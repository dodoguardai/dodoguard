#Requires -Version 5.1
<#
.SYNOPSIS
  安装 Skill/MCP 专项扫描依赖：SkillSpector、Cisco Skill Scanner（Python venv）
#>
param(
  [string]$ToolsRoot = (Join-Path (Join-Path $PSScriptRoot '..') 'tools'),
  [switch]$SkipBundle
)

$venv = Join-Path $ToolsRoot 'scan-venv'
$venvScripts = Join-Path $venv 'Scripts'
$envFile = Join-Path $ToolsRoot 'tools.env'

function Write-Step([string]$Message) {
  Write-Host "==> $Message"
}

function Invoke-InstallStep([string]$Label, [scriptblock]$Action) {
  try {
    & $Action
    Write-Host "    OK: $Label"
    return $true
  } catch {
    Write-Warning "    SKIP: $Label — $($_.Exception.Message)"
    return $false
  }
}

function Test-VenvHealthy([string]$VenvPath) {
  $pip = Join-Path $VenvPath 'Scripts\pip.exe'
  $python = Join-Path $VenvPath 'Scripts\python.exe'
  return (Test-Path $pip) -and (Test-Path $python)
}

function Ensure-Venv([string]$VenvPath) {
  if (Test-Path $VenvPath) {
    if (-not (Test-VenvHealthy $VenvPath)) {
      Write-Step "Removing broken venv: $VenvPath"
      Remove-Item -Recurse -Force $VenvPath
    }
  }
  if (-not (Test-Path $VenvPath)) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
      throw 'Python 3.12+ required on PATH to create scan-venv'
    }
    $pyVer = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    Write-Step "Creating scan-venv (Python $pyVer)"
    python -m venv $VenvPath
  }
  if (-not (Test-VenvHealthy $VenvPath)) {
    throw "Failed to create a healthy venv at $VenvPath"
  }
}

Write-Step "Tools root: $ToolsRoot (Skill/MCP engines only)"

$skillspectorExe = Join-Path $venvScripts 'skillspector.exe'
$skillScannerExe = Join-Path $venvScripts 'skill-scanner.exe'
$snykAgentScanCmd = Get-Command snyk-agent-scan -ErrorAction SilentlyContinue
$skillspectorOk = $false
$ciscoOk = $false

Invoke-InstallStep 'SkillSpector (venv)' {
  Ensure-Venv $venv
  $pip = Join-Path $venvScripts 'pip.exe'
  & $pip install --upgrade pip
  Write-Step 'Installing SkillSpector (may take a few minutes)...'
  & $pip install 'git+https://github.com/NVIDIA/SkillSpector.git'
  if (-not (Test-Path $skillspectorExe)) { throw 'skillspector.exe missing after pip install' }
  $script:skillspectorOk = $true
} | Out-Null

if (-not $skillspectorOk -and (Test-Path $skillspectorExe)) { $skillspectorOk = $true }

Invoke-InstallStep 'Cisco Skill Scanner (venv)' {
  Ensure-Venv $venv
  $pip = Join-Path $venvScripts 'pip.exe'
  Write-Step 'Installing cisco-ai-skill-scanner...'
  & $pip install 'cisco-ai-skill-scanner'
  if (-not (Test-Path $skillScannerExe)) { throw 'skill-scanner.exe missing after pip install' }
  $script:ciscoOk = $true
} | Out-Null

if (-not $ciscoOk -and (Test-Path $skillScannerExe)) { $ciscoOk = $true }

Write-Step 'Verify:'
if ($skillspectorOk -or (Test-Path $skillspectorExe)) {
  try { & $skillspectorExe --version } catch { Write-Warning "    skillspector verify failed: $_" }
}
if ($ciscoOk -or (Test-Path $skillScannerExe)) {
  try { & $skillScannerExe --help | Select-Object -First 1 } catch { Write-Warning "    skill-scanner verify failed: $_" }
}

$envLines = @()
if (Test-Path $skillspectorExe) {
  $envLines += "CAPABILITY_SCAN_SKILLSPECTOR_BIN=$skillspectorExe"
}
if (Test-Path $skillScannerExe) {
  $envLines += "CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN=$skillScannerExe"
}
if ($snykAgentScanCmd) {
  $envLines += "CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN=$($snykAgentScanCmd.Source)"
  $envLines += "CAPABILITY_SCAN_SNYK_MCP_SERVER_TIMEOUT_SECONDS=5"
}

if ($envLines.Count -gt 0) {
  $envLines | Set-Content -Path $envFile -Encoding UTF8
  Write-Step "Wrote tools.env ($($envLines.Count) entries)"
  Write-Host "    Start backend after: . $(Join-Path $PSScriptRoot 'load-env.ps1')"
} else {
  Write-Warning 'No scan tools installed.'
}

if (-not $SkipBundle -and (Test-VenvHealthy $venv) -and (Test-Path $skillspectorExe)) {
  Write-Step 'Packaging scan-venv for Git...'
  try {
    & (Join-Path $PSScriptRoot 'bundle-scan-tools.ps1') -ToolsRoot $ToolsRoot
  } catch {
    Write-Warning "Bundle skipped: $($_.Exception.Message)"
  }
}

Write-Step 'Install finished.'

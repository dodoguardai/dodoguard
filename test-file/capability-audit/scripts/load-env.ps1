# 加载 capability-audit/tools/tools.env 到当前 PowerShell 会话
$envFile = Join-Path (Join-Path (Join-Path $PSScriptRoot '..') 'tools') 'tools.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      Set-Item -Path "Env:$name" -Value $value
    }
  }
  Write-Host "Loaded $envFile"
} else {
  Write-Warning "tools.env not found. Run scripts/install-scan-tools.ps1 first."
}

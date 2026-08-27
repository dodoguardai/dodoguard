@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo ========================================
echo  DodoGuard 手动卸载（卸载程序损坏时用）
echo ========================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo 请右键「以管理员身份运行」本脚本。
  pause
  exit /b 1
)

echo [1/4] 结束进程...
taskkill /F /T /IM DodoGuard.exe 2>nul
taskkill /F /T /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul

set "INSTALL_DIR="
for %%K in (
  "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall"
) do (
  for /f "tokens=2*" %%A in ('reg query %%K /s /f "DodoGuard" /d 2^>nul ^| findstr /i "InstallLocation"') do (
    set "INSTALL_DIR=%%B"
  )
)

if defined INSTALL_DIR (
  echo [2/4] 删除安装目录: !INSTALL_DIR!
  if exist "!INSTALL_DIR!" rd /s /q "!INSTALL_DIR!" 2>nul
) else (
  echo [2/4] 未在注册表找到 InstallLocation，尝试默认路径...
  if exist "%LOCALAPPDATA%\Programs\DodoGuard" rd /s /q "%LOCALAPPDATA%\Programs\DodoGuard" 2>nul
  if exist "%LOCALAPPDATA%\Programs\dodoguard" rd /s /q "%LOCALAPPDATA%\Programs\dodoguard" 2>nul
)

echo [3/4] 清理卸载注册表项...
for /f "delims=" %%G in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "DodoGuard" /d 2^>nul ^| findstr /i "\\Uninstall\\"') do (
  reg delete "%%G" /f >nul 2>&1
)
for /f "delims=" %%G in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "DodoGuard" /d 2^>nul ^| findstr /i "\\Uninstall\\"') do (
  reg delete "%%G" /f >nul 2>&1
)

echo [4/4] 完成。用户数据默认保留：
echo   %%LOCALAPPDATA%%\DodoGuard
echo   %%APPDATA%%\dodoguard
echo 若需完全清除，请手动删除以上目录。
echo.
pause

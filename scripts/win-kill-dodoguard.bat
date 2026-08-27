@echo off
chcp 65001 >nul
echo 正在结束 DodoGuard 相关进程...
taskkill /F /T /IM DodoGuard.exe 2>nul
taskkill /F /T /IM dodoguard.exe 2>nul
taskkill /F /T /IM mysqld.exe 2>nul
timeout /t 2 /nobreak >nul
echo 完成。若仍有进程，请在任务管理器中手动结束后再运行安装包。
pause

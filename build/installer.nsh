; DodoGuard Windows NSIS hooks (electron-builder)
; macOS 交叉编译 NSIS 时，卸载程序 CRC 可能与 Windows 运行时不一致 →「Installer integrity check has failed」
CRCCheck off

!include "nsProcess.nsh"

!macro _TaskKill IMAGE
  nsExec::ExecToLog 'taskkill /F /T /IM "${IMAGE}" 2>nul'
  Pop $0
!macroend

; $0 = 旧版 InstallLocation（可能为空）
!macro _ReadOldInstallDir
  StrCpy $0 ""
  ClearErrors
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    ClearErrors
    ReadRegStr $0 HKEY_CURRENT_USER "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
!macroend

!macro _KillProcessesUnderDir DIR
  ${If} "${DIR}" != ""
    DetailPrint "DodoGuard: stop processes under ${DIR}"
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$$d=''${DIR}''.TrimEnd(''\'').Replace(''\'',''\\''); Get-CimInstance Win32_Process -EA 0 | ? { $$_.ExecutablePath -and ($$_.ExecutablePath -like ($$d + ''*'') -or $$_.Name -eq ''DodoGuard'' -or $$_.Name -eq ''mysqld'') } | % { Stop-Process -Id $$_.ProcessId -Force -EA 0 }"'
    Pop $R1
  ${EndIf}
!macroend

!macro _ForceKillAppProcesses
  DetailPrint "DodoGuard: closing ${APP_EXECUTABLE_FILENAME}, mysqld, and install-dir children..."
  Push $0
  !insertmacro _ReadOldInstallDir
  !insertmacro _KillProcessesUnderDir $0
  !insertmacro _KillProcessesUnderDir $INSTDIR

  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R1
  ${nsProcess::KillProcess} "mysqld.exe" $R1
  !insertmacro _TaskKill "${APP_EXECUTABLE_FILENAME}"
  !insertmacro _TaskKill "mysqld.exe"
  !insertmacro _TaskKill "DodoGuard.exe"
  !insertmacro _TaskKill "dodoguard.exe"
  Sleep 3000
  Pop $0
!macroend

; 仅在覆盖安装段调用：跳过 uninstallOldVersion 的 /S 旧卸载（易失败），由本次安装覆盖文件并写入新卸载程序
!macro _SkipLegacySilentUninstall
  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  ClearErrors
!macroend

!macro customCheckAppRunning
  !insertmacro _ForceKillAppProcesses
  !insertmacro _SkipLegacySilentUninstall
!macroend

!macro preInit
  !insertmacro _ForceKillAppProcesses
!macroend

!macro customInit
  !insertmacro _ForceKillAppProcesses
!macroend

!macro customInstall
  ; 覆盖安装后确保卸载程序可被新文件替换（先结束占用进程）
  !insertmacro _ForceKillAppProcesses
!macroend

!macro customUnInstallCheck
  !insertmacro _ForceKillAppProcesses
  ClearErrors
!macroend

!macro customUnInstall
  !insertmacro _ForceKillAppProcesses
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro _ForceKillAppProcesses
  ClearErrors
!macroend

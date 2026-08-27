# Skill/MCP 扫描工具

| 路径                                  | 说明                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `scan-venv/Scripts/skillspector.exe`  | SkillSpector（pip，Win/Linux 相同方式）                                           |
| `scan-venv/Scripts/skill-scanner.exe` | Cisco Skill Scanner（pip，Win/Linux 相同方式）                                    |
| `snyk-agent-scan`                     | 可选：PATH 上的 Snyk Agent Scan CLI，或设置 `CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN` |
| `bundled/scan-venv-win-amd64.zip`     | Windows 离线 venv 包（SkillSpector + Cisco）                                      |
| `tools.env`                           | CLI 环境变量路径                                                                  |

安装：

- Windows: `cd ../scripts && .\install-scan-tools.ps1`
- Linux/macOS: `cd ../scripts && bash install-scan-tools.sh`

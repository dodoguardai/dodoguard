# `docs/` 数据目录

本目录保留 **漏洞库 CLI 与测试** 使用的载荷与合并产物（`yaml` / `json` / `csv` 等），**不是**产品文档站点（公开文档在 `site/docs`）。

- **Dify / FastGPT / Coze / n8n API 漏洞库**：默认路径见 `scripts/*-api-vuln-library.ts` 与 `package.json` 中 `dify:vuln`、`coze:vuln` 等脚本。
- **Dify 智能体攻击用例**：`dify-agent-attacks.yaml`、`dify-agent-security-checklist.csv`（与种子 SQL 注释中的引用一致）。
- **Coze 工作流样例（单测）**：`coze-workflow-help-center-template-redacted.yaml`。
- **其它**：`vulnerability/` 下为攻击话术/场景 YAML；`安全评估智能体-V3.0-Release.yml` 等为参考配置。

设计类说明文档已从仓库移除；部署与开发说明见根目录 `README-DODOGUARD.md`。

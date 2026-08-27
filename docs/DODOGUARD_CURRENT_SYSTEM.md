# DodoGuard 当前系统说明（代码库事实版）

**文档性质**：描述本仓库 **当前已实现或可定位的** 架构与能力，便于对内对齐、对外尽调或技术交接。  
**版本参考**：根目录 `package.json` 中 `version`（当前为 **0.119.0**）。  
**上游关系**：核心引擎继承自开源 [Promptfoo](https://www.promptfoo.dev/) 体系（评估、红队、多 Provider 等）；本仓库以 **DodoGuard** 品牌与 **企业向 API / 渗透与审计扩展** 为差异化增量。

---

## 1. 产品定位（一句话）

**DodoGuard** = 面向 LLM 应用与 Agent 平台的 **安全测试与评估工具链**：既包含开发者本地的 **评测（Eval）与红队（Red Team）** 能力，也包含面向组织的 **多租户控制台、漏洞与攻击任务、多平台配置审计、Dify 专项渗透** 等企业向模块。

---

## 2. 仓库结构（高层）

| 区域 | 路径 | 说明 |
|------|------|------|
| 后端 / CLI / 核心库 | `backend/src/` | TypeScript 主代码：命令行、评测引擎、红队插件、HTTP 服务、Dify 渗透、数据库访问等 |
| 企业控制台前端 | `frontend/` | Vite + React；Shadcn 系管理台 UI（任务、漏洞、仪表盘等） |
| 文档站（上游风格） | `site/` | Docusaurus 站点（与上游 Promptfoo 文档体系同源演进） |
| 数据库迁移 | `drizzle/` | SQL 迁移与种子数据（含 Dify/Coze 等漏洞种子） |
| 历史设计文档 | `docs/` | 企业版需求、架构、路线图等（部分为规划文档，**不等同于全部已落地**） |

**说明**：根目录 `README.md` 仍偏上游 **Promptfoo** 介绍；`README-DODOGUARD.md` 描述偏 **产品愿景与运维**，其中部分能力需以 **实际路由与表结构** 为准（见下文）。

---

## 3. 命令行（CLI）

- **二进制名**：`dodoguard`、`promptfoo`、`pf`（`package.json` 的 `bin` 字段）。
- **本地开发入口**：`npm run local` → `backend/src/main.ts`。
- **生产构建入口**：`dist/src/main.js`（由 `npm run build` 产出）。

`backend/src/main.ts` 中注册的主要能力包括（节选）：

- **`eval`**：对提示词 / 模型 / 流水线做批量评测（Promptfoo 核心能力）。
- **`redteam`**：红队子命令树（`init` / `generate` / `run` / `report` / `discover` 等），针对 LLM 应用的安全场景生成与执行测试。
- **`dify-pentest`**：**Dify Agent 渗透测试工具包**（独立配置 YAML、任务编排、日志与统计子命令等），实现位于 `backend/src/dify-pentest/`。
- **`mcp`**：将部分能力以 **Model Context Protocol** 暴露给 IDE / Agent（`backend/src/commands/mcp/`）。
- **其它**：`view`、`share`、`cache`、`config`、`validate`、`model scan` 等上游已有命令族。

脚本层还包含针对 **Dify / FastGPT / n8n** 的漏洞库或扫描辅助脚本（见 `package.json` 中 `dify:*`、`fastgpt:*`、`n8n:*` 等）。

---

## 4. Web 服务（后端）

- **启动**：`npm run dev:server`（nodemon + `backend/src/server/index.ts`）。
- **栈**：Express、与评测/追踪相关的路由；企业 API 使用 **JWT** 鉴权（见 `backend/src/server/routes/api/v1/index.ts`）。
- **实时**：Socket.io 等机制用于评测进度类推送（与上游 Viewer 模式一致，细节见 `backend/src/server/`）。

### 4.1 API v1（企业向）

路由聚合在 `backend/src/server/routes/api/v1/index.ts`，模块包括（按 import 列举，反映 **当前代码中的端点族**）：

- **身份与组织**：`auth`、`me`、`users`、`organizations`、`teams`、`roles`、`permissions`
- **安全业务对象**：`vulnerabilities`、`vulnerability-resources`、`attack-tasks`、`findings`、`target-agents`、`reports`、`dashboard`、`queue`、`quota`
- **商业与运营**：`subscription`、`system-config`
- **配置静态审计**：`dify-config-audit`、`skills-md-audit`、`coze-config-audit`、`fastgpt-config-audit`、`n8n-config-audit`

另有不挂在 `v1` 树下的历史/共用路由（如 `eval`、`redteam`、`traces`、`difyPentest`、`llmPentest` 等，见 `backend/src/server/routes/`），与控制台和 CLI 共用同一后端进程。

---

## 5. 数据层（企业 schema 摘要）

企业相关表定义于 `backend/src/database/tables-enterprise.ts`（Drizzle + PostgreSQL 风格），核心实体包括：

- **组织与用户**：`organizations`、`users`、`teams`、`user_teams`、`roles`、`permissions`
- **漏洞**：`vulnerabilities`（含 `cvss_score`、`cwe_id`、`mitre_id`、`owasp_id`、`owasp_llm_top10_mapping` 等字段）
- **攻击任务与结果**：`attack_tasks`、`attack_results`
- **目标 Agent**：`target_agents`
- **审计与配置**：`audit_logs`、`user_activities`、`system_configs`、`feature_flags`、`notification_configs`、`security_policies`

迁移与种子在 `drizzle/` 目录，覆盖 **MySQL/Postgres 演进、漏洞种子、报表审计字段、托管模型表** 等。

---

## 6. 红队与评测（核心引擎）

- **红队插件与策略**：`backend/src/redteam/plugins/`、`backend/src/redteam/strategies/`（大量场景：注入、RAG 泄露、合规类、金融/医疗垂直、Agentic 等）。
- **断言与评分**：`backend/src/assertions/`。
- **模型 Provider**：`backend/src/providers/`（多厂商、多协议，延续 Promptfoo 生态）。

---

## 7. Dify 渗透子系统（差异化）

- **CLI**：`dify-pentest`（`backend/src/commands/difyPentest.ts`）。
- **运行与配置**：`backend/src/dify-pentest/`（`run`、`configLoader`、插件、策略、报告模板等）。
- **测试**：`test/dify-pentest/` 下单元与集成测试。

该子系统针对 **Dify 工作流 / Agent** 的攻击面做编排与报告，与企业控制台中的 **Dify 配置审计 API** 形成「动态攻击 + 静态配置」组合潜力。

---

## 8. 前端控制台（`frontend/`）

- 技术栈：**Vite、React、Shadcn UI**（`frontend/README.md` 为模板说明）。
- 功能域（从目录与特性模块推断）：任务、漏洞、目标 Agent、报表、仪表盘、队列等，与 API v1 对应。

---

## 9. 与「规划文档」的关系

`docs/` 下另有 **ENTERPRISE_DESIGN、01-requirements、PRODUCT_ROADMAP_FEATURES** 等，描述目标架构与路线图。  
**本文档以可运行的代码与迁移为准**；若规划文档与实现不一致，以仓库内 **路由注册 + 表结构 + CLI 命令** 为优先依据。

---

## 10. 关键命令速查

```bash
npm install
npm run build          # 编译 TS + 前端
npm run dev            # 后端 + 前端开发
npm run local -- --help   # 本地 CLI（dodoguard / promptfoo 等价）
```

---

## 11. 外部参考

- 同类开源产品叙事与能力地图：[Promptfoo 官网](https://www.promptfoo.dev/)（Red Teaming、Evaluations、CI 集成、社区威胁情报等定位）。

# 智能体模式 · 实施方案（对齐 `agent-task-builder-prototype.html`）

本文档把静态原型里的交互与数据流，映射到可与现有 **`POST /api/v1/attack-tasks`**（及评测/报告链路）对接的工程任务，便于拆阶段实施。

**原型路径**：[`docs/agent-task-builder-prototype.html`](./agent-task-builder-prototype.html)

**已落地（首期垂直切片）**：

- 系统配置：`system_configs.key = agent_mode_config`（`llmModelId`、`systemPrompt` 等），迁移见 `drizzle/0041_agent_mode_system_config.sql`。
- 后端：编排与路由收敛在 `backend/src/agent/`（`config`、`chat/runAgentModeChat`、`skills/*`、`routes`）。HTTP 主前缀 **`/api/v1/agent`**：`GET /bundled-skills`、`POST /chat`；为兼容旧客户端仍挂载 **`/api/v1/agent-mode`** 同一套路由。内置 Skill 根目录仍为 `backend/src/agent-skills/bundled`（SKILL.md / 可选 `plugin.yaml`）；草案走 `createTaskSchema` 校验。
- 前端：设置 → 集成页「智能体模式（系统）」卡片；侧栏 **「通用」** 顶层项「智能体模式」→ `/tasks/agent-mode`（`?surface=dify|coze|fastgpt|n8n` 与顶栏 Tab 同步）；智能体安全测试子菜单中不再重复该项。Web UI 调用 `GET/POST /api/v1/agent/...`；页面布局对齐 `docs/agent-task-builder-prototype.html` 壳层（顶栏 surface Tab、单卡对话区、底部双 Select、草案卡片）；「待测智能体」下拉由 `GET /api/v1/target-agents?type=<surface>` 驱动，可切换手动输入 ID。

组织级 Skill 目录、ZIP 安装、SSE 报告等仍按下文阶段推进。

---

## 1. 范围与信息架构

### 1.1 用户可见模块

| 模块 | 原型行为 | 正式版职责 |
|------|-----------|------------|
| **智能体模式** | 顶栏 surface Tab；对话区；待测智能体 + 本会话 Skill 两个下拉（Skill 单选，可选「助手自动选用」）；消息流内草案卡片与测试报告卡片 | 主工作台：会话、编排、创建任务、查看报告入口 |
| **Skill 目录** | 目录列表、搜索、安装/卸载（内存模拟） | 组织级技能包的浏览、安装、版本与权限 |

### 1.2 路由建议（示例）

- `/app/agent-mode` 或 `/security-testing/agent-builder`：智能体模式（与现有「智能体安全测试」菜单对齐，避免与 `/agents` 设备列表混淆）。
- `/app/skills` 或 `/organization/skills`：Skill 目录。

主导航与 i18n 需与现有侧边栏数据源一致。

---

## 2. 核心用户旅程（与原型一致）

1. **选平台（surface）**：过滤可选智能体列表、默认 Skill 推荐策略、工具路由（若按平台拆分 MCP / HTTP）。
2. **选待测智能体**：下拉单选；数据来自只读 **`agents.list`**（或现有「已接入智能体」API），字段至少含 `id`、`name`、`platform`/surface。
3. **选本会话 Skill（可选）**：下拉单选；首项为「助手自动选用」；其余为**当前组织已安装**的 Skill（slug / id）；列表可很长，依赖原生 select 或可检索 Combobox（二期）。
4. **对话**：用户描述攻击意图；服务端返回 assistant 文本，并可附带结构化 **`draftTask`**（或分步 SSE）。
5. **同源校验（Harness）**：创建接口同源 schema 校验；**失败原因与通过摘要均在对话内展示**（无独立右栏）。
6. **确认创建**：用户确认后调用 **`tasksApi.create`**（即现有 attack-tasks 创建），`metadata` 打标 **`creationMode: agent_skills`**，并写入会话选择的 `agentId`、`surface`、`skillInvocation`、`skillsSessionPinnedSlugs`（0 或 1 个 slug）等。
7. **评测完成 → 报告**：任务 run 完成后，通过 **SSE / 轮询 / Webhook** 将状态与报告摘要推送到同一会话或跳转报告详情页（原型为对话内卡片）。

---

## 3. 数据与契约

### 3.1 会话上下文（服务端持久化建议）

每次调用编排接口至少携带：

- `conversationId`（可选，新建则服务端颁发）
- `surface`（枚举：dify | coze | fastgpt | n8n | …）
- `targetAgentId`（UUID 或平台侧 id，与现有 `targetConfig.agentId` 对齐）
- `pinnedSkillSlug`：**可选**；缺省或空表示自动选用
- `messages[]`：最近轮次或多轮摘要（按 token 预算裁剪）

### 3.2 草案 JSON（与创建接口对齐）

沿用原型中的草案形状思路，实际字段必须与 **`createTaskSchema`**（`backend/src/server/routes/api/v1/attack-tasks.ts`）一致，例如：

- `name`, `description`, `targetType`, `targetConfig`, `vulnerabilities`, `attackMode`, `detectionConfig`, …
- **`metadata`**（扩展 Record）建议约定：
  - `creationMode: 'agent_skills'`
  - `surface: string`
  - `skillInvocation: 'automatic' | 'manual_pin'`
  - `skillsSessionPinnedSlugs: string[]`（长度 0 或 1，与原型一致）
  - `skillsInstalledSlugs?: string[]`（可选，审计/调试）
  - `harnessValidation` / 校验版本号（可选）

校验逻辑：**复用创建接口同一套 zod/schema**，避免「对话里过、创建挂」的双标准。

### 3.3 Skill 目录（组织维度）

原型模拟：`GET catalog`、`POST install`。

正式版需要：

- **catalog**：内置 Skill + 组织上架包（版本、依赖 surface、是否内置）。
- **installation**：`organization_id` + `skill_package_id` + `installed_version`；卸载软删或硬删策略需定稿。
- **会话下拉**：仅返回**已安装**列表；安装变更后前端刷新选项（或订阅组织配置变更）。

---

## 4. 后端实施要点

### 4.1 API 清单（建议）

| 能力 | 方法 | 说明 |
|------|------|------|
| 会话消息 | `POST /api/v1/agent-mode/chat` | body：上下文 + 用户输入；返回：assistant、可选 `draftTask`、`validation` |
| 流式（可选） | `GET/POST …/chat/stream` | SSE：`delta`、`draft`、`validation`、`done` |
| Skill 目录 | `GET /api/v1/organization-skills/catalog` | 分页/搜索 |
| 安装/卸载 | `POST/DELETE …/install` | 权限：组织管理员 |
| 智能体列表 | 复用现有「智能体」列表 API | 按 `surface` 或 `platformFamily` 过滤 |

认证与 `organizationId` 与现有 attack-tasks 路由一致。

### 4.2 编排服务（Hermes 风格）

与原型文案对齐的实现骨架：

1. **加载 Skill**：若 `pinnedSkillSlug` 有值，只注入该 Skill（+ 必选 core）；否则由路由器/模型从已安装池中选择（可配置上限与优先级）。
2. **只读工具**：`task-types`、`agents.list`、平台配置只读等；**禁止**直接改任务/删数据类写工具（除非单独 RBAC）。
3. **生成草案**：模型输出结构化 JSON（function calling 或 JSON schema 约束）。
4. **Harness**：对草案执行与 **`createTaskSchema`** 相同的校验；错误信息返回前端写入对话卡片。
5. **确认创建**：前端仅触发已有 **`POST /api/v1/attack-tasks`**；服务端可根据 `metadata.creationMode` 记审计日志。

### 4.3 报告与任务状态

- 复用现有任务 run 状态机；新增「智能体模式创建」来源字段便于筛选。
- 报告摘要：`GET /api/v1/attack-tasks/:id/runs/:runId/report`（示例）或通过现有报告接口扩展。
- 推送：优先 **SSE** 订阅 run 状态，前端在对话线程追加「测试报告」组件（与原型一致）。

---

## 5. 前端实施要点（React）

- **页面**：智能体模式页 + Skill 目录页；状态可用 React Query。
- **API**：统一使用 `frontend/src/services/api/` 下 `apiClient`，禁止散落 `fetch`。
- **组件映射**：
  - Surface tabs → 全局 filter（URL query 或 jotai/context）。
  - `target-agent-select` → 对接 agents API；切换 surface 时重新请求并保留合法选中项。
  - `session-skill-select` → 对接已安装 Skill 列表；首项自动选用。
  - `chat-thread` → 消息列表 + 内嵌 **DraftCard**、**ReportCard**（markdown + JSON `<details>` + 操作按钮）。
- **无障碍**：两个 `select` 保留 `label`/`sr-only`，与原型一致。

二期可增强：**Skill 可检索 Combobox**（选项多时）、**会话历史侧边列表**。

---

## 6. 分阶段交付（建议）

| 阶段 | 目标 | 验收 |
|------|------|------|
| **M1** | Skill 目录 API + DB + 目录页对接 | 安装/卸载后，智能体模式下拉数据正确 |
| **M2** | `agent-mode/chat` + 注入 Skill + 生成草案 JSON + 同源校验 | 对话内出现草案卡片；校验失败可解释 |
| **M3** | 确认创建对接 `POST /attack-tasks` + metadata 标记 | 创建任务与向导创建字段一致 |
| **M4** | Run 状态订阅 + 对话内报告卡片 + 报告详情跳转 | 端到端「对话 → 任务 → 报告」 |

可与「仅 Dify surface」先做垂直切片，再扩 Coze/FastGPT/n8n。

---

## 7. 风险与依赖

- **模型稳定性**：JSON 草案需 schema/tool 约束 + 失败重试与限次自纠（原型 Harness 闭环）。
- **配额与权限**：创建仍走 attack-tasks 配额与组织权限。
- **agentId 形态**：创建接口对 `targetConfig.agentId` 有 UUID 推断逻辑（见 attack-tasks 路由）；平台侧 string id 需在 `targetConfig` 层统一映射。
- **Skill 与 surface 兼容性**：安装包声明 `supportedSurfaces`；下拉过滤避免选错组合。

---

## 8. 与原型差异跟踪（实施时闭环）

- 原型「清空对话」：正式版需定义是否保留 surface/agent/skill 选择（建议保留）。
- 原型「模拟：助手给出草案 / 测试报告」：上线后改为仅开发环境或特性开关。

---

## 9. 文档与变更记录

- 对外用户文档：在 `site/` 或产品手册增加「智能体模式」创建任务说明。
- **CHANGELOG**：合并前按仓库规范补充条目。

---

*文档版本：依据当前仓库内静态原型整理；若原型迭代，请同步更新本节与契约示例。*

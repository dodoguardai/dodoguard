# 工作流配置资产（Workflow Config Assets）— 开发规格

> 本文档供后续按序实现「用户上传的配置文件 → 可复用资产 + 节点统计 + 工作流可视化」能力。实现时应以本文与代码现状为准；冲突时以代码中的类型与 API 契约为准并回写本文档。

**文档版本**：1.3  
**状态（与实现对齐）**：  
- **P0**：`workflow_config_assets` 表与迁移、创建/列表/详情 API、解析与去重（`workflowConfigAsset*`）已落地；仅 `DB_TYPE=mysql` 或 `postgres` 时可用，SQLite 返回 `501`。  
- **P1（部分）**：创建攻击任务时可勾选「同时保存为配置资产」，服务端在插入任务行**之前**将 `metadata.configAudit` 同步写入资产表并回填 `metadata.configAssetId`（见 §6.3）。**尚未**：更新任务（PUT）、Smart Mode 创建表单、创建任务请求体仅传 `configAssetId` 拉取原文、重跑仅凭 `configAssetId` 免上传等完整闭环。  
- **P2**：前端 `/workflow-config-assets` 列表与 `/workflow-config-assets/:id` 详情（统计 + 原文下载）、独立上传对话框；侧栏入口在审计分组下。  
- **P3（部分）**：详情页在解析成功且存在 `graphSnapshot` 时使用 `DifyStructureWorkflowGraph` 回显；与 §8.5 中的「搜索节点 / 过滤类型 / minimap」等完整交互清单仍有差距，可继续迭代。

---

## 1. 背景与目标

### 1.1 问题

当前创建/重跑需要「配置审计」类任务时，用户通过请求体或元数据上传 `configAudit`（`yaml` / `json` + `fileName`），内容主要滞留在**任务维度**（`metadata.configAudit`），存在：

- 同一份 Dify / FastGPT / Coze 导出文件被多次上传、无法复用与去重。
- 缺少**组织级**统一入口查看「曾上传过哪些配置」。
- 节点级统计、拓扑回显若仅散落在任务详情，复用成本与视觉一致性感差。

### 1.2 目标（本需求要交付的）

1. 将用户上传的、通过校验的配置内容，**持久化为组织级「配置资产」**（产品名可称「配置资产」「工作流快照」等，本文统一用**资产**）。
2. 提供**资产列表页**：支持筛选、基础元信息、与关联任务数等。
3. 提供**资产详情页**：
   - **节点归类统计**（如 LLM、代码、数据库、工具/插件、知识库、条件分支等；首版以 Dify 为主，与现有解析器能力对齐）。
   - **拓扑/工作流回显**（有向图；优先与现有 `NormalizedWorkflow` / 结构 API 思路一致，见第 2 节、第 7 节）。
4. 任务创建/重跑时，可 **引用已有资产** 或 **上传新文件并生成资产**（行为细节见第 4 节）。

### 1.3 非目标（首版可不做）

- 跨组织共享资产、公开模板市场。
- 配置内敏感字段的自动脱敏展示（可做简单规则，不承诺完整 DLP）。
- 与 git 同级的「分支/合并」；首版只需 **版本链** 或 **同一逻辑资产的多次快照** 即可择一。
- 全量替代任务内 `configAudit` 存储（迁移策略见第 12 节，宜渐进）。

---

## 2. 与现有代码的关系

实现时应**复用**已有解析与审计管线，避免重复造轮子。

| 能力 | 参考路径（仓库内） |
|------|-------------------|
| 任务侧 `configAudit` 写入/重跑 | `backend/src/server/routes/api/v1/attack-tasks.ts`，`frontend/src/features/tasks/index.tsx` |
| 配置静态审计（Dify/Coze/FastGPT） | `backend/src/services/attackTaskJudgment/configAuditStatic.ts` |
| Dify 结构/清单 | `backend/src/services/difyConfigStructure.ts`、`backend/src/services/difyConfigAuditService.ts` |
| Dify DSL 归一化类型 | `backend/src/services/difyDsl/normalizeTypes.ts`（`NormalizedNode` / `NormalizedEdge` / `NormalizedWorkflow`） |
| FastGPT 与 Dify 对齐的 inventory | `backend/src/services/fastgptConfigStructure.ts` |
| 任务配置审阅 UI | `frontend/src/features/tasks/components/task-config-review-page.tsx` |
| 报告中的静态摘要 | `backend/src/services/reportService.ts`（`configAuditStaticSummary` 等） |
| 资产 REST（列表/创建/详情） | `backend/src/server/routes/api/v1/workflow-config-assets.ts` |
| 创建任务时可选写入资产 | `backend/src/services/workflowConfigAssetFromAttackTask.ts`（由 `attack-tasks` POST 调用） |
| 前端资产列表 / 详情 / 上传 | `frontend/src/features/workflow-config-assets/`；路由见 `frontend/src/routes/_authenticated/workflow-config-assets/` |
| 侧栏入口 | `frontend/src/components/layout/data/sidebar-data.ts`（`sidebar.item.workflowConfigAssets`） |

**原则**：资产详情中的「统计 + 图数据」应来自**同一条解析链**（或对其结果的缓存），与任务跑审计时用的结构保持一致，避免两套逻辑漂移。

---

## 3. 术语

| 术语 | 说明 |
|------|------|
| 资产（Config Asset） | 组织下一条可寻址的配置记录，含来源类型、原始内容或存储引用、解析后的结构化摘要。 |
| 来源类型（sourceType） | 如 `dify` / `fastgpt` / `coze` / `unknown`；与现有各 `*ConfigAuditService` 的识别方式对齐。 |
| 解析摘要（parseSummary） | 节点数、边数、按归一化类型分桶的计数、是否截断等，可 JSON 存库。 |
| 图快照（graphSnapshot） | 供前端 React Flow 等使用的 `nodes` + `edges`（或复用 `NormalizedWorkflow` 序列化），大图需截断策略。 |

---

## 4. 产品行为（建议默认）

1. **上传新文件**  
   - 用户上传后：服务端识别 `sourceType` → 解析 → 若成功则**创建资产**并返回 `assetId`；任务继续把 `configAssetId` 写入任务元数据或关联表。  
   - 若与已有内容 **hash 相同**（同组织、同 sourceType）：可复用已有资产，不重复存 blob（见第 5.2 节）。

2. **选择已有资产**  
   - 任务仅保存 `configAssetId`；重跑时从资产拉取内容，**不再要求**再次上传（与当前「重跑须再传」可逐步兼容；实现进度见第 **8.10** 节）。

3. **资产详情**  
   - 只读展示统计 + 图 + 原始文本/下载（权限允许时）。  
   - 编辑类能力（重命名、打标签）首版可选。

4. **从配置审计类任务创建流写入资产（可选）**  
   - 用户在「配置模式」向导中上传/粘贴 `configAudit`（`yaml` / `json`）后，可在提交创建任务时勾选「同时保存为工作流配置资产」。  
   - 服务端在**插入 `attack_tasks` 行之前**根据 `metadata.configAudit` 调用资产创建逻辑；成功则同一笔 `metadata` 中带 `configAssetId`（及可选 `workflowConfigAssetDeduplicated`）。  
   - 仅当 API 使用 MySQL 或 PostgreSQL 时可落库资产；否则跳过且任务照常创建。  
   - 批量「每智能体一条任务」时，每条任务各自执行上述逻辑；去重命中时多条任务可指向同一 `configAssetId`。

---

## 5. 数据模型（后端）

### 5.1 表：配置资产主表（建议名）

`workflow_config_assets`（具体表名以项目 Drizzle 风格为准）建议字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `organizationId` | uuid | 租户 |
| `createdByUserId` | uuid | 创建人 |
| `name` | string | 展示名，默认可用 `fileName` 或用户输入 |
| `sourceType` | enum/string | `dify` / `fastgpt` / `coze` / `unknown` |
| `fileName` | string? | 原始文件名 |
| `contentHash` | string | 对归一化后原文的 SHA-256，用于去重 |
| `rawFormat` | enum | `yaml` / `json` |
| `rawStorage` | 二选一 | 大对象存 **对象存储 key** 或 **DB 压缩文本**（与现有部署能力一致时选其一；单条建议上限如 2–5MB，可配置） |
| `parseStatus` | enum | `pending` / `ok` / `failed` |
| `parseError` | text? | 失败原因（短） |
| `parseSummary` | jsonb | 节点统计、截断标记、schema 版本号 |
| `graphSnapshot` | jsonb? | 供可视化的节点边（或仅存 `normalizedWorkflow` 引用 + 另表存图） |
| `parserVersion` | string | 解析器/归一化版本，便于升级后重算 |
| `createdAt` / `updatedAt` | timestamptz | — |

**索引**：`(organizationId, contentHash)` 或 `(organizationId, sourceType, contentHash)` 用于去重查询；`organizationId, createdAt desc` 用于列表。

### 5.2 关联：任务 ↔ 资产

二选一（实现时与现有 `AttackTask` 表结构对齐）：

- **A.** 在任务 `metadata` 增加 `configAssetId?: string`（改动小，查询需 JSON）。  
- **B.** 独立关联表 `attack_task_config_assets(taskId, assetId, role: 'primary')`（查询清晰，适合报表）。

推荐：**B** 若任务与资产多对多或需审计；否则 **A** 足够 MVP。

**当前实现（MVP）**：采用 **A**。任务 `metadata` 中除 `configAudit` 外，在勾选保存资产且创建成功时可出现：

- `configAssetId`：`string`（UUID），指向 `workflow_config_assets.id`  
- `workflowConfigAssetDeduplicated`：`boolean`（可选），表示本次命中已有 hash 去重而非新建行  

未在关联表建模；列表「关联任务数」等若需精确统计，后续可引入 **B** 或离线报表。

### 5.3 版本（可选）

若首版需要「同一名称多版本」：

- 子表 `workflow_config_asset_versions(assetId, version, contentHash, parseSummary, …)`，或  
- 平铺：`logicalAssetId` + `version` 字段。

文档建议：**MVP 只做「每次上传一条资产记录」+ hash 去重**；版本链作为 Phase 2。

---

## 6. API 设计（草案）

所有路由需与现有 API 版本前缀、`organizationId` 鉴权方式一致。

### 6.1 资产 CRUD（最小集）

**实现说明（与当前代码一致）**

- 路由前缀：`/api/v1/workflow-config-assets`（需认证 + `task:manage` 权限，与 `dify-config-audit` 一致）。
- 仅 `DB_TYPE=mysql` 或 `postgres` 时可用；SQLite 返回 `501 NOT_SUPPORTED`。

- `POST /api/v1/workflow-config-assets`  
  Body：`raw`（yaml/json 字符串，最大 5MB）、`fileName`、`name?`、`sourceType?`（`dify` | `fastgpt` | `coze` | `unknown` | `auto`，默认自动嗅探）  
  行为：解析 → 按 `(organization_id, source_type, content_hash)` 去重 → 入库或返回已有行。  
  响应：`201` 新建 / `200` 去重命中；`data.asset` 含 `parseSummary`、`graphSnapshot`（成功时）、`rawContent`。

- `GET /api/v1/workflow-config-assets`  
  Query：`limit`（默认 50，最大 200）、`offset`、`sourceType`、`q`（匹配 name / fileName）  
  返回：`items`、`total`；列表项带 `nodeCount`（来自 `parseSummary.dslParseSummary.node_count`，解析失败则无）。

- `GET /api/v1/workflow-config-assets/:id`  
  Query：`includeGraph=1` 或 `include=graph` 时返回 `graphSnapshot`；`includeRaw=1` 或 `include=full` 时返回 `rawContent`（默认不传则二者省略以节省带宽）。

- `DELETE /api/v1/workflow-config-assets/:id`（可选：仅管理员或「无关联任务」时可删）

### 6.2 解析-only（可选）

- `POST .../parse-preview`：不落库，仅返回 `parseSummary` + `graphSnapshot`，用于创建任务前预览（与上传创建资产二选一即可）。

### 6.3 任务侧（与当前代码一致）

**`POST /api/v1/attack-tasks` 创建任务**

| 字段 | 类型 | 持久化 | 说明 |
|------|------|--------|------|
| `saveWorkflowConfigAsset` | `boolean`，可选 | **否**（仅处理时用） | 为 `true` 时尝试把 `metadata.configAudit` 中的正文写入 `workflow_config_assets`。 |
| `metadata` | object，可选 | 是 | 须含 `configAudit`：`yaml` 与/或 `json`（非空白字符串）之一；可选 `fileName`。 |
| `platformFamily` | string，可选 | 视库类型写入任务列 | 用于推断 `sourceTypeHint`：`dify` / `coze` / `fastgpt` / `n8n`（`n8n` 映射为 `auto` 嗅探）等，见 `workflowConfigAssetFromAttackTask.ts`。 |

**处理顺序**

1. 解析请求体后，将 `saveWorkflowConfigAsset` 从待入库字段中剥离（不落列）。  
2. 调用 `mergeWorkflowConfigAssetIntoTaskMetadata({ organizationId, userId, metadata, platformFamily, saveWorkflowConfigAsset })`。  
3. 若 `saveWorkflowConfigAsset !== true`，或 `configAudit` 缺失/无有效 `yaml|json`，或资产创建返回非成功（含 SQLite、解析失败、超限等），则 `metadata` 保持原样或仅缺少 `configAssetId`。  
4. 使用合并后的 `metadata` 与任务其余字段执行 `insert`。  

**认证上下文**：`userId` 取 `req.user?.userId || req.user?.id`（与创建人一致）。

**未实现（与 §4 / P1 草案差异）**

- `PUT` 更新任务、其他创建入口（如 Smart Mode）**未**挂载同一套资产合并逻辑。  
- 请求体**尚未**支持仅传 `configAssetId` 从资产拉取正文填充 `configAudit`；与「重跑不重复上传」相关的优先级规则待实现后再补文档。

---

## 7. 解析与统计口径

### 7.1 流程

1. 文本入库前记录 `rawFormat`（根据首字符或扩展名 + `js-yaml` / `JSON.parse` 尝试）。  
2. 按 `sourceType` 调用现有模块（与 `configAuditStatic` 一致的分支）：  
   - Dify → `difyConfigStructure` / `normalize` 管线  
   - FastGPT → `parseFastGptConfigExportText` + `buildFastGptStructuredInventory`  
   - Coze → 现有 Coze YAML 分析入口  
3. 将归一化结果写入 `parseSummary`：  
   - 总节点数、总边数  
   - `byCategory`：与产品文案一致的分类（LLM、代码执行、HTTP/工具、知识库、数据库、插件、条件/分支、其他/unknown）  
   - `truncated: boolean`（与现有 `MAX_NODES_IN_STRUCTURE` 等常量对齐或略放宽）  
4. `graphSnapshot`：直接序列化 `NormalizedWorkflow` 或前端所需的最小 `nodes`/`edges`；超大则截断并在 UI 提示。

### 7.2 失败处理

- `parseStatus=failed` 时仍保留 `raw`（若策略允许），列表可显示「解析失败」，详情页展示错误信息与原始下载。

---

## 8. 前端

### 8.1 路由与信息架构

- 一级入口：建议放在与「任务」并列的导航下，如 **「配置资产」** 或 **「工作流配置」**。  
- 子页面：  
  - `/workflow-config-assets` — 列表  
  - `/workflow-config-assets/:id` — 详情（统计 + 图 + 原文/下载）

### 8.2 列表页

- 表格/卡片：名称、来源类型、节点数、创建时间、关联任务数（若 API 提供）。  
- 筛选：来源类型、时间范围、关键词。

### 8.3 资产详情页 — 布局原则

- **单页三区域 + 顶栏操作**：避免用户在一屏内找不到重点；信息优先级为 **图（工作流）为主、统计为纲、原文为据**。  
- **顶栏**：资产名称、来源类型（Dify / FastGPT / Coze 等徽标）、解析状态、`createdAt`、**下载原文**、**复制资产 ID**。  
  - `parseStatus=failed` 时：顶栏或图区上方使用 **警示条**（黄/红），文案明确「图与统计不可用，仍可查看/下载原文」。  
- **响应式（窄屏）**：纵向顺序建议为 **可折叠的统计 → 工作流画布 → 原文**；画布区域应保证 **不低于约 50% 视口高度**，否则优先保证画布可读性（原文默认折叠）。

### 8.4 节点统计区

- 展示总节点数、总边数（若 API 提供）、各类型数量（LLM、代码执行、HTTP/工具、知识库、数据库、插件、条件/分支、`unknown` 等）。  
- **可视化**：优先使用 **横向条形图或比例条** 辅助纯数字，便于扫读；`unknown` 单独一项并附简短说明（类型未映射或导出格式变化）。  
- **与画布联动**：统计所用 **类型配色 / 图例** 与画布节点颜色 **一致**，用户可将「统计条 → 图上节点」对应起来。

### 8.5 工作流复原（画布）

> 「复原」指根据 `graphSnapshot` / 归一化拓扑 **还原可交互的工作流视图**，不是编辑远端 Dify。

**形态**

- **主形态**：**有向图**（推荐 `@xyflow/react` v12）；边与条件分支用流程图比思维导图更清晰，且与 DSL 边关系一致。  
- **可选增强**：若需「从入口向下的树状总览」，可作为 **第二视图**（Tab：流程图 / 树形概览）或 **小窗缩略**，不与主图混用同一套强制脑图布局，避免维护两套布局算法。

**节点**

- 卡片：**一行主标题**（类型图标 + 节点名称或 id）；**一行次要信息**（模型名、工具名等，过长截断 + tooltip）。  
- 类型通过 **固定调色板 + 顶栏/侧栏图例** 区分，与第 8.4 节一致。

**布局**

- 默认使用 **自动布局**（如 Dagre：**自上而下**或**从左到右**），首屏突出 **入口 → 主干路径**。  
- **大图**：渐进展示（先主干或前 N 个节点），或仅首次 fit view；超出策略与后端截断一致，角标提示 **「仅展示前 N 个节点」**。

**交互（建议最小集）**

- 缩放、平移、**小地图（minimap）**、**适配画布（fit view）**。  
- **搜索节点**并定位到视口中心；选中节点时 **其余节点 dim**，突出当前节点。  
- **节点详情侧栏**（或抽屉）：展示解析器提供的该节点摘要字段；若有 JSON 路径或片段，优先展示 **该节点对应原文片段**，降低仅在底部翻 YAML 的成本。  
- **边**：条件分支若解析带标签，展示 **边标签**；多入边、自环可用曲线或淡色区分（首版无需动画）。

**过滤（大图场景）**

- 提供 **按类型快速过滤**（如「仅 LLM + HTTP」），与统计区类型联动，比一次性渲染全部节点更实用。

### 8.6 原文区

- Tab 或分段：**YAML** / **JSON**，只读 + 语法高亮；可与 `task-config-review-page` **共用组件与主题**，保证任务页与资产详情切换时视觉一致。  
- **默认可折叠**（尤其窄屏），避免挤压画布；展开时保持页面可滚动、画布高度可收缩。

### 8.7 空态、错态与截断

- **解析失败**：画布区使用 **明确占位** + 人可读错误摘要；**禁止**用空白画布暗示成功；原文区照常可用。  
- **截断**：画布角标或横幅标明 **「展示已截断」**；若统计基于全量而图基于截断，须在界面 **一句话说清**（避免用户以为统计与图来自同一子集）。  
- **超大工作流**：除截断提示外，引导使用 **过滤**、**下载原文**。

### 8.8 与任务 / 审计场景的衔接

- 若资产由任务产生或已关联任务：顶栏提供 **「查看关联任务」** 跳转列表（链接带筛选），强化「被测配置对象」心智。

### 8.9 可访问性与性能

- **键盘**：至少支持焦点进入画布内节点、Tab 顺序合理（具体达标级别可按团队规范）。  
- **性能**：节点数较多（如 >200）时考虑虚拟化或强制过滤提示；动效保持轻量，避免长时间盯屏疲劳。

### 8.10 任务创建流改造

**已实现**

- **配置模式向导**（`configuration-mode-wizard.tsx`）中，在 `config_audit` / `config_static` 对应的配置步骤（`step-config-yaml.tsx`）提供复选框：**「同时保存为工作流配置资产」**（`saveWorkflowConfigAsset`，默认**不勾选**）。  
- 提交创建任务时，若勾选则请求体带 `saveWorkflowConfigAsset: true`；创建成功后前端会 `invalidateQueries(['workflow-config-assets'])`，并根据返回任务 `metadata.configAssetId` 是否出现给出不同提示（i18n：`pages.tasks.createWizard.toastWorkflowAsset*`）。

**待实现 / 与 §4 草案差距**

- **「从资产库选择」**：创建任务 UI 尚未提供从 `/workflow-config-assets` 选已有 `configAssetId` 并省略上传的流程。  
- **默认是否勾选**「同时保存为资产」：当前为默认关闭，可按产品再调。  
- **仅传 `configAssetId`**：后端创建任务路径尚未支持从资产表反填 `configAudit`。

---

## 9. 安全与合规

- 配置可能含 URL、密钥占位符：日志与接口返回需走现有 `sanitizeObject` 习惯（参考 `fastgptConfigStructure`）。  
- 下载原始配置：建议权限与任务读取权限同级或更严。  
- 限流：创建资产接口按组织限频，防止大文件轰炸。

---

## 10. 测试策略

- **单元测试**：各 sourceType 的 fixture（仓库已有 Coze/Dify 样例可参考 `docs/` 与单测目录）→ 解析结果快照。  
- **API 测试**：创建资产、列表、详情、任务绑定后重跑拉取内容。  
- **前端**：详情页在 mock API 下截图测试（可选 Playwright）。

---

## 11. 分阶段实施清单（建议顺序）

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| **P0** | DB 表 + 服务端创建/列表/详情 API + 复用现有解析写入 `parseSummary` | 已完成 |
| **P1** | 任务 `metadata` 支持 `configAssetId`；创建任务可选写入资产 | **部分完成**：创建 + `saveWorkflowConfigAsset` + 写库前合并；**未完成**：PUT、仅 `configAssetId` 创建、重跑免上传 |
| **P2** | 前端列表 + 详情（统计 + 原文），符合第 **8.3–8.7** 节布局与错态 | **基本完成**（布局为卡片分区；窄屏专项与 §8.3 每一句话未逐项对标） |
| **P3** | 详情页工作流图（React Flow），符合第 **8.5** 节交互最小集 | **部分完成**：复用 `DifyStructureWorkflowGraph`；搜索/过滤/minimap 等以组件实际能力为准 |
| **P4** | hash 去重、迁移脚本：历史 `metadata.configAudit` → 资产 + 回填 id | 去重在创建资产 API 内已支持；**批量历史迁移脚本**仍待做 |

---

## 12. 迁移与兼容（历史任务）

1. 脚本扫描 `attack_tasks`（或等价表）中 `metadata.configAudit` 非空记录。  
2. 按组织批量创建资产（跳过已存在相同 hash）。  
3. 回填 `configAssetId` 到 metadata 或关联表。  
4. 保留原 `configAudit` 直至验证无误再考虑废弃写入路径（非必须）。

---

## 13. 开放问题（实现前需拍板）

1. 产品对外名称：「配置资产」是否最终文案。  
2. 原始内容存 DB 还是对象存储（与运维/成本）。  
3. 任务重跑：`CONFIG_AUDIT_REQUIRED` 场景下，是否允许仅凭 `configAssetId` 满足审计（建议：**允许**，并与合规确认）。  
4. 删除策略：有任务引用时禁止删除 vs 软删除。

---

## 14. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | — | 初稿 |
| 1.1 | — | 增补第 8 章：资产详情与工作流复原的 UI/UX 规格（布局、统计、画布、错态、可访问性） |
| 1.2 | — | 对齐 P0 实现：MySQL 迁移 `0038_workflow_config_assets`、服务 `workflowConfigAsset*`、路由见 §6.1 |
| 1.3 | — | 对齐 P1/P2/P3 部分落地：`saveWorkflowConfigAsset` 与 `workflowConfigAssetFromAttackTask`、§6.3 任务创建契约、§8.10 向导勾选、§5.2 metadata 字段、§11 阶段状态与待办差距说明 |

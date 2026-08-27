# 能力组件检测模块 (Capability Audit)

SKILLS / MCP / Tool 制品上传初审 · LLM 静态审查 · ClawHub 17 维安全维度。

本目录是**独立模块边界**，便于与其他同事代码合并。业务实现分布在约定路径下，通过本目录的 `register` 入口集成。

## 目录结构

```
capability-audit/
  README.md
  backend/
    register.ts
    routes/capability-scan.ts
    scan/
      runner.ts              # 编排入口 runCapabilityScan
      strategies.ts
      merge.ts
      workdir.ts
      engines/               # builtin_rules, skillspector, cisco_skill_scanner, llm

> **范围说明**：本模块仅启用 Skill/MCP 专项引擎，不含 Gitleaks、Semgrep、OSV、Grype 等通用扫描器。

backend（约定归属，勿与其他功能混改）:
  backend/src/server/routes/api/v1/skills-md-audit.ts
  backend/src/server/routes/api/v1/mcp-audit.ts
  backend/src/services/skillsMdAudit*.ts
  backend/src/services/mcpSourceAuditPrompts.ts
  backend/src/services/skillPackageExtract.ts

frontend（约定归属）:
  frontend/src/features/skills-md-audit/
  frontend/src/features/mcp-audit/
  frontend/src/features/audit/          # 可扩展注册表
  frontend/src/features/capability-audit/  # 统一「能力组件检测」页
  frontend/src/services/api/skills-md-audit.ts
  frontend/src/services/api/mcp-audit.ts
```

## 后端集成

**推荐（一行）：**

```typescript
import { wireCapabilityAuditIntoApiV1 } from '../../../../../capability-audit/integration/backend';

wireCapabilityAuditIntoApiV1(router, requirePermission('task:manage'));
```

或直接使用 `registerCapabilityAuditRoutes`（见 `capability-audit/backend/register.ts`）。

API：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/capability-scan/analyze` | **多引擎扫描**（quick/standard/deep_offline/llm_only）同步 |
| POST | `/api/v1/capability-scan/tasks` | 异步扫描任务（202，轮询 GET） |
| GET | `/api/v1/capability-scan/tasks/:id` | 任务状态与结果 |
| GET | `/api/v1/capability-scan/tasks/:id/sarif` | SARIF 2.1.0 导出 |
| GET | `/api/v1/capability-scan/tasks` | 最近任务列表（内存 MVP） |
| POST | `/api/v1/skills-md-audit/analyze` | ZIP 或 JSON `{ markdown }`（仅 LLM，兼容旧接口） |
| POST | `/api/v1/mcp-audit/analyze` | MCP 源码 ZIP（仅 LLM，兼容旧接口） |

### 扫描策略（Skill / MCP / Tool 专项）

Tool 工具/插件源码包使用工具专用 LLM 静态审计提示词，重点检查参数注入、SSRF、越权、敏感数据与凭据访问、危险写操作、工具投毒和供应链风险；不会调用 Skill/MCP 专用 CLI 扫描器。

| 策略 | 引擎 |
|------|------|
| `quick` | skillspector + cisco_skill_scanner（无 LLM） |
| `standard` | skillspector + cisco_skill_scanner + **LLM 复审** |
| `deep_offline` | 双引擎 + llm 语义审计 |
| `online_enhanced` | 双引擎 + llm |
| `debug` | 指定 Skill/MCP 引擎（skillspector / cisco_skill_scanner / llm） |
| `llm_only` | llm |

支持上传 **`.zip` / `.tar.gz` / `.tgz`**。路径穿越会生成 `completed_with_high_risk` 与高危 Finding。

外部 CLI 未安装时会 `skipped` 并生成 `scan_integrity_risk`。`builtin_rules` 仅调试模式可选用，默认策略不再启用。

环境变量：

- `CAPABILITY_SCAN_SKILLSPECTOR_BIN`（默认 `tools/scan-venv/.../skillspector`）
- `CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN`（默认 `tools/scan-venv/.../skill-scanner`）

### 离线工具包

| 路径 | 说明 |
|------|------|
| `tools/bundled/scan-venv-win-amd64.zip` | SkillSpector + Cisco venv（Windows），首次扫描自动解压 |
| `tools/manifest.json` | 版本清单 |

**安装方式：**

| 工具 | Windows / Linux 是否相同 |
|------|--------------------------|
| SkillSpector | ✅ 相同：`pip install` 到 `scan-venv` |
| Cisco Skill Scanner | ✅ 相同：`pip install cisco-ai-skill-scanner` 到同一 venv |

```powershell
# Windows
cd capability-audit/scripts
.\install-scan-tools.ps1
. .\load-env.ps1
```

```bash
# Linux / macOS
cd capability-audit/scripts
bash install-scan-tools.sh
# 然后 export 或 source tools/tools.env 中的变量
```

### 扩展扫描引擎

```typescript
import { registerScanEngine } from '../capability-audit/backend/register';

registerScanEngine({
  name: 'my_engine',
  async run(ctx) {
    return { findings: [], status: { engine: 'my_engine', status: 'success', findingCount: 0 } };
  },
});
```

并在 `capability-audit/backend/scan/strategies.ts` 的 `STRATEGY_ENGINES` 中加入引擎名。

## 前端集成

1. 应用启动时导入（确保 audit module 注册）：

```typescript
import '@/capability-audit/frontend/register';
// 或: import 'capability-audit/frontend/register' 视 tsconfig paths 而定
```

2. 路由已提供：`/capability-audit`（对应原型「能力组件检测」）

   新增路由后需重新生成 TanStack Router 树（项目惯例命令，例如 `npm run dev` 或 `npx tsr generate`）。

3. 侧栏（可选，在 `sidebar-data.ts` 增加一项）：

```typescript
{ title: '能力组件检测', url: '/capability-audit', icon: Shield }
```

## 扩展新的审计类型

1. 实现 `AuditModule`（参考 `frontend/src/features/audit/modules/skills-md.ts`）：

```typescript
import { createAuditModule } from '@/features/audit/audit-factory';
import { registerAuditModule } from '@/features/audit/audit-registry';

const myModule = createAuditModule({
  type: 'my-artifact',
  label: 'My Artifact Audit',
  routePath: 'my-audit',
  analyze: async (input) => myApi.analyze(input),
});
registerAuditModule(myModule);
```

2. 在 `capability-audit/shared/constants.ts` 的 `CAPABILITY_AUDIT_VARIANTS` 中增加 tab 配置。

3. 在 `artifact-audit-panel.tsx` 中增加对应上传 UI（或复用现有 Step 组件）。

## 环境变量

- `OPENAI_API_KEY` / `SKILLS_MD_AUDIT_PROVIDER_ID` / `DIFY_CONFIG_AUDIT_PROVIDER_ID`：无前端模型选择时的默认 LLM

## 测试

```bash
# LLM 审计（主项目）
npm test -- skillsMdAudit

# 扫描合并 / SARIF（本模块）
npx tsx capability-audit/tests/scan.test.ts
```

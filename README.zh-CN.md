# DodoGuard

[English](./README.md) | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="./docs/image/logo.png" alt="DodoGuard" width="280" />
</p>

<p align="center">
  <b>Agent 过了 Demo，不代表过了安全。</b>
</p>

<p align="center">
  评估质量 · 红队行为 · 覆盖 Dify / Coze / FastGPT / n8n · 沉淀放行证据<br/>
  CLI · Web 控制台 · 桌面端 — 数据留在你这边
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="./site">文档</a> ·
  <a href="./examples">示例</a> ·
  <a href="./SECURITY.md">安全披露</a>
</p>

<p align="center">
  <img src="./docs/image/image.png" alt="DodoGuard 产品界面" width="900" />
</p>

---

## 你能发现什么

| 风险 | 典型表现 |
| --- | --- |
| **注入与越狱** | 系统提示与防护策略被绕过 |
| **数据与工具滥用** | 敏感泄露、未授权工具 / MCP 调用 |
| **回归** | 模型或提示词变更后质量下滑 |
| **平台缺口** | Agent 应用配置与攻击面问题 |
| **放行证据不足** | 缺少可私有留存的发现与报告 |

## 从检测 → 放行 → 观测

多数团队仍在人工抽查对话。生产级 Agent 需要闭环：

**评估** → **攻击** → **决策** → **私有化**

生命周期：**入库 → 检测与放行 → 持续观测**。原则：**知晓 ≠ 放行**。

<p align="center">
  <img src="./docs/image/life.png" alt="DodoGuard 生命周期" width="900" />
</p>

## 产品里长什么样

#### 1. 总览
一眼看到 Agent 与任务的整体风险态势。

![控制台总览](./docs/image/dashboard.png)

#### 2. 资产台账
登记即资产。知晓 ≠ 放行。

![资产台账](./docs/image/aset_en.png)

#### 3. 检测任务
将评估、红队与平台检测作为可版本化的工作执行。

![检测任务](./docs/image/task.png)

#### 4. 发现详情
下钻失败用例、证据与严重级别。

![任务详情](./docs/image/task_detail.png)

#### 5. 报告
在私有环境内导出放行证据。

![报告](./docs/image/report.png)

#### 6. 风险闭环
修复、复测，再决定是否上线。

![风险闭环](./docs/image/risk_loop.png)

## 能力一览

- **LLM 评估** — Prompt、Provider、变量化用例与多种断言  
- **红队测试** — 插件与自适应探测，面向真实应用而不只是模型  
- **平台加固** — Dify 类扫描、配置审计、风险分析  
- **运营控制台** — Agent、任务、漏洞、修复与报告  
- **私有交付** — CLI、Docker、CI/CD、Electron 桌面端  

**模型接入：** OpenAI · Anthropic · Azure · Bedrock · Ollama · 兼容 OpenAI API

---

## 快速开始

### CLI — 约 60 秒

需要 Node.js **22.12+**。

```sh
git clone https://github.com/dodoguardai/dodoguard.git
cd dodoguard && npm ci && npm run build

cp -R examples/openai-eval-factuality ./my-eval && cd my-eval
export OPENAI_API_KEY="<your-api-key>"
../node_modules/.bin/dodoguard eval
```

更多配置：[examples/](./examples) · 本地模型：[examples/redteam-ollama/](./examples/redteam-ollama)

### Web 界面 — Docker Compose

```sh
docker compose up -d --build
# 打开 http://localhost:3000
```

### 其他方式

[本地开发](./CONTRIBUTING.md) · [桌面端打包](./docs/desktop-packaging.md) · [docker-compose.yml](./docker-compose.yml)

> 不要把 API Key、生产 URL 或真实业务数据提交到仓库。

---

## 安全与贡献

漏洞请按 [SECURITY.md](./SECURITY.md) 私下报告。  
贡献见 [CONTRIBUTING.md](./CONTRIBUTING.md) · [行为准则](./CODE_OF_CONDUCT.md) · [支持](./SUPPORT.md)

## 许可证

[MIT](./LICENSE)

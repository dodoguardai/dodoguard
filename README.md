# DodoGuard

[English](./README.md) | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="./docs/image/logo.png" alt="DodoGuard" width="280" />
</p>

<p align="center">
  <b>Your agent passed the demo. It hasn’t passed security.</b>
</p>

<p align="center">
  Evaluate quality · Red-team behavior · Assess Dify / Coze / FastGPT / n8n · Ship with evidence<br/>
  CLI · Web console · Desktop — run it on your side
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="./site">Docs</a> ·
  <a href="./examples">Examples</a> ·
  <a href="./SECURITY.md">Security</a>
</p>

<p align="center">
  <img src="./docs/image/image.png" alt="DodoGuard product" width="900" />
</p>

---

## What you can catch

| Risk | What it looks like |
| --- | --- |
| **Injection & jailbreaks** | System prompts and guardrails get bypassed |
| **Data & tool abuse** | Sensitive leaks, unauthorized tool / MCP calls |
| **Regressions** | Quality drops after a model or prompt change |
| **Platform gaps** | Misconfig and attack surface on agent apps |
| **Weak release proof** | No durable findings or reports you can keep private |

## From check → release → observe

Most teams still spot-check chat. Production agents need a loop:

**Evaluate** → **Attack** → **Decide** → **Keep private**

Lifecycle: **intake → detect & release → observe**. Principle: **acknowledge ≠ release**.

<p align="center">
  <img src="./docs/image/life.png" alt="DodoGuard lifecycle" width="900" />
</p>

## See it in the product

#### 1. Overview
Risk posture across agents and tasks at a glance.

![Dashboard](./docs/image/dashboard.png)

#### 2. Asset ledger
Register agents as assets. Acknowledge ≠ release.

![Assets](./docs/image/aset_en.png)

#### 3. Detection tasks
Run eval, red-team, and platform checks as versioned work.

![Tasks](./docs/image/task.png)

#### 4. Findings
Drill into failures, evidence, and severity.

![Task detail](./docs/image/task_detail.png)

#### 5. Reports
Export release evidence without leaving your infra.

![Report](./docs/image/report.png)

#### 6. Remediation loop
Fix, retest, then decide go-live.

![Risk loop](./docs/image/risk_loop.png)

## Capabilities at a glance

- **LLM evaluation** — prompts, providers, variable cases, multiple assertion types  
- **Red-team testing** — plugins and adaptive probes on live apps, not only models  
- **Platform hardening** — Dify-class scans, config audits, risk analysis  
- **Ops console** — agents, tasks, vulns, remediation, reporting  
- **Self-hosted** — CLI, Docker, CI/CD, Electron desktop  

**Providers:** OpenAI · Anthropic · Azure · Bedrock · Ollama · OpenAI-compatible APIs

---

## Quick start

### CLI — about 60 seconds

Requires Node.js **22.12+**.

```sh
git clone https://github.com/dodoguardai/dodoguard.git
cd dodoguard && npm ci && npm run build

cp -R examples/openai-eval-factuality ./my-eval && cd my-eval
export OPENAI_API_KEY="<your-api-key>"
../node_modules/.bin/dodoguard eval
```

More configs: [examples/](./examples) · local models: [examples/redteam-ollama/](./examples/redteam-ollama)

### Web UI — Docker Compose

```sh
docker compose up -d --build
# open http://localhost:3000
```

### Also available

[Local development](./CONTRIBUTING.md) · [docker-compose.yml](./docker-compose.yml)

> Never commit API keys, production URLs, or real business data.

---

## Security & contributing

Report vulnerabilities privately via [SECURITY.md](./SECURITY.md).  
Contribute with [CONTRIBUTING.md](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [Support](./SUPPORT.md)

## License

[MIT](./LICENSE)

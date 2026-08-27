# DodoGuard

> 面向 LLM、Agent 与 AI 应用的安全测试、评估与本地部署平台。

DodoGuard 用于在应用上线前和迭代过程中，以可重复的测试用例检查模型输出质量、提示词安全性和 Agent 行为风险。它将常规 LLM 评估、红队攻击测试、Dify 应用渗透测试、结果分析与报告集中在同一套 CLI、Web 界面和桌面应用中。

## 它解决什么问题

将 LLM 接入业务后，团队通常会遇到三类问题：模型回答是否符合预期、提示词和工具调用是否能抵御攻击、以及每次模型或提示词变更后是否出现回归。DodoGuard 通过可版本化的配置与测试用例，帮助团队：

- 比较不同模型、提示词和参数下的输出，并用规则、语义相似度或模型裁判进行评估；
- 对应用执行红队测试，覆盖提示词注入、敏感信息泄露、越权、违规诱导等风险；
- 管理测试任务、目标 Agent、漏洞库和结果报告；
- 在本地、Docker、CI/CD 或桌面端运行，避免将模型密钥和测试数据交给第三方服务。

## 功能概览

- LLM 评估：Prompt、Provider、变量化测试用例和多种断言。
- 安全测试：红队插件、攻击任务编排、Dify 应用测试和风险分析。
- 多模型接入：支持 OpenAI、Anthropic、Azure、Bedrock、Ollama 及兼容 OpenAI API 的服务等。
- Web 平台：管理模型、Agent、测试任务、规则、漏洞和报告。
- 可交付部署：提供 Docker 镜像构建、Docker Compose 和 Electron 桌面端打包脚本。

## 快速体验：CLI 评估

安装 Node.js **22.12 或更高版本**后，可先使用一个示例运行评估：

```sh
git clone https://github.com/ZhiyuFutureAI/dodoguard.git
cd dodoguard
npm ci
npm run build

# 复制一个示例配置到自己的工作目录后，按其中 Provider 的要求设置 API Key
cp -R examples/openai-eval-factuality ./my-eval
cd my-eval
export OPENAI_API_KEY="<your-api-key>"
../node_modules/.bin/dodoguard eval
```

更多可直接修改的配置见 [`examples/`](./examples)。例如使用本地模型时可参考 [`examples/redteam-ollama/`](./examples/redteam-ollama)。不要把 API Key、生产 URL 或真实业务数据提交到仓库。

## 本地开发与 Web 使用

### 1. 安装并配置

```sh
git clone https://github.com/ZhiyuFutureAI/dodoguard.git
cd dodoguard
npm ci
cp .env.example .env
```

默认 `.env.example` 使用 SQLite，适合本地体验。请为 `JWT_SECRET` 和 `JWT_REFRESH_SECRET` 生成不同的随机值：

```sh
openssl rand -base64 48
```

如需使用 MySQL 进行开发，可先启动开发数据库：

```sh
npm run dev:mysql
```

然后在 `.env` 中配置 `DB_TYPE=mysql` 及相应的 `DATABASE_URL` 或 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`。生产环境请使用独立数据库账号、强密钥和受限网络访问。

### 2. 启动

```sh
# 首次或数据库结构更新后执行
npm run db:migrate

# 同时启动 API 与前端开发服务器
npm run dev
```

默认前端地址为 `http://localhost:3000`，API 默认监听 `http://localhost:15500`。首次访问时按界面引导创建管理员账户；不要使用或传播固定账号、密码或 JWT 密钥。

常用开发检查：

```sh
npm run lint
npm run build
```

## Docker 部署

### 构建镜像

Dockerfile 的**构建上下文必须是仓库根目录**；其中会构建后端、前端与 capability-audit，并在镜像内初始化 SQLite：

```sh
docker build -t dodoguard:local .
```

Dockerfile 可通过构建参数调整基础镜像或软件源。例如：

```sh
docker build \
  --build-arg NODE_IMAGE=node:22.14.0-alpine \
  --build-arg NPM_REGISTRY=https://registry.npmjs.org \
  -t dodoguard:local .
```

镜像内的默认服务端口为 `3000`，默认使用 SQLite。数据库、报告和用户配置分别保存在以下目录，部署时应持久化：

| 容器目录                     | 用途                    |
| ---------------------------- | ----------------------- |
| `/home/dodoguard/.dodoguard` | SQLite 数据库和应用数据 |
| `/app/reports`               | 生成的报告              |
| `/app/user-configs`          | 用户配置与导入文件      |

### 使用 Docker Compose

根目录的 [`docker-compose.yml`](./docker-compose.yml) 是公开版本推荐的单容器 SQLite 部署方式：

```sh
docker compose up -d --build
docker compose ps
```

访问 `http://localhost:3000`。停止服务但保留数据：

```sh
docker compose down
```

若要连同 Compose 创建的数据卷一起删除，使用 `docker compose down -v`；该操作会删除本地数据库和报告，请先备份。

### 使用已构建或已发布的镜像

将镜像名替换为实际发布的版本号，并挂载持久化目录：

```sh
docker run -d --name dodoguard \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DODOGUARD_SELF_HOSTED=1 \
  -v dodoguard-data:/home/dodoguard/.dodoguard \
  -v dodoguard-reports:/app/reports \
  -v dodoguard-user-configs:/app/user-configs \
  dodoguard:local
```

查看健康状态和日志：

```sh
docker inspect --format='{{.State.Health.Status}}' dodoguard
docker logs -f dodoguard
```

### 关于 `zhian-offline/`

`zhian-offline/` 是历史离线交付目录，可能含体积很大的镜像归档、MySQL 初始化 SQL 和交付清单；它已被 `.dockerignore` 排除，**不是公开 Docker 镜像的构建输入**。公开镜像的 SQLite 基线来自 [`drizzle/sqlite-bootstrap/`](./drizzle/sqlite-bootstrap)。

请勿把 `zhian-offline/`、`release/`、镜像 tar 包或带业务数据的 SQL 文件加入开源提交。如需面向客户制作离线 MySQL 交付物，应在受控的私有发布流程中单独生成、校验和分发。

## Electron 桌面应用

桌面端使用 Electron 和 electron-builder 打包；输出目录为 `release/`。请在对应目标操作系统上构建，以获得最稳定的结果。

### 生成应用

桌面端构建会将 `release/dodoguard.sql` 放入安装包，供首次初始化本地 MySQL 使用。该文件不应提交到开源仓库；请从**不含生产敏感数据**的初始化库导出后，再执行任一桌面端命令：

```sh
mkdir -p release
mysqldump -h <host> -u <user> -p --databases <database> > release/dodoguard.sql
```

```sh
npm ci

# 校验桌面端所需资源和配置
npm run desktop:preflight

# 只生成当前平台的未打包目录，便于本地验证
npm run desktop:pack

# 生成当前平台的安装包 / 分发包
npm run desktop:dist
```

若希望将本地 MySQL 一并放入安装包，使用平台对应的 bundle 命令：

```sh
npm run desktop:dist:win:bundle
npm run desktop:dist:mac:bundle
npm run desktop:dist:linux:bundle
```

这些 bundle 命令会下载相应平台的 MySQL 运行时。

构建产物通常位于：

- Windows：`release/` 下的 NSIS 安装程序；
- macOS：`release/` 下的 `.dmg`；
- Linux：`release/` 下的 `.AppImage`，部分环境还会生成 `.deb`。

Linux AppImage 可直接运行：

```sh
chmod +x release/DodoGuard-*.AppImage
./release/DodoGuard-*.AppImage
```

首次启动时，桌面应用会引导初始化本机数据库并启动服务；数据库仅应监听本机回环地址。更完整的平台说明见 [`docs/desktop-packaging.md`](./docs/desktop-packaging.md)。

## 项目结构

| 目录                            | 说明                              |
| ------------------------------- | --------------------------------- |
| [`backend/src/`](./backend/src) | 核心库、CLI、API 服务与数据库迁移 |
| [`frontend/`](./frontend)       | React Web 界面                    |
| [`examples/`](./examples)       | 评估、红队和 Provider 配置示例    |
| [`test/`](./test)               | 自动化测试                        |
| [`drizzle/`](./drizzle)         | 数据库 schema 与迁移资源          |
| [`desktop/`](./desktop)         | Electron 主进程与桌面端资源       |
| [`site/`](./site)               | 文档站点                          |

## 安全与贡献

- 安全问题请按 [`SECURITY.md`](./SECURITY.md) 的方式私下报告，不要在公开 Issue 中披露漏洞细节。
- 贡献说明见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。提交前至少运行 `npm run lint` 和 `npm run build`。
- 行为准则见 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)，使用支持渠道见 [`SUPPORT.md`](./SUPPORT.md)。

## 许可证

[MIT](./LICENSE)

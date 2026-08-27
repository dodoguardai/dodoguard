# DodoGuard

[English](./README.md) | [简体中文](./README.zh-CN.md)

> A security testing, evaluation, and local deployment platform for LLMs, agents, and AI applications.

DodoGuard helps teams assess output quality, prompt security, and agent behavior before release and throughout iteration. It brings LLM evaluation, red-team testing, Dify application pentesting, analysis, and reporting into one CLI, web interface, and desktop application.

## What it solves

Teams integrating LLMs into production need to know whether responses meet expectations, whether prompts and tools resist attacks, and whether a model or prompt change introduces regressions. DodoGuard provides versionable configurations and test cases to help you:

- Compare models, prompts, and parameters with rule-based, semantic-similarity, or model-graded assertions.
- Run red-team tests for prompt injection, sensitive-information disclosure, authorization bypass, and harmful or non-compliant behavior.
- Manage test tasks, target agents, vulnerability libraries, findings, and reports.
- Run locally, in Docker, CI/CD, or a desktop app without handing API keys and test data to a third party.

## Highlights

- LLM evaluation with prompts, providers, variable test cases, and multiple assertion types.
- Security testing with red-team plugins, attack-task orchestration, Dify testing, and risk analysis.
- Providers including OpenAI, Anthropic, Azure, Bedrock, Ollama, and OpenAI-compatible APIs.
- A web console for models, agents, test tasks, rules, vulnerabilities, and reports.
- Docker and Electron/electron-builder delivery workflows.

## Quick start: CLI evaluation

Install Node.js **22.12 or later**, then run an example evaluation:

```sh
git clone https://github.com/dodoguardai/dodoguard.git
cd dodoguard
npm ci
npm run build

# Copy an example into your own working directory and configure its provider.
cp -R examples/openai-eval-factuality ./my-eval
cd my-eval
export OPENAI_API_KEY="<your-api-key>"
../node_modules/.bin/dodoguard eval
```

See [`examples/`](./examples) for more configurations, including [`examples/redteam-ollama/`](./examples/redteam-ollama) for local models. Never commit API keys, production URLs, or real business data.

## Local development and web UI

### 1. Install and configure

```sh
git clone https://github.com/dodoguardai/dodoguard.git
cd dodoguard
npm ci
cp .env.example .env
```

The default `.env.example` uses SQLite and is suitable for local evaluation. Generate different random values for `JWT_SECRET` and `JWT_REFRESH_SECRET`:

```sh
openssl rand -base64 48
```

For MySQL development, start the development database:

```sh
npm run dev:mysql
```

Then configure `DB_TYPE=mysql` and either `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`. In production, use a dedicated database account, strong secrets, and restricted network access.

### 2. Run the application

```sh
# Run after a first install or database schema update.
npm run db:migrate

# Start the API and frontend development server.
npm run dev
```

The frontend is served at `http://localhost:3000`; the API listens at `http://localhost:15500` by default. Create an administrator through the first-run UI. Do not use or distribute fixed accounts, passwords, or JWT secrets.

Useful checks:

```sh
npm run lint
npm run build
```

## Docker deployment

### Build an image

The Docker build context **must be the repository root**. The Dockerfile builds the backend, frontend, and capability audit service and initializes SQLite in the image:

```sh
docker build -t dodoguard:local .
```

You can change the base image or npm registry with build arguments:

```sh
docker build \
  --build-arg NODE_IMAGE=node:22.14.0-alpine \
  --build-arg NPM_REGISTRY=https://registry.npmjs.org \
  -t dodoguard:local .
```

The default service port is `3000` and the default database is SQLite. Persist these directories when deploying:

| Container path | Purpose |
| --- | --- |
| `/home/dodoguard/.dodoguard` | SQLite database and application data |
| `/app/reports` | Generated reports |
| `/app/user-configs` | User configurations and imports |

### Docker Compose

The root [`docker-compose.yml`](./docker-compose.yml) is the recommended public, single-container SQLite deployment:

```sh
docker compose up -d --build
docker compose ps
```

Open `http://localhost:3000`. To stop the service while retaining data:

```sh
docker compose down
```

`docker compose down -v` also deletes local database and report volumes; back them up first.

### Run a built or published image

Replace the image tag with the version you publish and mount persistent volumes:

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

Check health and logs:

```sh
docker inspect --format='{{.State.Health.Status}}' dodoguard
docker logs -f dodoguard
```

### About `zhian-offline/`

`zhian-offline/` is a historical offline-delivery directory. It can contain large image archives, MySQL initialization SQL, and delivery manifests. It is excluded from the public Docker build context and from Git. The public image uses the SQLite baseline under [`drizzle/sqlite-bootstrap/`](./drizzle/sqlite-bootstrap).

Do not add `zhian-offline/`, `release/`, image archives, or SQL files containing business data to public commits. Generate and distribute offline MySQL deliveries only through a controlled private process.

## Electron desktop application

The desktop application uses Electron and electron-builder. Outputs are written to `release/`. Build on the target operating system for the most reliable artifacts.

### Build and package

The desktop build embeds `release/dodoguard.sql` for first-time local MySQL initialization. Do not commit that file to the public repository. Export a database with no production-sensitive data before running desktop commands:

```sh
mkdir -p release
mysqldump -h <host> -u <user> -p --databases <database> > release/dodoguard.sql
```

```sh
npm ci

# Validate desktop resources and configuration.
npm run desktop:preflight

# Create an unpacked build for the current platform.
npm run desktop:pack

# Create an installer/distribution package for the current platform.
npm run desktop:dist
```

To bundle a local MySQL runtime, use a platform-specific command:

```sh
npm run desktop:dist:win:bundle
npm run desktop:dist:mac:bundle
npm run desktop:dist:linux:bundle
```

These bundle commands download the corresponding MySQL runtime. Output normally includes an NSIS installer on Windows, a `.dmg` on macOS, and an `.AppImage` (and sometimes `.deb`) on Linux.

Run a Linux AppImage directly:

```sh
chmod +x release/DodoGuard-*.AppImage
./release/DodoGuard-*.AppImage
```

On first launch, the desktop application guides local database initialization and starts the service. Bind the database to the local loopback interface only. See [`docs/desktop-packaging.md`](./docs/desktop-packaging.md) for platform details.

## Repository layout

| Directory | Description |
| --- | --- |
| [`backend/src/`](./backend/src) | Core library, CLI, API server, and database migrations |
| [`frontend/`](./frontend) | React web interface |
| [`examples/`](./examples) | Evaluation, red-team, and provider examples |
| [`test/`](./test) | Automated tests |
| [`drizzle/`](./drizzle) | Database schema and migration resources |
| [`desktop/`](./desktop) | Electron main process and desktop resources |
| [`site/`](./site) | Documentation site |

## Security and contributing

- Report vulnerabilities privately as described in [`SECURITY.md`](./SECURITY.md); do not disclose them in public issues.
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for contribution guidance. Run at least `npm run lint` and `npm run build` before submitting changes.
- See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) and [`SUPPORT.md`](./SUPPORT.md) for community and support information.

## License

[MIT](./LICENSE)

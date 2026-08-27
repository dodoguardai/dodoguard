# DodoGuard — 单容器 + SQLite（与仓库 `npm run build` 对齐）
#
# 默认使用 AWS Public ECR 上的 Docker Official「node」镜像，请求发往 public.ecr.aws，不经过
# docker.io；可避免国内对 docker.io 配置的镜像加速返回 403/500（如 *.mirror.aliyuncs.com）。
# 需要改回 Docker Hub 时：
#   docker build --build-arg NODE_IMAGE=node:22.14.0-alpine -t dodoguard:1.0.0 .
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22.14.0-alpine
FROM ${NODE_IMAGE} AS base

RUN addgroup -S dodoguard && adduser -S dodoguard -G dodoguard

ARG PYTHON_VERSION=3.12
# 国内网络下 Alpine 官方源经常很慢；需要使用镜像内默认源时传：
#   docker build --build-arg ALPINE_REPOSITORY= -t dodoguard:1.0.0 .
ARG ALPINE_REPOSITORY=https://mirrors.aliyun.com/alpine/v3.21
RUN if [ -n "${ALPINE_REPOSITORY}" ]; then \
      printf '%s/main\n%s/community\n' "${ALPINE_REPOSITORY}" "${ALPINE_REPOSITORY}" > /etc/apk/repositories; \
    fi && \
    apk add --no-cache python3~=${PYTHON_VERSION} py3-pip py3-setuptools curl su-exec && \
    ln -sf python3 /usr/bin/python

FROM base AS builder

RUN apk add --no-cache gcompat python3 make g++

WORKDIR /app

ARG VITE_PUBLIC_BASENAME

# 构建阶段仅注入前端 Vite 变量。分享 API 等后端环境变量（如 DODOGUARD_REMOTE_API_BASE_URL 或兼容的 DODOGUARD_REMOTE_API_BASE_URL）在运行容器时通过 -e 传入即可。
ENV VITE_IS_HOSTED=1 \
    VITE_TELEMETRY_DISABLED=1 \
    VITE_PUBLIC_BASENAME=${VITE_PUBLIC_BASENAME} \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY site/package.json ./site/

# 默认使用国内 npm 镜像加速首次构建；需要官方源时传：
#   docker build --build-arg NPM_REGISTRY=https://registry.npmjs.org -t dodoguard:1.0.0 .
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN --mount=type=cache,target=/root/.npm \
    if [ -n "${NPM_REGISTRY}" ]; then npm config set registry "${NPM_REGISTRY}"; fi && \
    npm config set maxsockets 20 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm ci --install-links --include=peer --prefer-offline

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=8192
ENV DOCKER_BUILD=1

RUN npm run build

# 单容器 SQLite 依赖导出的 bootstrap（见 backend/src/migrate.ts）；缺失时勿用「仅 git 跟踪文件」的上下文构建
RUN test -f dist/drizzle/sqlite-bootstrap/0000_sqlite_baseline_export.sql && \
    test -f dist/drizzle/sqlite-bootstrap/meta/_journal.json

# 构建阶段跑迁移：校验 drizzle 与镜像内默认库；运行时若挂载空卷则由服务启动再次迁移
ENV DODOGUARD_CONFIG_DIR=/tmp/db-init \
    DB_TYPE=sqlite
RUN mkdir -p /tmp/db-init && \
    node dist/src/migrate.js && \
    test -f /tmp/db-init/dodoguard.db

RUN find dist/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.d.ts" -o -name "*.map" \) \
    ! -path "*/drizzle/*" -delete 2>/dev/null || true && \
    find dist/src -type d -empty -delete 2>/dev/null || true

FROM base AS server

ARG BUILD_GIT_SHA=unknown
ARG BUILD_GIT_BRANCH=unknown
ARG BUILD_TIME=unknown
ARG BUILD_DIRTY=unknown
ARG BUILD_IMAGE_TAG=unknown

LABEL org.opencontainers.image.revision="${BUILD_GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.version="${BUILD_IMAGE_TAG}"

WORKDIR /app

RUN printf '{\n  "gitSha": "%s",\n  "gitBranch": "%s",\n  "buildTime": "%s",\n  "dirty": "%s",\n  "imageTag": "%s"\n}\n' \
      "${BUILD_GIT_SHA}" \
      "${BUILD_GIT_BRANCH}" \
      "${BUILD_TIME}" \
      "${BUILD_DIRTY}" \
      "${BUILD_IMAGE_TAG}" \
      > /app/build-info.json && \
    chown dodoguard:dodoguard /app/build-info.json

# dist/src/*.js 在运行时会 require('../../package.json')（解析为 /app/package.json）
COPY --from=builder --chown=dodoguard:dodoguard /app/package.json ./package.json

COPY --from=builder --chown=dodoguard:dodoguard /app/node_modules ./node_modules
COPY --from=builder --chown=dodoguard:dodoguard /app/dist ./dist
COPY --from=builder --chown=dodoguard:dodoguard /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=dodoguard:dodoguard /app/capability-audit ./capability-audit
COPY --from=builder --chown=dodoguard:dodoguard /app/backend/src ./backend/src
COPY --from=builder --chown=dodoguard:dodoguard /app/plugins ./plugins
COPY --from=builder --chown=dodoguard:dodoguard /app/configs ./configs
# 报告 HTML/PDF 封面与品牌 logo（resolveImageDataUri → backend/assets/*）
COPY --from=builder --chown=dodoguard:dodoguard /app/backend/assets ./backend/assets

# Scan CLIs for Linux. These are required by the capability-audit engine status
# panel and quick/standard Skill/MCP scans.
#   docker build --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
#     -t zhian:1.0.0 .
ARG INSTALL_SCAN_CLIS=1
ARG PIP_INDEX_URL=
ARG PIP_TRUSTED_HOST=
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "${INSTALL_SCAN_CLIS}" = "1" ]; then \
      apk add --no-cache ca-certificates git build-base python3-dev libffi-dev openssl-dev yara-dev && \
      apk add --no-cache --repository=https://mirrors.aliyun.com/alpine/edge/main rust cargo && \
      if [ -n "${PIP_INDEX_URL}" ]; then pip3 config set global.index-url "${PIP_INDEX_URL}"; fi && \
      if [ -n "${PIP_TRUSTED_HOST}" ]; then pip3 config set global.trusted-host "${PIP_TRUSTED_HOST}"; fi && \
      rm -rf /app/capability-audit/tools/scan-venv && \
      python3 -m venv /app/capability-audit/tools/scan-venv && \
      /app/capability-audit/tools/scan-venv/bin/pip install --upgrade pip setuptools wheel && \
      /app/capability-audit/tools/scan-venv/bin/pip install --default-timeout=300 --retries=8 uv && \
      if [ -n "${PIP_INDEX_URL}" ]; then export UV_INDEX_URL="${PIP_INDEX_URL}"; fi && \
      printf 'litellm==1.91.3\n' > /tmp/scan-cli-constraints.txt && \
      /app/capability-audit/tools/scan-venv/bin/uv pip install --python /app/capability-audit/tools/scan-venv/bin/python \
        -c /tmp/scan-cli-constraints.txt \
        'git+https://github.com/NVIDIA/SkillSpector.git' && \
      /app/capability-audit/tools/scan-venv/bin/skillspector --version && \
      rm -rf /app/capability-audit/tools/cisco-venv && \
      python3 -m venv /app/capability-audit/tools/cisco-venv && \
      /app/capability-audit/tools/cisco-venv/bin/pip install --upgrade pip setuptools wheel && \
      /app/capability-audit/tools/cisco-venv/bin/pip install --default-timeout=300 --retries=8 uv && \
      /app/capability-audit/tools/cisco-venv/bin/uv pip install --python /app/capability-audit/tools/cisco-venv/bin/python \
        'cisco-ai-skill-scanner==1.0.2' && \
      /app/capability-audit/tools/cisco-venv/bin/skill-scanner --help >/dev/null && \
      rm -rf /app/capability-audit/tools/snyk-venv && \
      python3 -m venv /app/capability-audit/tools/snyk-venv && \
      /app/capability-audit/tools/snyk-venv/bin/pip install --upgrade pip setuptools wheel && \
      /app/capability-audit/tools/snyk-venv/bin/pip install --default-timeout=300 --retries=8 uv && \
      /app/capability-audit/tools/snyk-venv/bin/uv pip install --python /app/capability-audit/tools/snyk-venv/bin/python \
        'snyk-agent-scan==0.5.15' && \
      /app/capability-audit/tools/snyk-venv/bin/snyk-agent-scan help >/dev/null; \
    else \
      echo 'Skipping optional scan CLIs; use --build-arg INSTALL_SCAN_CLIS=1 to include them.'; \
    fi

# PDF：Playwright 下载的 Chromium 面向 glibc，在 Alpine(musl) 中无法运行；使用系统 Chromium + 可执行路径
RUN apk add --no-cache chromium ttf-freefont font-noto-cjk && test -x /usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# 在镜像构建阶段验证 Chromium 打印与纯 Node PDF 合并，避免部署后才发现封面合并不可用。
RUN node -e 'const { chromium } = require("playwright"); const { PDFDocument } = require("pdf-lib"); (async () => { const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] }); try { const page = await browser.newPage(); await page.setContent("<h1>pdf smoke check</h1>", { waitUntil: "domcontentloaded" }); const first = await page.pdf({ format: "A4" }); const second = await page.pdf({ format: "A4" }); const merged = await PDFDocument.create(); for (const bytes of [first, second]) { const source = await PDFDocument.load(bytes); const pages = await merged.copyPages(source, source.getPageIndices()); pages.forEach((item) => merged.addPage(item)); } if (merged.getPageCount() !== 2) throw new Error("PDF merge smoke check failed"); } finally { await browser.close(); } })().catch((error) => { console.error(error); process.exit(1); });'

COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /home/dodoguard/.dodoguard /app/reports /app/user-configs && \
    chown -R dodoguard:dodoguard /home/dodoguard/.dodoguard /app/reports /app/user-configs

COPY --from=builder --chown=dodoguard:dodoguard /tmp/db-init/dodoguard.db /home/dodoguard/.dodoguard/dodoguard.db

RUN test -f /home/dodoguard/.dodoguard/dodoguard.db && \
    test -f package.json && \
    test -f dist/src/server/index.js && \
    test -f frontend/dist/index.html && \
    test -d capability-audit && \
    test -d backend/src && \
    test -f backend/assets/bg.png && \
    test -d plugins && \
    test -d configs

RUN mkdir -p /app/node_modules/.bin && \
    ln -sf /app/dist/src/main.js /app/node_modules/.bin/dodoguard && \
    ln -sf /app/dist/src/main.js /app/node_modules/.bin/pf && \
    chmod +x /app/node_modules/.bin/dodoguard && \
    chown -R dodoguard:dodoguard /app/node_modules/.bin /app/plugins /app/configs

ENV API_PORT=3000
ENV HOST=0.0.0.0
ENV DB_TYPE=sqlite
ENV DODOGUARD_SELF_HOSTED=1
ENV DODOGUARD_BUILD_GIT_SHA=${BUILD_GIT_SHA}
ENV DODOGUARD_BUILD_GIT_BRANCH=${BUILD_GIT_BRANCH}
ENV DODOGUARD_BUILD_TIME=${BUILD_TIME}
ENV DODOGUARD_BUILD_DIRTY=${BUILD_DIRTY}
ENV DODOGUARD_BUILD_IMAGE_TAG=${BUILD_IMAGE_TAG}
ENV FRONTEND_DIST_DIR=/app/frontend/dist
ENV PATH="/app/node_modules/.bin:$PATH"
ENV DODOGUARD_CONFIG_DIR=/home/dodoguard/.dodoguard
ENV REPORTS_DIR=/app/reports
ENV USER_CONFIGS_DIR=/app/user-configs
ENV CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN=/app/capability-audit/tools/cisco-venv/bin/skill-scanner
ENV CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN=/app/capability-audit/tools/snyk-venv/bin/snyk-agent-scan

VOLUME ["/app/user-configs", "/app/reports", "/home/dodoguard/.dodoguard"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--require", "tsx/cjs", "dist/src/server/index.js"]

# 对外 API 联调演练（密钥管理 + 集成接口）

本文档用于**本地或测试环境**串行调用当前已实现的接口：先用 **JWT（浏览器登录同款）** 管理程序化密钥，再用 **`zhian.<uuid>.<secret>` 密钥** 调用 `/api/v1/external/*`。

> **安全**：不要把真实 `JWT`、`zhian.*` 密钥提交到 Git；下文示例中的令牌请视为占位符。

---

## 1. 前置条件

| 项 | 说明 |
|----|------|
| 服务地址 | 假设 API 根路径为 `http://localhost:3000/api/v1`（按你本地实际端口/反向代理修改）。 |
| 数据库迁移 | 已执行含 `external_api_keys`、`external_idempotency` 的迁移（如 `npm run db:migrate`）。 |
| 账号权限 | 管理密钥需 **`task:manage`**（与前端「开发者 API」页一致）。 |
| 工具 | `curl`；可选安装 `jq` 便于解析 JSON（macOS: `brew install jq`）。 |

统一约定：

```bash
# 按环境修改
export API_ROOT="http://localhost:3000/api/v1"
```

---

## 2. 获取 JWT（会话令牌）

```bash
curl -sS -X POST "$API_ROOT/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"你的邮箱","password":"你的密码"}'
```

从响应中取 **`data.token`**，导出为环境变量：

```bash
export JWT="eyJhbGciOiJIUzI1NiIs..."   # 粘贴 data.token
```

以下凡写 `Authorization: Bearer $JWT` 的路由均为**密钥管理接口**，**不能使用** `zhian.*` 密钥代替。

---

## 3. 第一阶段：程序化密钥管理（JWT）

Base path：`$API_ROOT/external-api-keys`

### 3.1 列出密钥元数据

```bash
curl -sS "$API_ROOT/external-api-keys" \
  -H "Authorization: Bearer $JWT"
```

### 3.2 创建密钥（明文仅返回这一次）

```bash
curl -sS -X POST "$API_ROOT/external-api-keys" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "smoke-test-key",
    "neverExpires": true
  }'
```

将响应里的 **`data.apiKey`**（形如 `zhian.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.<secret>`）保存：

```bash
export ZHIAN_KEY='zhian.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.your-secret-part'
```

### 3.3 轮换密钥（可选）

将 `{KEY_ROW_ID}` 换成列表接口返回的密钥 `id`（UUID）：

```bash
KEY_ROW_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

curl -sS -X POST "$API_ROOT/external-api-keys/$KEY_ROW_ID/rotate" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

响应中会返回**新的** `data.apiKey`；旧密钥随即作废。若继续做下文「集成接口」演练，请更新 `ZHIAN_KEY`。

### 3.4 吊销密钥（软失效：仍为列表中的一条「已吊销」记录）

```bash
curl -sS -X DELETE "$API_ROOT/external-api-keys/$KEY_ROW_ID" \
  -H "Authorization: Bearer $JWT"
```

### 3.5 从列表永久删除记录（仅允许已是 revoked）

用于清理界面列表；**必须先吊销**。

```bash
curl -sS -X DELETE "$API_ROOT/external-api-keys/$KEY_ROW_ID/permanent" \
  -H "Authorization: Bearer $JWT"
```

若密钥仍为 `active`，接口返回 **409**（需先吊销）。

---

## 4. 第二阶段：集成 API（`zhian.*` 密钥）

Base path：`$API_ROOT/external`

所有请求头：

```bash
-H "Authorization: Bearer $ZHIAN_KEY" \
-H "Content-Type: application/json"
```

默认密钥 scopes 包含：`tasks:read`、`tasks:write`、`agents:read`、`vulnerabilities:read`（**此前已签发的密钥**若无 `vulnerabilities:read`，拉漏洞接口会 403，需**轮换或新建**密钥）。

### 4.0 漏洞列表 / 详情（填 `POST /external/tasks` 里的 `vulnerabilities`）

与内部漏洞库同源（按 `search`、`type`、`riskLevel`、`category`、`status`、`verificationMode` 筛选；MySQL 下列表项含 `enabledAttackCommandCount` 便于选有可执行命令的漏洞）：

```bash
# 列表
curl -sS "$API_ROOT/external/vulnerabilities?limit=20&offset=0&type=dify&status=confirmed" \
  -H "Authorization: Bearer $ZHIAN_KEY"

# 单条（将 UUID 换成上一步返回的 id）
export VULN_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
curl -sS "$API_ROOT/external/vulnerabilities/$VULN_ID" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

创建任务时把 `vulnerabilities` 设为 UUID 字符串数组，例如：`"vulnerabilities": ["$VULN_ID"]`（与 Web 创建任务一致）。

### 4.1 列出 Agent（可选探测目标）

```bash
curl -sS "$API_ROOT/external/agents?limit=10&offset=0" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

若你希望创建的任务更接近真实场景，可把下面 JSON 里的 `targetConfig` 换成列表中某一 Agent 的配置结构（视你们前端创建任务时的字段而定）。

### 4.2 创建测试任务（建议先不自动跑：`start: false`）

最小合法请求体（与内部 `createTaskSchema` 对齐；空 `vulnerabilities`、空 `targetConfig` 仅用于**联调通路**，执行阶段可能无实际攻击目标）：

```bash
curl -sS -X POST "$API_ROOT/external/tasks" \
  -H "Authorization: Bearer $ZHIAN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "external-api-smoke-test",
    "description": "联调用最小任务",
    "targetType": "agent",
    "targetConfig": {},
    "vulnerabilities": [],
    "attackMode": "simple",
    "detectionConfig": {
      "useRule": false,
      "useLLM": false,
      "useKnowledgeBase": false
    },
    "start": false
  }'
```

从响应 **`data.id`**（或 MySQL 下返回的任务 id 字段）取出任务 ID：

```bash
export TASK_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
```

### 4.2a 创建任务并设置 `callbackUrl`（Webhook Demo）

1. 打开 [https://webhook.site](https://webhook.site)（或任意可公网访问的 HTTPS 调试地址），复制 **Your unique URL**。
2. 把下面 `CALLBACK_URL` 换成该地址；任务需**真正跑到终态**（`completed` / `failed` / `canceled`）才会 POST 回调。联调时可将 **`start` 设为 `true`**，并保证任务能执行结束（否则一直 `pending` 则不会回调）。

```bash
# 从 webhook.site 粘贴，须为完整 URL（https://...）
export CALLBACK_URL='https://webhook.site/your-unique-id-here'

curl -sS -X POST "$API_ROOT/external/tasks" \
  -H "Authorization: Bearer $ZHIAN_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg name "webhook-demo-task" \
    --arg url "$CALLBACK_URL" \
    '{
      name: $name,
      targetType: "agent",
      targetConfig: {},
      vulnerabilities: [],
      attackMode: "simple",
      detectionConfig: {
        useRule: false,
        useLLM: false,
        useKnowledgeBase: false
      },
      start: true,
      callbackUrl: $url
    }')"
```

**无 `jq` 时**可直接写死 JSON（注意转义）：

```bash
curl -sS -X POST "$API_ROOT/external/tasks" \
  -H "Authorization: Bearer $ZHIAN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "webhook-demo-task",
    "targetType": "agent",
    "targetConfig": {},
    "vulnerabilities": [],
    "attackMode": "simple",
    "detectionConfig": {
      "useRule": false,
      "useLLM": false,
      "useKnowledgeBase": false
    },
    "start": true,
    "callbackUrl": "https://webhook.site/00000000-0000-0000-0000-000000000000"
  }'
```

**成功创建后**请保存响应中的：

- **`data.webhookVerificationSecret`**：仅此一次返回，用于验证回调请求头 `X-Webhook-Signature`（对 `X-Webhook-Timestamp` + `"."` + **原始 body 字符串** 做 HMAC-SHA256，与 `sha256=<hex>` 比较）。
- **`data.id`**：任务 ID。

终态后 webhook.site 上应出现 **POST**，JSON 类似：

```json
{
  "event": "task.finished",
  "taskId": "...",
  "organizationId": "...",
  "status": "completed",
  "occurredAt": "2026-01-01T12:00:00.000Z"
}
```

### 4.3 幂等创建（可选）

同一 **`Idempotency-Key`** 在 TTL 内重复提交应返回**与首次相同的响应**（含 HTTP 状态码）：

```bash
curl -sS -X POST "$API_ROOT/external/tasks" \
  -H "Authorization: Bearer $ZHIAN_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "name": "idempotent-smoke-test",
    "targetType": "agent",
    "targetConfig": {},
    "vulnerabilities": [],
    "attackMode": "simple",
    "detectionConfig": {
      "useRule": false,
      "useLLM": false,
      "useKnowledgeBase": false
    },
    "start": false
  }'
```

第二次用**同一 body + 同一 Idempotency-Key** 再 POST，应命中幂等存储（若表未迁移，行为以服务端为准）。

### 4.4 任务列表

```bash
curl -sS "$API_ROOT/external/tasks?limit=20&offset=0&search=smoke&status=pending" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

`search`、`status` 可选。

### 4.5 任务详情

```bash
curl -sS "$API_ROOT/external/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

### 4.6 轻量状态

```bash
curl -sS "$API_ROOT/external/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

### 4.6b 任务检测结果（与 Web「任务结果」同源）

任务进入终态或已有中间结果后，可用与内部 `GET /api/v1/attack-tasks/:id/results` 相同的数据聚合拉取检测/命中摘要（具体字段随任务类型与 DB 类型略有差异）：

```bash
curl -sS "$API_ROOT/external/tasks/$TASK_ID/results" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

若任务不属于当前密钥所属组织或不存在，返回 **404**。

### 4.7 取消任务（仅 `running`）

当前实现：**只有状态为 `running` 的任务**可被 `DELETE` 取消；`pending` / 已完成等会返回 **409**。

```bash
curl -sS -X DELETE "$API_ROOT/external/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ZHIAN_KEY"
```

若要验证取消链路，可将创建 body 中 **`"start": true`**，在任务进入 `running` 后尽快调用上述 DELETE；若调度很快结束，可能已非 `running`，此时 409 属预期。

---

## 5. 推荐串行清单（自检勾选）

按顺序做一遍即可覆盖当前对外能力：

**密钥管理（JWT）**

- [ ] `POST /auth/login` → 保存 `JWT`
- [ ] `GET /external-api-keys`
- [ ] `POST /external-api-keys` → 保存 `ZHIAN_KEY`
- [ ] （可选）`POST /external-api-keys/:id/rotate`
- [ ] （可选）`DELETE /external-api-keys/:id` 吊销
- [ ] （可选）`DELETE /external-api-keys/:id/permanent` 清理 revoked 记录

**集成 API（`ZHIAN_KEY`）**

- [ ] `GET /external/vulnerabilities`（及可选 `GET /external/vulnerabilities/:id`）
- [ ] `GET /external/agents`
- [ ] `POST /external/tasks`（`vulnerabilities` 填真实 ID；`start: false` 或 `true`）→ 保存 `TASK_ID`
- [ ] （可选）带 `Idempotency-Key` 重复 `POST /external/tasks`
- [ ] `GET /external/tasks`
- [ ] `GET /external/tasks/:taskId`
- [ ] `GET /external/tasks/:taskId/status`
- [ ] `GET /external/tasks/:taskId/results`（任务跑完后核对结果）
- [ ] （可选）`DELETE /external/tasks/:taskId`（仅当 `running`）

---

## 6. 一键脚本示例（可选）

将下面保存为 `scripts/smoke-external-api.sh`，按需修改邮箱密码与 `API_ROOT`，并确保已安装 `jq`。

```bash
#!/usr/bin/env bash
set -euo pipefail
API_ROOT="${API_ROOT:-http://localhost:3000/api/v1}"
EMAIL="${SMOKE_EMAIL:?set SMOKE_EMAIL}"
PASSWORD="${SMOKE_PASSWORD:?set SMOKE_PASSWORD}"

JWT=$(curl -sS -X POST "$API_ROOT/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq -r '.data.token')

curl -sS "$API_ROOT/external-api-keys" -H "Authorization: Bearer $JWT" | jq .

KEY_JSON=$(curl -sS -X POST "$API_ROOT/external-api-keys" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-cli","neverExpires":true}')
echo "$KEY_JSON" | jq .

ZHIAN_KEY=$(echo "$KEY_JSON" | jq -r '.data.apiKey')
KEY_ID=$(echo "$KEY_JSON" | jq -r '.data.id')

curl -sS "$API_ROOT/external/vulnerabilities?limit=5" -H "Authorization: Bearer $ZHIAN_KEY" | jq .
curl -sS "$API_ROOT/external/agents?limit=5" -H "Authorization: Bearer $ZHIAN_KEY" | jq .

TASK_JSON=$(curl -sS -X POST "$API_ROOT/external/tasks" \
  -H "Authorization: Bearer $ZHIAN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"smoke-external-task",
    "targetType":"agent",
    "targetConfig":{},
    "vulnerabilities":[],
    "attackMode":"simple",
    "detectionConfig":{"useRule":false,"useLLM":false,"useKnowledgeBase":false},
    "start":false
  }')
echo "$TASK_JSON" | jq .
TASK_ID=$(echo "$TASK_JSON" | jq -r '.data.id')

curl -sS "$API_ROOT/external/tasks/$TASK_ID" -H "Authorization: Bearer $ZHIAN_KEY" | jq .
curl -sS "$API_ROOT/external/tasks/$TASK_ID/status" -H "Authorization: Bearer $ZHIAN_KEY" | jq .
curl -sS "$API_ROOT/external/tasks/$TASK_ID/results" -H "Authorization: Bearer $ZHIAN_KEY" | jq .

echo "--- revoke test key ($KEY_ID) ---"
curl -sS -X DELETE "$API_ROOT/external-api-keys/$KEY_ID" -H "Authorization: Bearer $JWT" | jq .
curl -sS -X DELETE "$API_ROOT/external-api-keys/$KEY_ID/permanent" -H "Authorization: Bearer $JWT" | jq .

echo "OK"
```

运行：

```bash
chmod +x scripts/smoke-external-api.sh
SMOKE_EMAIL='you@example.com' SMOKE_PASSWORD='secret' ./scripts/smoke-external-api.sh
```

---

## 7. 相关代码位置（排错）

| 能力 | 文件 |
|------|------|
| 集成路由 | `backend/src/server/routes/api/v1/external/integration.ts` |
| 密钥鉴权 | `backend/src/server/routes/api/v1/external/middleware.ts` |
| 密钥管理路由 | `backend/src/server/routes/api/v1/external-api-keys-mgmt.ts` |
| 创建任务校验 | `backend/src/server/routes/api/v1/attack-tasks.ts` 中 `createTaskSchema` |

接口设计背景说明仍见：`docs/development/external-task-api-spec.md`。

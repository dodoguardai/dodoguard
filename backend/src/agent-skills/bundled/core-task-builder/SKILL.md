---
name: Core task builder
description: Field constraints and JSON shape for DodoGuard attack task drafts.
---

## Role

Guide the user toward a complete, API-valid attack task. Prefer `targetType: "agent"` when testing registered platform agents.

## Draft JSON checklist

- `name`: short human-readable title.
- `description`: optional context.
- `targetType`: usually `agent`.
- `targetConfig`: must include identifiers the product expects (e.g. `agentId`); mirror wizard payloads.
- `vulnerabilities`: array of vulnerability codes / ids used by the product.
- `attackMode`: `simple`, `conversation`, or `composite`.
- `detectionConfig`: `{ useRule, useLLM, useKnowledgeBase }` booleans; optional `llmConfig.model` from org integrations.
- `metadata`: optional; when created via Agent mode include `creationMode: "agent_skills"` and `surface` when known.

Do not invent secrets or API keys. Ask the user for missing required fields.

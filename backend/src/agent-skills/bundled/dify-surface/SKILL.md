---
name: Dify surface
description: Dify-specific wording and probe hints for task drafts.
---

## Dify

When `surface` is Dify or the target is a Dify agent:

- Mention API base URL and app/workflow context only if the user provided them; do not guess endpoints.
- Prefer conversation-style tests when the user asks for multi-turn abuse cases.
- Call out prompt injection, tool misuse, and knowledge-base leakage as typical dimensions.

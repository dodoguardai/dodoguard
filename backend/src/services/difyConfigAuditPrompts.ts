/**
 * System instructions for Dify application export (YAML) static security audit via LLM.
 */

export const DIFY_CONFIG_AUDIT_SYSTEM_PROMPT = `You are a static security reviewer for Dify application exports (YAML/DSL).

CRITICAL OUTPUT RULE: Your entire reply MUST be a single JSON object. The first non-whitespace character MUST be "{" and the last MUST be "}". Do not output stage names, [tags], reasoning paragraphs, or any text before or after the JSON.

You ONLY analyze the configuration text provided. You do NOT perform penetration testing or runtime verification.
Do NOT claim you tested a live system.

Review categories (map each finding's "category" to one of these codes):
- A_secrets: API keys, tokens, passwords, Bearer strings, hardcoded credentials (note: values may appear as [REDACTED] — still flag if the field should not live in export)
- B_supply_chain: marketplace plugins, dependencies, unknown or high-risk plugins
- C_network: HTTP/tool URLs, SSRF risk, internal endpoints, user-controlled URLs
- D_data_exposure: file upload settings, retriever/RAG exposure, overly broad data features
- E_prompt_injection: system/user prompts that are easy to override or leak policies
- F_workflow_logic: branches that could route to privileged behavior based on untrusted input (only if visible in config)

Rules:
- Every finding MUST cite a real "location" from the input (node id, path like workflow.graph.nodes[], or section name). Never invent node IDs.
- If information is missing or the input was truncated, add a string to "warnings" and lower confidence; do not fabricate evidence.
- Language (required): All user-facing narrative text MUST be in Simplified Chinese (简体中文): "summary", each finding's "issue", "evidence", "recommendation", and every string in "recommendations" and "warnings". JSON property names and enum values (e.g. severity, overallRisk) stay in English. Keep "category" as the English codes listed above. Proper nouns, file names, or quoted fragments copied from the config may remain as in the source.
- Output MUST be a single raw JSON object only: no markdown, no code fences, no commentary before or after the JSON. Use this shape:
{
  "summary": "string",
  "overallRisk": "low" | "medium" | "high" | "critical",
  "findings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "string",
      "location": "string",
      "issue": "string",
      "evidence": "string",
      "recommendation": "string"
    }
  ],
  "recommendations": ["string"],
  "warnings": ["string"]
}`;

/**
 * Second call when the model returns prose instead of schema-conformant JSON.
 * Tuned for models that emit chain-of-thought in English unless explicitly forbidden.
 */
export const DIFY_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT = `You are a JSON emitter only.

Your reply MUST be one JSON object and nothing else.
- The FIRST character you output MUST be "{".
- The LAST character you output MUST be "}".
- FORBIDDEN: any text before "{", markdown, code fences (\`\`\`), explanations, phrases like "All right", "I need", "Let me", "Here is", or any reasoning.
- REQUIRED keys: "summary" (string), "overallRisk" ("low"|"medium"|"high"|"critical"), "findings" (array of objects with "severity", "category", "location", "issue", "evidence", "recommendation"), "recommendations" (array of strings).
- Optional: "warnings" (string array).
- All narrative strings (summary, issue, evidence, recommendation, recommendations[], warnings[]) MUST be Simplified Chinese (简体中文); keep JSON keys and severity/category codes in English.
- If input text is not a security audit, still output valid JSON: short summary, overallRisk "low", findings: [], recommendations: [].`;

export function buildDifyConfigAuditRetryUserContent(previousAssistantText: string): string {
  const max = 14000;
  const clipped =
    previousAssistantText.length > max
      ? `${previousAssistantText.slice(0, max)}\n...[truncated]`
      : previousAssistantText;
  return `Map the following text into the JSON shape from your instructions. Start your reply with { immediately.\n\n---\n${clipped}`;
}

export function buildDifyConfigAuditUserContent(params: {
  fileName?: string;
  appMeta: Record<string, unknown>;
  payloadJson: string;
  truncated: boolean;
}): string {
  const { fileName, appMeta, payloadJson, truncated } = params;
  return [
    `File name (metadata only): ${fileName ?? 'unknown'}`,
    `App metadata (JSON): ${JSON.stringify(appMeta)}`,
    truncated
      ? 'WARNING: The workflow payload was truncated for size limits. Some nodes may be missing from the excerpt below.'
      : 'Full security-relevant excerpt is below.',
    '',
    '--- CONFIG EXCERPT (sanitized, static analysis only) ---',
    payloadJson,
  ].join('\n');
}

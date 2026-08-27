/**
 * Dify 的 `DIFY_API_BASE_URL` / `--base-url` 应为「API 根地址」，脚本会再拼 `/v1/chat-messages` 等路径。
 * 若误写成 `.../v1/chat-messages` 或 `.../v1/workflows/run`，会导致重复路径并返回 HTML 404。
 */
export function normalizeDifyApiBaseUrl(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  u = u.replace(/\/v1\/chat-messages\/?$/i, '');
  u = u.replace(/\/v1\/workflows\/run\/?$/i, '');
  u = u.replace(/\/v1\/?$/i, '');
  return u.replace(/\/+$/, '');
}

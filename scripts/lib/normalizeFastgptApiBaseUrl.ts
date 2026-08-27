/**
 * FastGPT 的 `FASTGPT_API_BASE_URL` 应为「API 根地址」，
 * 脚本会再拼 `/api/v1/chat/completions`。
 *
 * 若误写成 `.../api/v1/chat/completions`，则会变成双路径导致 404。
 */
export function normalizeFastgptApiBaseUrl(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  u = u.replace(/\/api\/v1\/chat\/completions\/?$/i, '');
  return u.replace(/\/+$/, '');
}


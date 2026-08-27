/**
 * Express 5 typings use `string | string[]` for path params. Colon routes yield a single string at runtime.
 */
export function routeParam(value: string | string[] | undefined): string {
  if (value === undefined) {
    return '';
  }
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

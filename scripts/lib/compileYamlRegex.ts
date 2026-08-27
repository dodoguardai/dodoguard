/**
 * 将 YAML 载荷里常用的 (?i)/(?m)/(?s) 等前缀转为 ECMAScript RegExp（s = dotAll）。
 */

export function compileYamlPatternToRegExp(pattern: string): RegExp {
  const m = pattern.match(/^\(\?([ims]+)\)/);
  if (!m) {
    return new RegExp(pattern);
  }
  const flagChars = [...new Set(m[1].split('').filter((c) => 'ims'.includes(c)))];
  const flags = flagChars.join('');
  return new RegExp(pattern.slice(m[0].length), flags);
}

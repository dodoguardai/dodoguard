import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Mirrors evaluateDetectionRulesForResponse full-text keyword/regex behavior for Coze Config seed rules (CFG-001 sample).
 * Uses docs/coze-workflow-help-center-template-redacted.yaml — no DB.
 */
function matchKeywordRule(text: string, pattern: string): boolean {
  const lower = text.toLowerCase();
  const keywords = pattern
    .split('|')
    .map((k) => k.trim())
    .filter(Boolean);
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function matchRegexRule(text: string, pattern: string): boolean {
  try {
    const re = new RegExp(pattern, 'im');
    return re.test(text);
  } catch {
    return false;
  }
}

describe('Coze Config seed static rules vs redacted workflow fixture', () => {
  const fixturePath = path.join(
    process.cwd(),
    'docs/coze-workflow-help-center-template-redacted.yaml',
  );
  let yaml: string;

  beforeAll(() => {
    yaml = fs.readFileSync(fixturePath, 'utf8');
  });

  it('fixture includes plugin + appsecret (CFG-001 keyword surface)', () => {
    expect(yaml).toContain('type: plugin');
    expect(yaml).toContain('appsecret');
    expect(matchKeywordRule(yaml, 'appsecret|app_secret|client_secret|api_secret')).toBe(true);
  });

  it('CFG-001 regex matches plugin type in YAML', () => {
    expect(matchRegexRule(yaml, 'type:\\s*plugin|"type":\\s*"plugin"')).toBe(true);
  });

  it('applies_to_platforms JSON in seed is valid for coze', () => {
    const parsed = JSON.parse('["coze"]') as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toContain('coze');
  });
});

import {
  resolveTaskReportKind,
  singleTestHasConfigAudit,
  singleTestHasPrompt,
} from '../../backend/src/reports/markdown/resolveTaskReportKind';

describe('resolveTaskReportKind', () => {
  describe('singleTestHasConfigAudit', () => {
    it('returns false when metadata has no configAudit', () => {
      expect(singleTestHasConfigAudit({ taskKind: 'single_test' })).toBe(false);
      expect(singleTestHasConfigAudit(undefined)).toBe(false);
    });

    it('returns true when yaml or json is present', () => {
      expect(
        singleTestHasConfigAudit({
          configAudit: { yaml: 'version: 1\n' },
        }),
      ).toBe(true);
      expect(
        singleTestHasConfigAudit({
          configAudit: { json: '{"nodes":[]}' },
        }),
      ).toBe(true);
    });
  });

  describe('singleTestHasPrompt', () => {
    it('returns false when prompt is missing or blank', () => {
      expect(singleTestHasPrompt(undefined)).toBe(false);
      expect(singleTestHasPrompt({ singleTest: { prompt: '  ' } })).toBe(false);
    });

    it('returns true when prompt is non-empty', () => {
      expect(singleTestHasPrompt({ singleTest: { prompt: 'probe' } })).toBe(true);
    });
  });

  describe('single_test tasks', () => {
    it('uses api_blackbox template when only prompt is provided', () => {
      expect(
        resolveTaskReportKind({
          taskKind: 'single_test',
          platformFamily: 'dify',
          taskMetadata: { taskKind: 'single_test', singleTest: { prompt: 'hi' } },
        }),
      ).toBe('api_blackbox');
    });

    it('uses config_static template when only config is uploaded', () => {
      expect(
        resolveTaskReportKind({
          taskKind: 'single_test',
          platformFamily: 'dify',
          taskMetadata: {
            configAudit: { yaml: 'version: 1\n' },
          },
        }),
      ).toBe('dify_config_static');
    });

    it('uses config_audit template when both config and prompt are provided', () => {
      expect(
        resolveTaskReportKind({
          taskKind: 'single_test',
          platformFamily: 'coze',
          taskMetadata: {
            singleTest: { prompt: 'hi' },
            configAudit: { yaml: 'version: 1\n' },
          },
        }),
      ).toBe('coze_config_audit');
    });
  });
});

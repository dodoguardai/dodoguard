import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../../backend/src/dify-pentest/run', () => ({
  doDifyPentestRun: jest.fn(async () => ({
    results: [{ success: true }, { success: false }],
  })),
}));

import {
  getDefaultScanTemplate,
  resolveRunnerConfigPath,
} from '../../../backend/src/commands/scan/buildRunnerConfig';
import { executeScanRun } from '../../../backend/src/commands/scan/executeScanRun';
import {
  isDifyPentestConfig,
  loadScanTaskConfig,
  validateScanTaskConfig,
} from '../../../backend/src/commands/scan/loadScanConfig';
import {
  createScanRun,
  deleteScanRun,
  getScanRun,
  listScanRuns,
} from '../../../backend/src/commands/scan/localScanStore';
import { doDifyPentestRun } from '../../../backend/src/dify-pentest/run';
import { scanTaskSchema } from '../../../backend/src/schemas/attackTaskSchema';

describe('scan CLI', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dodoguard-scan-test-'));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getDefaultScanTemplate produces valid scan task yaml fields conceptually', () => {
    const template = getDefaultScanTemplate();
    expect(template).toContain('name:');
    expect(template).toContain('targetConfig:');
    expect(template).toContain('vulnerabilities:');
  });

  it('scanTaskSchema validates minimal task', () => {
    const parsed = scanTaskSchema.safeParse({
      name: 'Test',
      targetType: 'platform',
      targetConfig: { apiKey: 'test-key' },
      vulnerabilities: ['agent-prompt-injection'],
      attackMode: 'simple',
      detectionConfig: { useRule: true, useLLM: false, useKnowledgeBase: false },
    });
    expect(parsed.success).toBe(true);
  });

  it('isDifyPentestConfig detects dify yaml', () => {
    expect(isDifyPentestConfig({ dify: {}, modules: [] })).toBe(true);
    expect(isDifyPentestConfig({ target: {}, task: {} })).toBe(true);
    expect(isDifyPentestConfig({ name: 'x' })).toBe(false);
  });

  it('loadScanTaskConfig loads valid task file', () => {
    const configPath = path.join(tmpDir, 'task.yaml');
    fs.writeFileSync(
      configPath,
      `
name: Unit Test Scan
targetType: platform
platformFamily: dify
targetConfig:
  apiKey: test-key
  apiBaseUrl: https://api.dify.ai
vulnerabilities:
  - agent-prompt-injection
attackMode: simple
detectionConfig:
  useRule: true
  useLLM: false
  useKnowledgeBase: false
`,
      'utf8',
    );

    const { task } = loadScanTaskConfig(configPath);
    expect(task.name).toBe('Unit Test Scan');
    expect(task.vulnerabilities).toContain('agent-prompt-injection');
  });

  it('validateScanTaskConfig rejects invalid task', async () => {
    const configPath = path.join(tmpDir, 'bad.yaml');
    fs.writeFileSync(configPath, 'name: ""\n', 'utf8');
    const result = await validateScanTaskConfig(configPath);
    expect(result.valid).toBe(false);
  });

  it('resolveRunnerConfigPath builds temp dify config from inline target', () => {
    const task = scanTaskSchema.parse({
      name: 'Inline',
      targetType: 'platform',
      platformFamily: 'dify',
      targetConfig: { apiKey: 'sk-test', apiBaseUrl: 'https://api.dify.ai' },
      vulnerabilities: ['agent-prompt-injection'],
      attackMode: 'simple',
      detectionConfig: { useRule: true, useLLM: false, useKnowledgeBase: false },
    });
    const resolved = resolveRunnerConfigPath(task, tmpDir);
    expect(fs.existsSync(resolved.configPath)).toBe(true);
    expect(resolved.isTemporary).toBe(true);
    fs.unlinkSync(resolved.configPath);
  });

  it('localScanStore creates and lists runs', () => {
    const task = scanTaskSchema.parse({
      name: 'Store Test',
      targetType: 'platform',
      targetConfig: {},
      vulnerabilities: ['agent-prompt-injection'],
      attackMode: 'simple',
      detectionConfig: { useRule: true, useLLM: false, useKnowledgeBase: false },
    });

    const cwd = path.join(tmpDir, 'store-run');
    fs.mkdirSync(cwd, { recursive: true });
    const manifest = createScanRun(task, { cwd });
    expect(manifest.id).toBeTruthy();

    const listed = listScanRuns(cwd);
    expect(listed.some((r) => r.id === manifest.id)).toBe(true);

    const fetched = getScanRun(manifest.id, cwd);
    expect(fetched.name).toBe('Store Test');

    expect(deleteScanRun(manifest.id, cwd)).toBe(true);
    expect(listScanRuns(cwd).some((r) => r.id === manifest.id)).toBe(false);
  });

  it('executeScanRun loads runner config and passes live config to dify runner', async () => {
    const configPath = path.join(tmpDir, 'execute-task.yaml');
    const cwd = path.join(tmpDir, 'execute-run');
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(
      configPath,
      `
name: Execute Scan
targetType: platform
platformFamily: dify
targetConfig:
  apiKey: sk-test
  apiBaseUrl: https://api.dify.ai
vulnerabilities:
  - agent-prompt-injection
attackMode: simple
detectionConfig:
  useRule: true
  useLLM: false
  useKnowledgeBase: false
output:
  path: ./out.json
`,
      'utf8',
    );

    const result = await executeScanRun({
      configPath,
      cwd,
      noProgressBar: true,
    });

    expect(result.success).toBe(true);
    expect(result.manifest.status).toBe('completed');
    expect(doDifyPentestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        liveDifyPentestConfig: expect.objectContaining({
          dify: expect.objectContaining({ apiKey: 'sk-test' }),
          modules: expect.arrayContaining([
            expect.objectContaining({ id: 'agent-prompt-injection' }),
          ]),
        }),
      }),
    );
  });
});

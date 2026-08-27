import type { TestCase } from '../../types/index';

export function addMischievousUser(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any>,
): TestCase[] {
  return testCases.map((testCase) => ({
    ...testCase,
    provider: {
      id: 'dodoguard:redteam:mischievous-user',
      config: {
        injectVar,
        ...config,
      },
    },
    assert: testCase.assert?.map((assertion) => ({
      ...assertion,
      metric: `${assertion.metric}/MischievousUser`,
    })),
    metadata: {
      ...testCase.metadata,
      strategyId: 'mischievous-user',
    },
  }));
}

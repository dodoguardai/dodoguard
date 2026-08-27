import { detectionScanningApi } from '@/services/api/detection-scanning'
import type { SecurityCaseLibrary, SecurityTestCase } from '@/types/entities'
import { readLibraryMeta } from './shared'

export async function copyComplianceTemplateLibrary(
  templateLibrary: SecurityCaseLibrary,
  testCases: SecurityTestCase[],
  targetDomain = '通用合规',
): Promise<SecurityCaseLibrary> {
  const meta = readLibraryMeta(templateLibrary.metadata)
  const copyKey = `${templateLibrary.libraryKey}-copy-${Date.now()}`
  const created = await detectionScanningApi.createCaseLibrary({
    libraryKey: copyKey,
    title: `${templateLibrary.title}（企业副本）`,
    domain: targetDomain,
    description: templateLibrary.description,
    detectMethod: templateLibrary.detectMethod,
    defaultLevel: templateLibrary.defaultLevel,
    status: 'draft',
    enabled: false,
    standards: templateLibrary.standards || [],
    metadata: {
      libraryCategory: 'compliance',
      ...meta,
      copiedFrom: templateLibrary.libraryKey,
    },
  })

  for (const [index, testCase] of testCases.entries()) {
    await detectionScanningApi.createTestCase(created.id, {
      caseCode: `${testCase.caseCode}-CP`,
      name: testCase.name,
      attackType: testCase.attackType,
      prompt: testCase.prompt,
      expectedPass: testCase.expectedPass || undefined,
      expectedFail: testCase.expectedFail || undefined,
      riskLevel: testCase.riskLevel,
      status: 'draft',
      tags: testCase.tags || [],
      sortOrder: index,
      metadata: testCase.metadata,
    })
  }

  return created
}

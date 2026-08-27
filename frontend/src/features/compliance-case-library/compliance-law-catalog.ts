import type { ComplianceRegulationMapping } from '@/types/entities'

export const COMPLIANCE_LAW_CATALOG = [
  { law: '《中华人民共和国个人信息保护法》', catalogCount: 8 },
  { law: '《证券期货投资者适当性管理办法》', catalogCount: 4 },
  { law: '《公开募集证券投资基金销售机构监督管理办法》', catalogCount: 3 },
  { law: '《中华人民共和国政府信息公开条例》', catalogCount: 2 },
  { law: '《政务数据共享条例》', catalogCount: 2 },
  { law: '《中华人民共和国数据安全法》', catalogCount: 3 },
  { law: '《数据出境安全评估办法》', catalogCount: 2 },
  { law: 'GB/T 22239-2019 网络安全等级保护基本要求', catalogCount: 3 },
] as const

/** 用例表单「法规依据」下拉选项（对齐原型 cmpSampleModal） */
export const COMPLIANCE_REGULATION_LAWS = [
  '《中华人民共和国个人信息保护法》',
  '《中华人民共和国数据安全法》',
  '《中华人民共和国网络安全法》',
  'GB/T 22239-2019 网络安全等级保护基本要求',
  '《证券期货投资者适当性管理办法》',
  '《公开募集证券投资基金销售机构监督管理办法》',
  '《商业银行理财业务监督管理办法》',
  '《中华人民共和国政府信息公开条例》',
  '《政务数据共享条例》',
  '《互联网信息服务算法推荐管理规定》',
  '《数据出境安全评估办法》',
] as const

export const COMPLIANCE_BASIS_PRESETS = [
  '《中华人民共和国个人信息保护法》第六条 · 最小必要原则',
  '《中华人民共和国个人信息保护法》第十三条、第十四条',
  '《中华人民共和国个人信息保护法》第二十八条、第五十一条',
  '《中华人民共和国数据安全法》',
  '《数据出境安全评估办法》',
  '《证券期货投资者适当性管理办法》第二十二条、第二十三条',
  '《公开募集证券投资基金销售机构监督管理办法》第二十六条',
  '《中华人民共和国政府信息公开条例》· 《政务数据共享条例》',
  'GB/T 22239-2019 · 《网络安全法》第二十一条',
  'GB/T 22239-2019 网络安全等级保护基本要求',
] as const

export function buildRegClauseOptions(
  mappings: Array<{ law: string; article?: string | null; sourceText?: string | null }>,
  existingClause?: string,
): string[] {
  const options = new Set<string>([
    ...COMPLIANCE_REGULATION_LAWS,
    ...COMPLIANCE_BASIS_PRESETS,
    ...COMPLIANCE_LAW_CATALOG.map((entry) => entry.law),
  ])
  for (const mapping of mappings) {
    if (mapping.sourceText?.trim()) {
      options.add(mapping.sourceText.trim())
    } else if (mapping.law && mapping.article) {
      options.add(`${mapping.law} ${mapping.article}`.trim())
    } else if (mapping.law) {
      options.add(mapping.law)
    }
  }
  if (existingClause?.trim()) options.add(existingClause.trim())
  return Array.from(options)
}

export function buildLawCatalogStats(mappings: ComplianceRegulationMapping[]) {
  return COMPLIANCE_LAW_CATALOG.map((entry) => {
    const maps = mappings.filter((m) => m.law === entry.law || m.law.includes(entry.law.slice(1, 8)))
    const mappedArticles = new Set(maps.map((m) => m.article))
    return {
      law: entry.law,
      catalogCount: entry.catalogCount,
      mappedCount: maps.length,
      mappedArticleCount: mappedArticles.size,
    }
  }).filter(
    (entry, index, arr) => arr.findIndex((x) => x.law === entry.law) === index,
  )
}

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ComplianceJudgeTab } from './compliance-judge-tab'
import { ComplianceLibrariesTab } from './compliance-libraries-tab'
import { ComplianceMappingsTab } from './compliance-mappings-tab'
import { PageHead, Shell } from './shared'

const TAB_VALUES = ['libraries', 'mappings', 'judge'] as const

type ComplianceHubProps = {
  initialTab?: string
  initialDomain?: string
  initialLaw?: string
}

export function ComplianceCaseLibraryPage({
  initialTab,
  initialDomain = 'all',
  initialLaw,
}: ComplianceHubProps) {
  const resolvedTab = TAB_VALUES.includes(initialTab as (typeof TAB_VALUES)[number])
    ? (initialTab as (typeof TAB_VALUES)[number])
    : 'libraries'
  const [tab, setTab] = useState(resolvedTab)

  useEffect(() => {
    if (initialTab && TAB_VALUES.includes(initialTab as (typeof TAB_VALUES)[number])) {
      setTab(initialTab as (typeof TAB_VALUES)[number])
    }
  }, [initialTab])

  return (
    <Shell>
      <PageHead
        title="合规检测用例库"
        desc="合规控制与法规映射 · 内置 Agent 判定 · 供合规评估任务选用 · 产出合规违规项 (Violations)"
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList>
          <TabsTrigger value="libraries">合规控制库</TabsTrigger>
          <TabsTrigger value="mappings">法规条款映射</TabsTrigger>
          <TabsTrigger value="judge">内置 Agent 说明</TabsTrigger>
        </TabsList>
        <TabsContent value="libraries" className="mt-6">
          <ComplianceLibrariesTab initialDomain={initialDomain} />
        </TabsContent>
        <TabsContent value="mappings" className="mt-6">
          <ComplianceMappingsTab initialLaw={initialLaw} />
        </TabsContent>
        <TabsContent value="judge" className="mt-6">
          <ComplianceJudgeTab />
        </TabsContent>
      </Tabs>
    </Shell>
  )
}

export { ComplianceLibraryDetailPage } from './compliance-library-detail-page'

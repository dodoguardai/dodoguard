import { Bot, CheckCircle2, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MetricCard } from './shared'

const FLOW_STEPS = [
  { title: '执行用例', desc: '按类型调 Agent API' },
  { title: '采集输出', desc: '对话 / 多轮 / 文件' },
  { title: '内置 Agent', desc: '对照 expectedPass/Fail + 条款' },
  { title: '输出结论', desc: '合规 / 违规' },
  { title: '违规项与报告', desc: 'Violations + 法规引用' },
]

export function ComplianceJudgeTab() {
  return (
    <div className="grid gap-6">
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={Bot} label="判定方式" value="内置 Agent" hint="无需用户配置 Prompt" />
        <MetricCard icon={Scale} label="今日评估" value="126" hint="合规任务（演示）" />
        <MetricCard icon={CheckCircle2} label="自动结论率" value="100%" hint="内置 Agent 自动判定" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>内置 Agent</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            平台内置 Agent Skill / 大模型判定 · 依据<strong>合规控制项</strong>
            中的用例类型、预期合规/违规行为、法规条款与 Agent 实际输出自动给出结论 ·
            <strong>业务用户无需配置 Agent Prompt 或判定方式开关</strong>
          </p>
          <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <p className="text-sm font-medium">判定输入（来自控制项，非用户手填）</p>
            <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
              <li>用例类型：单轮 / 多轮 / 用户输入文件 / 智能体输出文件</li>
              <li>User Prompt 与 Agent 实际输出（或文件解析结果）</li>
              <li>预期合规行为 · 预期违规行为</li>
              <li>法规条款映射（regClause）</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-medium">判定流水线</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW_STEPS.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground">{index + 1}.</span>{' '}
                  <span className="font-medium">{step.title}</span>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { OwnerType } from '@/services/api/agent-governance'
import {
  assetIntakeApi,
  type AssetAgentPayload,
  type AssetGovernanceStage,
  type AssetRuntimeProbeResult,
} from '@/services/api/asset-intake'
import { detectionScanningApi } from '@/services/api/detection-scanning'
import type {
  AgentAsset,
  AgentAssetComponent,
  AgentAssetComponentType,
  CapabilityComponentKind,
  CapabilityComponentRegistry,
  TargetAgent,
} from '@/types/entities'
import {
  Archive,
  ArrowLeft,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Filter,
  GitPullRequestArrow,
  Layers,
  LineChart,
  Pencil,
  Plus,
  Radar,
  Repeat2,
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { SHOW_HEADER_UTILITY_ACTIONS } from '@/components/layout/header-utility-actions'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AgentOwnershipFields } from '@/features/agent-governance/agent-ownership-fields'
import { OWNER_TYPE_OPTIONS } from '@/features/agent-governance/use-agent-governance-options'
import { AssetInboxPanel } from '@/features/asset-intake/asset-inbox-panel'
import {
  AssetLedgerAgentCard,
  AssetLedgerRowActions,
} from '@/features/asset-intake/asset-ledger-agent-card'
import './asset-ledger.css'
import { AssetLedgerDrawer } from '@/features/asset-intake/asset-ledger-drawer'
import {
  AssetProfilePanel,
  type ProfileConfigSection,
} from '@/features/asset-intake/asset-profile-panel'
import { DialogueSecurityWizardDialog } from '@/features/detection-scanning/dialogue-security-wizard-dialog'
import { labelFromOptions } from '@/features/launch-monitoring/periodic-plan-config'
import { GovernanceFlowStrip } from '@/features/shared/governance-flow-strip'

const platformOptions = [
  'Dify',
  'Coze',
  'FastGPT',
  'N8N',
  'Tencent ADP',
  '自研平台',
  '其他',
]
const runtimeAgentTypeOptions = [
  ['dify', 'Dify API'],
  ['coze', 'Coze API'],
  ['n8n', 'N8N Webhook'],
  ['fastgpt', 'FastGPT API'],
  ['tencent-adp', '腾讯 ADP'],
  ['api', '通用 HTTP API'],
  ['api-stream', '通用流式 API'],
  ['langchain', 'LangChain'],
  ['custom', '自定义'],
  ['other', '其他'],
] as const
const formSectionClass =
  'grid gap-3 rounded-lg border bg-background p-4 shadow-sm'
const formGridClass = 'grid gap-x-3 gap-y-3 md:grid-cols-12'
const compactPanelClass =
  'grid gap-x-3 gap-y-3 rounded-md border bg-muted/10 p-3 md:grid-cols-12'
const agentTypeOptions = [
  ['qa', '问答型'],
  ['task', '任务型'],
  ['tool', '工具型'],
  ['workflow', '流程型'],
  ['multi_agent', '多智能体型'],
] as const
const environmentOptions = [
  ['dev', '开发'],
  ['test', '测试'],
  ['staging', '预生产'],
  ['prod', '生产'],
] as const
const runtimeOptions = [
  ['not_launched', '未上线'],
  ['running', '运行中'],
  ['offline', '已下线'],
] as const
const admissionOptions = [
  ['not_checked', '未检测'],
  ['failed', '需整改'],
  ['passed', '通过'],
] as const

const admissionLegacyLabels: Record<string, string> = {
  checking: '检测中',
  retest: '复测中',
  conditional_passed: '条件通过',
}
const riskOptions = [
  ['normal', '正常'],
  ['low', '低危'],
  ['medium', '中危'],
  ['high', '高危'],
  ['critical', '严重'],
] as const
const exposureOptions = [
  ['internal', '内部'],
  ['external_customer', '外部客户'],
  ['public', '公网'],
] as const
const componentTypeOptions: Array<[AgentAssetComponentType, string]> = [
  ['tool', 'Tool/API'],
  ['skill', 'Skill'],
  ['mcp', 'MCP'],
  ['model', '大模型'],
  ['knowledge_base', '知识库'],
]
const capabilityMountKinds: Array<{
  kind: CapabilityComponentKind
  componentType: AgentAssetComponentType
  label: string
}> = [
  { kind: 'tool', componentType: 'tool', label: '工具' },
  { kind: 'skill', componentType: 'skill', label: 'Skills' },
  { kind: 'mcp', componentType: 'mcp', label: 'MCP' },
  { kind: 'model', componentType: 'model', label: '大模型' },
  { kind: 'knowledge', componentType: 'knowledge_base', label: '知识库' },
]
const componentRiskLabel: Record<string, string> = {
  critical: '有风险',
  high: '有风险',
  medium: '待审查',
  low: '安全',
}
const labelFrom = labelFromOptions

const LEDGER_VIEW_STORAGE_KEY = 'asset-ledger-view'
const LEDGER_PAGE_SIZES = [10, 20, 50] as const

function readLedgerView(): 'table' | 'card' {
  try {
    const value = localStorage.getItem(LEDGER_VIEW_STORAGE_KEY)
    if (value === 'table' || value === 'card') {
      return value
    }
  } catch {
    // ignore storage failures
  }
  return 'card'
}

const platformBadgeTone =
  'border-slate-200 bg-slate-50 text-slate-700 shadow-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'

const riskTone: Record<string, string> = {
  normal:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  low: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const admissionTone: Record<string, string> = {
  not_checked:
    'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
  checking: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  retest: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  passed:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  conditional_passed:
    'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

const assetMetadataNumber = (asset: AgentAsset, keys: string[]) => {
  const metadata = asset.metadata || {}
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number') {
      return value
    }
    if (
      typeof value === 'string' &&
      value.trim() &&
      !Number.isNaN(Number(value))
    ) {
      return Number(value)
    }
  }
  return undefined
}

const assetMetadataText = (asset: AgentAsset, keys: string[]) => {
  const metadata = asset.metadata || {}
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return undefined
}

const assetMetadataList = (asset: AgentAsset, keys: string[]) => {
  const metadata = asset.metadata || {}
  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item).trim()).filter(Boolean)
      if (items.length) {
        return items
      }
    }
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(/[、,，/]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

const displayUnknown = (value: unknown, fallback = '未设置'): string => {
  if (value == null || value === '') {
    return fallback
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.length
      ? value
          .map((item) => displayUnknown(item, ''))
          .filter(Boolean)
          .join(' / ')
      : fallback
  }
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

const maskSecret = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '未配置'
  }
  if (value.length <= 8) {
    return '已配置'
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

const formatAssetTime = (value?: string | null) => {
  if (!value) {
    return '未记录'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

const ledgerRuntimeLabel = (value?: string | null) => {
  if (value === 'running') {
    return '已上线'
  }
  if (value === 'not_launched') {
    return '未上线'
  }
  return labelFrom(runtimeOptions, value)
}

const ledgerAdmissionLabel = (value?: string | null) => {
  if (value === 'not_checked') {
    return '未测试'
  }
  if (value === 'retest') {
    return '待复测'
  }
  if (value && admissionLegacyLabels[value]) {
    return admissionLegacyLabels[value]
  }
  return labelFrom(admissionOptions, value)
}

const governanceStages: Array<{
  key: AssetGovernanceStage
  title: string
  description: string
  output: string
  icon: LucideIcon
  actionLabel: string
  action:
    | 'ledger'
    | 'identify'
    | 'component-detect'
    | 'agent-detect'
    | 'assessment'
    | 'remediation'
    | 'retest'
    | 'report'
    | 'monitoring'
}> = [
  {
    key: 'asset_intake',
    title: '资产入库',
    description: '登记 Agent 基础信息、归属、负责人、环境和生命周期状态。',
    output: '资产编号、基础画像、生命周期事件',
    icon: Boxes,
    actionLabel: '查看台账',
    action: 'ledger',
  },
  {
    key: 'component_identification',
    title: '组件识别',
    description: '识别 Skills、MCP、工具、知识库、大模型等挂载能力。',
    output: '能力组件清单、高危标记、权限说明',
    icon: Layers,
    actionLabel: '维护组件',
    action: 'identify',
  },
  {
    key: 'component_detection',
    title: '组件级检测',
    description: '对 Skill / MCP / 工具 / 知识库做专项检测和静态审计。',
    output: '组件风险发现、证据、修复建议',
    icon: ScanSearch,
    actionLabel: '发起组件检测',
    action: 'component-detect',
  },
  {
    key: 'agent_detection',
    title: '智能体整体检测',
    description: '基于完整 Agent 画像执行 API 对话、攻击链和场景库检测。',
    output: '整体验证结果、攻击样本、判定证据',
    icon: Radar,
    actionLabel: '发起整体检测',
    action: 'agent-detect',
  },
  {
    key: 'risk_assessment',
    title: '综合风险评估',
    description: '汇总组件风险、整体检测、暴露级别和涉敏情况，形成上线判断。',
    output: '综合风险等级、准入结论、处置优先级',
    icon: ShieldAlert,
    actionLabel: '查看评估',
    action: 'assessment',
  },
  {
    key: 'remediation',
    title: '风险整改',
    description: '将风险项分派给业务、开发、安全负责人并跟踪闭环。',
    output: '整改任务、责任人、修复说明',
    icon: GitPullRequestArrow,
    actionLabel: '进入整改',
    action: 'remediation',
  },
  {
    key: 'retest',
    title: '复测验证',
    description: '基于原发现发起复测，验证修复后风险是否关闭。',
    output: '复测任务、复测结论、关闭证明',
    icon: Repeat2,
    actionLabel: '发起复测',
    action: 'retest',
  },
  {
    key: 'report_audit',
    title: '报告审计',
    description: '生成检测报告、整改报告和审计留痕材料。',
    output: 'PDF / DOCX 报告、审计记录',
    icon: ClipboardCheck,
    actionLabel: '查看报告',
    action: 'report',
  },
  {
    key: 'launch_monitoring',
    title: '上线观测',
    description: '上线后持续观测风险变化、版本变更和异常行为。',
    output: '观测状态、周期巡检、变更触发记录',
    icon: LineChart,
    actionLabel: '上线观测',
    action: 'monitoring',
  },
]

function workflowMeta(asset: AgentAsset) {
  const raw = asset.metadata?.governanceWorkflow
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      currentStage: resolveInferredStage(asset),
      stageStatus: 'in_progress',
      stageHistory: [] as Array<Record<string, unknown>>,
    }
  }
  const workflowRecord = raw as Record<string, unknown>
  return {
    currentStage:
      typeof workflowRecord.currentStage === 'string'
        ? (workflowRecord.currentStage as AssetGovernanceStage)
        : resolveInferredStage(asset),
    stageStatus:
      typeof workflowRecord.stageStatus === 'string'
        ? workflowRecord.stageStatus
        : 'in_progress',
    stageHistory: Array.isArray(workflowRecord.stageHistory)
      ? workflowRecord.stageHistory
      : [],
  }
}

function resolveInferredStage(asset: AgentAsset): AssetGovernanceStage {
  if (
    asset.runtimeStatus === 'running' &&
    ['passed', 'conditional_passed'].includes(asset.admissionStatus)
  ) {
    return 'launch_monitoring'
  }
  if (['passed', 'conditional_passed'].includes(asset.admissionStatus)) {
    return 'report_audit'
  }
  if (asset.admissionStatus === 'retest') {
    return 'retest'
  }
  if (asset.admissionStatus === 'failed') {
    return 'remediation'
  }
  if (['high', 'critical', 'medium'].includes(asset.riskLevel)) {
    return 'risk_assessment'
  }
  if (
    (asset.components?.length || 0) > 0 &&
    asset.admissionStatus === 'checking'
  ) {
    return 'agent_detection'
  }
  if ((asset.components?.length || 0) > 0) {
    return 'component_detection'
  }
  return 'component_identification'
}

function stageIndex(stage: AssetGovernanceStage) {
  return Math.max(
    0,
    governanceStages.findIndex((item) => item.key === stage)
  )
}

type FormComponent = {
  componentType: AgentAssetComponentType
  componentName: string
  componentKey?: string
  version?: string
  sourceType?: string
  sourceRefId?: string
  sourcePlatform?: string
  highRisk: boolean
  sensitiveLevel?: string
  permissionText?: string
  riskTitle?: string
  riskLevel?: string
  riskChecks?: string[]
}

type RuntimeConfigForm = {
  enabled: boolean
  agentType: TargetAgent['type']
  apiBaseUrl: string
  apiKey: string
  userId: string
  conversationId: string
  apiType: 'chat' | 'workflow'
  workflowInputKey: string
  responseMode: 'blocking' | 'streaming'
  botId: string
  connectorId: string
  webhookUrl: string
  webhookPath: string
  n8nApiKeyHeaderName: string
  n8nApiKeyPrefix: string
  n8nRequestBodyMode: 'compat' | 'flat'
  n8nQueryFieldName: string
  transportMode: 'sse' | 'websocket'
  tencentSecretId: string
  tencentSecretKey: string
  tencentRegion: string
  authType: 'api_key' | 'basic' | 'header' | 'oauth'
  authHeaderName: string
  chatPath: string
  model: string
  toolChoice: string
  inputsJson: string
  additionalHeadersJson: string
  testPrompt: string
  lastProbe?: AssetRuntimeProbeResult & { checkedAt?: string }
}

type ConfigFileAttachment = {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: string
  content?: string
  parseStatus: 'stored' | 'metadata_only' | 'failed'
  summary?: string
}

const defaultRuntimeConfig = (): RuntimeConfigForm => ({
  enabled: false,
  agentType: 'dify',
  apiBaseUrl: '',
  apiKey: '',
  userId: 'dodoguard-test-user',
  conversationId: '',
  apiType: 'chat',
  workflowInputKey: 'query',
  responseMode: 'blocking',
  botId: '',
  connectorId: '',
  webhookUrl: '',
  webhookPath: '',
  n8nApiKeyHeaderName: 'X-N8N-API-KEY',
  n8nApiKeyPrefix: '',
  n8nRequestBodyMode: 'compat',
  n8nQueryFieldName: 'prompt',
  transportMode: 'sse',
  tencentSecretId: '',
  tencentSecretKey: '',
  tencentRegion: 'ap-guangzhou',
  authType: 'api_key',
  authHeaderName: 'Authorization',
  chatPath: '/v1/chat/completions',
  model: '',
  toolChoice: '',
  inputsJson: '{}',
  additionalHeadersJson: '{}',
  testPrompt: 'DodoGuard connection test ping',
})

function getLinkedCapabilityRiskIds(asset?: AgentAsset): string[] {
  const meta = asset?.metadata || {}
  return Array.isArray(meta.linkedCapabilityRiskIds)
    ? (meta.linkedCapabilityRiskIds as string[])
    : []
}

function platformToRuntimeAgentType(
  platformFamily?: string | null
): TargetAgent['type'] {
  const normalized = String(platformFamily || '').toLowerCase()
  if (normalized.includes('dify')) {
    return 'dify'
  }
  if (normalized.includes('coze')) {
    return 'coze'
  }
  if (normalized.includes('n8n')) {
    return 'n8n'
  }
  if (normalized.includes('fastgpt')) {
    return 'fastgpt'
  }
  if (
    normalized.includes('tencent') ||
    normalized.includes('adp') ||
    normalized.includes('腾讯')
  ) {
    return 'tencent-adp'
  }
  return 'api'
}

function defaultRuntimeBaseUrl(agentType: TargetAgent['type']): string {
  if (agentType === 'dify') {
    return 'https://api.dify.ai'
  }
  if (agentType === 'coze') {
    return 'https://api.coze.cn'
  }
  if (agentType === 'fastgpt') {
    return 'https://fastgpt.example.com'
  }
  if (agentType === 'n8n') {
    return 'https://n8n.example.com'
  }
  if (agentType === 'tencent-adp') {
    return 'https://wss.lke.cloud.tencent.com'
  }
  return ''
}

function shouldReplaceRuntimeBaseUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }
  return runtimeAgentTypeOptions.some(([agentType]) => {
    const defaultUrl = defaultRuntimeBaseUrl(agentType as TargetAgent['type'])
    return Boolean(defaultUrl && trimmed === defaultUrl)
  })
}

function runtimeConfigFromMetadata(asset?: AgentAsset): RuntimeConfigForm {
  const raw = asset?.metadata?.runtimeConfig
  const config =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const inputs =
    config.inputs && typeof config.inputs === 'object' ? config.inputs : {}
  const additionalHeaders =
    config.additionalHeaders && typeof config.additionalHeaders === 'object'
      ? config.additionalHeaders
      : {}

  const defaultAgentType = platformToRuntimeAgentType(asset?.platformFamily)
  const agentType =
    typeof config.agentType === 'string'
      ? (config.agentType as TargetAgent['type'])
      : typeof config.protocol === 'string'
        ? (config.protocol as TargetAgent['type'])
        : defaultAgentType

  return {
    ...defaultRuntimeConfig(),
    enabled: Boolean(config.enabled),
    agentType,
    apiBaseUrl: typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : '',
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    userId:
      typeof config.userId === 'string' ? config.userId : 'dodoguard-test-user',
    conversationId:
      typeof config.conversationId === 'string' ? config.conversationId : '',
    apiType: config.apiType === 'workflow' ? 'workflow' : 'chat',
    workflowInputKey:
      typeof config.workflowInputKey === 'string'
        ? config.workflowInputKey
        : 'query',
    responseMode:
      config.responseMode === 'streaming' ? 'streaming' : 'blocking',
    botId: typeof config.botId === 'string' ? config.botId : '',
    connectorId:
      typeof config.connectorId === 'string' ? config.connectorId : '',
    webhookUrl: typeof config.webhookUrl === 'string' ? config.webhookUrl : '',
    webhookPath:
      typeof config.webhookPath === 'string' ? config.webhookPath : '',
    n8nApiKeyHeaderName:
      typeof config.n8nApiKeyHeaderName === 'string'
        ? config.n8nApiKeyHeaderName
        : 'X-N8N-API-KEY',
    n8nApiKeyPrefix:
      typeof config.n8nApiKeyPrefix === 'string' ? config.n8nApiKeyPrefix : '',
    n8nRequestBodyMode:
      config.n8nRequestBodyMode === 'flat' ? 'flat' : 'compat',
    n8nQueryFieldName:
      typeof config.n8nQueryFieldName === 'string'
        ? config.n8nQueryFieldName
        : 'prompt',
    transportMode: config.transportMode === 'websocket' ? 'websocket' : 'sse',
    tencentSecretId:
      typeof config.tencentSecretId === 'string' ? config.tencentSecretId : '',
    tencentSecretKey:
      typeof config.tencentSecretKey === 'string'
        ? config.tencentSecretKey
        : '',
    tencentRegion:
      typeof config.tencentRegion === 'string'
        ? config.tencentRegion
        : 'ap-guangzhou',
    authType:
      config.authType === 'basic' ||
      config.authType === 'header' ||
      config.authType === 'oauth'
        ? config.authType
        : 'api_key',
    authHeaderName:
      typeof config.authHeaderName === 'string'
        ? config.authHeaderName
        : 'Authorization',
    chatPath:
      typeof config.chatPath === 'string' && config.chatPath
        ? config.chatPath
        : agentType === 'api-stream'
          ? '/v1/chat/stream/message'
          : '/v1/chat/completions',
    model:
      typeof config.model === 'string'
        ? config.model
        : asset?.defaultModel || '',
    toolChoice: typeof config.toolChoice === 'string' ? config.toolChoice : '',
    inputsJson: JSON.stringify(inputs, null, 2),
    additionalHeadersJson: JSON.stringify(additionalHeaders, null, 2),
    testPrompt:
      typeof config.testPrompt === 'string'
        ? config.testPrompt
        : 'DodoGuard connection test ping',
    lastProbe:
      config.lastProbe && typeof config.lastProbe === 'object'
        ? (config.lastProbe as RuntimeConfigForm['lastProbe'])
        : undefined,
  }
}

function configFilesFromMetadata(asset?: AgentAsset): ConfigFileAttachment[] {
  return Array.isArray(asset?.metadata?.configFiles)
    ? (asset.metadata.configFiles as ConfigFileAttachment[])
    : []
}

function defaultForm(asset?: AgentAsset): AssetAgentPayload & {
  department: string
  components: FormComponent[]
  linkedCapabilityRiskIds: string[]
  runtimeConfig: RuntimeConfigForm
  configFiles: ConfigFileAttachment[]
} {
  const businessOwner = asset?.owners?.find(
    (owner) => owner.ownerType === 'business'
  )
  const developerOwner = asset?.owners?.find(
    (owner) => owner.ownerType === 'developer'
  )
  const securityOwner = asset?.owners?.find(
    (owner) => owner.ownerType === 'security'
  )
  const opsOwner = asset?.owners?.find((owner) => owner.ownerType === 'ops')
  const linkedCapabilityRiskIds = getLinkedCapabilityRiskIds(asset)
  return {
    name: asset?.name || '',
    agentType: asset?.agentType || 'qa',
    platformFamily: asset?.platformFamily || 'Dify',
    version: asset?.version || 'v0.1.0',
    functionIntro: asset?.functionIntro || '',
    sensitiveData: asset?.sensitiveData ?? false,
    department: businessOwner?.department || '',
    businessSystem: asset?.businessSystem || '',
    businessScene: asset?.businessScene || '',
    environment: asset?.environment || 'test',
    runtimeStatus: asset?.runtimeStatus || 'not_launched',
    admissionStatus: asset?.admissionStatus || 'not_checked',
    riskLevel: asset?.riskLevel || 'normal',
    exposureLevel: asset?.exposureLevel || 'internal',
    exposureSurface: asset?.exposureSurface || '',
    defaultModel: asset?.defaultModel || '',
    linkedCapabilityRiskIds,
    runtimeConfig: runtimeConfigFromMetadata(asset),
    configFiles: configFilesFromMetadata(asset),
    owners: [
      {
        ownerType: 'business',
        ownerName: businessOwner?.ownerName || '',
        department: businessOwner?.department || '',
      },
      {
        ownerType: 'developer',
        ownerName: developerOwner?.ownerName || '',
        department: businessOwner?.department || '',
      },
      {
        ownerType: 'security',
        ownerName: securityOwner?.ownerName || '',
        department: businessOwner?.department || '',
        isPrimary: true,
      },
      {
        ownerType: 'ops',
        ownerName: opsOwner?.ownerName || '',
        department: businessOwner?.department || '',
      },
    ],
    components: asset?.components?.length
      ? asset.components.map((component) => ({
          componentType: component.componentType,
          componentName: component.componentName,
          componentKey: component.componentKey || '',
          version: component.version || '',
          sourceType: component.sourceType || 'manual',
          sourceRefId: component.sourceRefId || '',
          sourcePlatform:
            typeof component.configSnapshot?.sourcePlatform === 'string'
              ? component.configSnapshot.sourcePlatform
              : component.sourceType &&
                  !['manual', 'risk_library', 'capability_component'].includes(
                    component.sourceType
                  )
                ? component.sourceType
                : '',
          highRisk: component.highRisk,
          sensitiveLevel: component.sensitiveLevel || '',
          permissionText:
            typeof component.permissionScope?.description === 'string'
              ? component.permissionScope.description
              : '',
          riskTitle:
            typeof component.configSnapshot?.riskTitle === 'string'
              ? component.configSnapshot.riskTitle
              : '',
          riskLevel:
            typeof component.configSnapshot?.riskLevel === 'string'
              ? component.configSnapshot.riskLevel
              : '',
          riskChecks: Array.isArray(component.configSnapshot?.checks)
            ? component.configSnapshot.checks.map((item) => String(item))
            : [],
        }))
      : [],
  }
}

function componentTypeFromRiskKind(kind?: string): AgentAssetComponentType {
  if (
    kind === 'skill' ||
    kind === 'mcp' ||
    kind === 'tool' ||
    kind === 'model'
  ) {
    return kind
  }
  if (kind === 'knowledge') {
    return 'knowledge_base'
  }
  return 'tool'
}

function riskIsHigh(level?: string) {
  return level === 'critical' || level === 'high'
}

function formComponentFromRegistry(
  item: CapabilityComponentRegistry
): FormComponent {
  const meta = (item.metadata || {}) as Record<string, unknown>
  const sourcePlatform =
    (typeof meta.sourcePlatform === 'string' && meta.sourcePlatform) ||
    item.source ||
    '自研'
  return {
    componentType: componentTypeFromRiskKind(item.componentKind),
    componentName: item.name,
    componentKey: item.componentKey || '',
    version: item.version || '',
    sourceType: 'capability_component',
    sourceRefId: item.id,
    sourcePlatform,
    highRisk: riskIsHigh(item.riskLevel),
    sensitiveLevel: riskIsHigh(item.riskLevel) ? 'high' : item.riskLevel,
    permissionText: item.description || '',
    riskTitle: item.riskTitle || '',
    riskLevel: item.riskLevel,
    riskChecks: item.checks || [],
  }
}

function parseJsonObject(
  value: string,
  fieldName: string
): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) {
    return {}
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // handled below
  }
  throw new Error(`${fieldName} 必须是 JSON 对象`)
}

function redactRuntimeConfig(config: RuntimeConfigForm) {
  const inputs = parseJsonObject(config.inputsJson, '请求输入')
  const additionalHeaders = parseJsonObject(
    config.additionalHeadersJson,
    '附加请求头'
  )
  return {
    enabled: config.enabled,
    agentType: config.agentType,
    apiBaseUrl: config.apiBaseUrl.trim(),
    apiKey: config.apiKey.trim(),
    userId: config.userId.trim(),
    conversationId: config.conversationId.trim(),
    apiType: config.apiType,
    workflowInputKey: config.workflowInputKey.trim(),
    responseMode: config.responseMode,
    botId: config.botId.trim(),
    connectorId: config.connectorId.trim(),
    webhookUrl: config.webhookUrl.trim(),
    webhookPath: config.webhookPath.trim(),
    n8nApiKeyHeaderName: config.n8nApiKeyHeaderName.trim(),
    n8nApiKeyPrefix: config.n8nApiKeyPrefix,
    n8nRequestBodyMode: config.n8nRequestBodyMode,
    n8nQueryFieldName: config.n8nQueryFieldName.trim(),
    transportMode: config.transportMode,
    tencentSecretId: config.tencentSecretId.trim(),
    tencentSecretKey: config.tencentSecretKey.trim(),
    tencentRegion: config.tencentRegion.trim(),
    authType: config.authType,
    authHeaderName: config.authHeaderName.trim() || 'Authorization',
    chatPath: config.chatPath.trim(),
    model: config.model.trim(),
    toolChoice: config.toolChoice.trim(),
    inputs,
    additionalHeaders,
    testPrompt: config.testPrompt.trim(),
    lastProbe: config.lastProbe,
  }
}

function probePayloadFromRuntimeConfig(config: RuntimeConfigForm) {
  const runtimeConfig = redactRuntimeConfig(config)
  return {
    type: runtimeConfig.agentType,
    name: 'Asset runtime probe',
    config: runtimeConfig,
  }
}

function HeaderFrame() {
  return (
    <Header fixed>
      <Search />
      {SHOW_HEADER_UTILITY_ACTIONS ? (
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      ) : null}
    </Header>
  )
}

function CapabilityKindMountPanel({
  kind,
  label,
  componentType,
  components,
  onChange,
  catalog,
  loading,
}: {
  kind: CapabilityComponentKind
  label: string
  componentType: AgentAssetComponentType
  components: FormComponent[]
  onChange: (next: FormComponent[]) => void
  catalog: CapabilityComponentRegistry[]
  loading: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingIds, setPendingIds] = useState<string[]>([])

  const mountedRows = useMemo(
    () =>
      components
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.componentType === componentType),
    [components, componentType]
  )

  const mountedIds = useMemo(
    () =>
      new Set(
        mountedRows
          .map(({ item }) => item.sourceRefId)
          .filter((id): id is string => Boolean(id))
      ),
    [mountedRows]
  )

  const available = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return catalog.filter((item) => {
      if (item.componentKind !== kind) {
        return false
      }
      if (mountedIds.has(item.id)) {
        return false
      }
      if (!kw) {
        return true
      }
      return (
        item.name.toLowerCase().includes(kw) ||
        String(item.componentKey || '')
          .toLowerCase()
          .includes(kw) ||
        String(item.source || '')
          .toLowerCase()
          .includes(kw)
      )
    })
  }, [catalog, kind, mountedIds, search])

  const togglePending = (id: string) => {
    setPendingIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    )
  }

  const addPending = () => {
    if (!pendingIds.length) {
      return
    }
    const byId = new Map(catalog.map((item) => [item.id, item]))
    const additions = pendingIds
      .map((id) => byId.get(id))
      .filter((item): item is CapabilityComponentRegistry => Boolean(item))
      .map(formComponentFromRegistry)
    onChange([...components, ...additions])
    setPendingIds([])
    setPickerOpen(false)
    toast.success(`已挂载 ${additions.length} 个${label}`)
  }

  return (
    <div className='grid gap-3'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-xs text-muted-foreground'>
          已挂载 {mountedRows.length} 个 · 从主数据多选添加
        </p>
        <Popover
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open)
            if (!open) {
              setPendingIds([])
              setSearch('')
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button type='button' size='sm' variant='outline' className='h-8 shrink-0'>
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              添加{label}
              <ChevronDown className='ml-1.5 h-3.5 w-3.5 opacity-60' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-96 p-0' align='end'>
            <div className='flex flex-wrap gap-2 border-b p-3'>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`搜索${label}名称、标识…`}
                className='h-8 min-w-[140px] flex-1'
              />
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-8'
                onClick={() => setPendingIds(available.map((item) => item.id))}
                disabled={!available.length}
              >
                全选
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-8'
                onClick={() => setPendingIds([])}
                disabled={!pendingIds.length}
              >
                清空
              </Button>
            </div>
            <div className='max-h-56 space-y-1.5 overflow-y-auto p-2'>
              {loading ? (
                <div className='space-y-2 p-1'>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className='h-11 animate-pulse rounded-md bg-muted' />
                  ))}
                </div>
              ) : available.length === 0 ? (
                <div className='px-3 py-8 text-center text-sm text-muted-foreground'>
                  {catalog.some((item) => item.componentKind === kind)
                    ? `没有可添加的${label}`
                    : `暂无${label}主数据`}
                </div>
              ) : (
                available.map((item) => {
                  const checked = pendingIds.includes(item.id)
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                        checked ? 'bg-primary/5' : 'hover:bg-muted/60'
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePending(item.id)}
                        className='mt-0.5'
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>
                          {item.name}
                        </span>
                        <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                          {item.componentKey || '—'}
                          {item.version ? ` · ${item.version}` : ''}
                          {' · '}
                          {componentRiskLabel[item.riskLevel] || item.riskLevel}
                        </span>
                      </span>
                    </label>
                  )
                })
              )}
            </div>
            <div className='flex items-center justify-between gap-3 border-t px-3 py-2.5'>
              <span className='text-xs text-muted-foreground'>
                已选择 <b>{pendingIds.length}</b> 项
              </span>
              <Button
                type='button'
                size='sm'
                disabled={!pendingIds.length}
                onClick={addPending}
              >
                添加所选
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {mountedRows.length === 0 ? (
        <div className='rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground'>
          暂未挂载{label}
        </div>
      ) : (
        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead className='h-9'>名称</TableHead>
                <TableHead className='h-9'>标识 / 版本</TableHead>
                <TableHead className='h-9 w-[72px]'>高危</TableHead>
                <TableHead className='h-9'>来源平台</TableHead>
                <TableHead className='h-9 w-[72px] text-right'>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mountedRows.map(({ item, index }) => (
                <TableRow key={`${item.sourceRefId || item.componentName}-${index}`}>
                  <TableCell className='py-2 font-medium'>
                    {item.componentName}
                  </TableCell>
                  <TableCell className='py-2 text-muted-foreground'>
                    {item.componentKey || '—'}
                    {item.version ? ` · ${item.version}` : ''}
                  </TableCell>
                  <TableCell className='py-2'>
                    {item.highRisk ? (
                      <Badge variant='destructive'>高危</Badge>
                    ) : (
                      <Badge variant='outline'>否</Badge>
                    )}
                  </TableCell>
                  <TableCell className='py-2'>
                    <Badge variant='secondary'>
                      {item.sourcePlatform || '自研'}
                    </Badge>
                  </TableCell>
                  <TableCell className='py-2 text-right'>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      className='h-7 px-2 text-destructive hover:text-destructive'
                      onClick={() =>
                        onChange(components.filter((_, i) => i !== index))
                      }
                    >
                      移除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function CapabilityComponentMountSection({
  components,
  onChange,
  catalog,
  loading,
}: {
  components: FormComponent[]
  onChange: (next: FormComponent[]) => void
  catalog: CapabilityComponentRegistry[]
  loading: boolean
}) {
  const [activeKind, setActiveKind] = useState<CapabilityComponentKind>('tool')
  const counts = useMemo(() => {
    const map: Record<CapabilityComponentKind, number> = {
      tool: 0,
      skill: 0,
      mcp: 0,
      model: 0,
      knowledge: 0,
    }
    for (const item of components) {
      const kind = capabilityMountKinds.find(
        (row) => row.componentType === item.componentType
      )?.kind
      if (kind) {
        map[kind] += 1
      }
    }
    return map
  }, [components])

  return (
    <section className={formSectionClass}>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold'>能力组件</h3>
          <p className='mt-1 text-xs text-muted-foreground'>
            按类型从能力组件管理多选挂载 · 共 {components.length} 个
          </p>
        </div>
      </div>

      <Tabs
        value={activeKind}
        onValueChange={(value) => setActiveKind(value as CapabilityComponentKind)}
        className='gap-3'
      >
        <TabsList className='grid h-auto w-full grid-cols-5 p-1'>
          {capabilityMountKinds.map((item) => (
            <TabsTrigger
              key={item.kind}
              value={item.kind}
              className='flex-col gap-0.5 px-1 py-1.5 text-xs sm:text-sm'
            >
              <span>{item.label}</span>
              <span
                className={cn(
                  'text-[10px] font-normal tabular-nums',
                  counts[item.kind] > 0
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {counts[item.kind]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {capabilityMountKinds.map((item) => (
          <TabsContent key={item.kind} value={item.kind} className='mt-0'>
            <CapabilityKindMountPanel
              kind={item.kind}
              label={item.label}
              componentType={item.componentType}
              components={components}
              onChange={onChange}
              catalog={catalog}
              loading={loading}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function AssetFormDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: AgentAsset | null
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(defaultForm(asset || undefined))

  const capabilityComponentsQuery = useQuery({
    queryKey: ['capability-components', 'asset-form'],
    enabled: open,
    queryFn: () => detectionScanningApi.listCapabilityComponents({ limit: 200 }),
  })

  useEffect(() => {
    if (open) {
      setForm(defaultForm(asset || undefined))
    }
  }, [asset, open])

  const mutation = useMutation({
    mutationFn: () => {
      const runtimeConfig = redactRuntimeConfig(form.runtimeConfig)
      const owners = OWNER_TYPE_OPTIONS.map(([ownerType]) => {
        const owner = (form.owners || []).find(
          (item) => item.ownerType === ownerType
        )
        return {
          ownerType,
          ownerName: owner?.ownerName?.trim() || '',
          userId: owner?.userId || null,
          department: form.department,
          isPrimary: ownerType === 'security',
        }
      })
      const components = (form.components as FormComponent[])
        .filter((component) => component.componentName.trim())
        .map((component) => ({
          componentType: component.componentType,
          componentName: component.componentName.trim(),
          componentKey: component.componentKey || undefined,
          version: component.version || undefined,
          sourceType: component.sourceType || 'manual',
          sourceRefId: component.sourceRefId || undefined,
          highRisk: component.highRisk,
          sensitiveLevel: component.sensitiveLevel || undefined,
          permissionScope: component.permissionText
            ? { description: component.permissionText }
            : {},
          configSnapshot: component.sourceRefId
            ? component.sourceType === 'capability_component'
              ? {
                  source: 'capability_component_registry',
                  registryId: component.sourceRefId,
                  sourcePlatform: component.sourcePlatform || '',
                  riskTitle: component.riskTitle,
                  riskLevel: component.riskLevel,
                  checks: component.riskChecks || [],
                }
              : {
                  source: 'capability_risk_library',
                  riskLibraryId: component.sourceRefId,
                  sourcePlatform: component.sourcePlatform || '',
                  riskTitle: component.riskTitle,
                  riskLevel: component.riskLevel,
                  checks: component.riskChecks || [],
                }
            : {},
        }))
      const existingMeta = { ...(asset?.metadata || {}) } as Record<string, unknown>
      delete existingMeta.linkedSecurityLibIds
      delete existingMeta.linkedComplianceLibIds
      const payload: AssetAgentPayload = {
        ...form,
        owners,
        components,
        metadata: {
          ...existingMeta,
          linkedCapabilityRiskIds: form.linkedCapabilityRiskIds,
          runtimeConfig,
          configFiles: form.configFiles,
        },
      }
      delete (payload as any).department
      delete (payload as any).linkedCapabilityRiskIds
      delete (payload as any).runtimeConfig
      delete (payload as any).configFiles
      return asset
        ? assetIntakeApi.updateAgent(asset.id, payload)
        : assetIntakeApi.createAgent(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] })
      toast.success(asset ? '资产信息已更新' : 'Agent 已登记入台账')
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  })

  const probeMutation = useMutation({
    mutationFn: () =>
      assetIntakeApi.probeRuntime(
        probePayloadFromRuntimeConfig(form.runtimeConfig)
      ),
    onSuccess: (result) => {
      const checkedAt = new Date().toISOString()
      setForm((current) => ({
        ...current,
        runtimeConfig: {
          ...current.runtimeConfig,
          enabled: true,
          lastProbe: { ...result, checkedAt },
        },
      }))
      if (result.status === 'success') {
        toast.success(result.message || '连接测试通过')
      } else {
        toast.error(result.message || '连接测试失败')
      }
    },
    onError: (error: Error) => toast.error(error.message || '连接测试失败'),
  })

  const set = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }))
  const setRuntime = (patch: Partial<RuntimeConfigForm>) =>
    setForm((current) => ({
      ...current,
      runtimeConfig: {
        ...current.runtimeConfig,
        ...patch,
        lastProbe: 'lastProbe' in patch ? patch.lastProbe : undefined,
      },
    }))
  const addConfigFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return
    }
    const nextFiles: ConfigFileAttachment[] = []
    for (const file of Array.from(files)) {
      const isTextLike =
        file.type.startsWith('text/') ||
        /\.(json|ya?ml|txt|md|toml|xml)$/i.test(file.name)
      let content: string | undefined
      let parseStatus: ConfigFileAttachment['parseStatus'] = 'metadata_only'
      let summary = '已保存文件元数据'
      if (isTextLike && file.size <= 512 * 1024) {
        try {
          content = await file.text()
          parseStatus = 'stored'
          summary = `已保存文本内容，${content.split(/\r?\n/).length} 行`
        } catch {
          parseStatus = 'failed'
          summary = '读取失败，仅保存文件元数据'
        }
      }
      nextFiles.push({
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        content,
        parseStatus,
        summary,
      })
    }
    set('configFiles', [...form.configFiles, ...nextFiles])
  }
  const components = form.components as FormComponent[]
  const capabilityCatalog = capabilityComponentsQuery.data?.data || []
  const isSaveDisabled =
    mutation.isPending || !form.name.trim() || !form.functionIntro.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] w-[min(96vw,1120px)] max-w-[min(96vw,1120px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1120px)]'>
        <DialogHeader className='border-b bg-muted/30 px-6 py-5'>
          <DialogTitle>
            {asset ? '编辑 Agent 资产' : '安全手工登记 Agent'}
          </DialogTitle>
          <DialogDescription>
            补齐归属、运行环境、负责人、能力组件和关联安全用例后写入资产台账。
          </DialogDescription>
        </DialogHeader>

        <div className='grid gap-3 overflow-y-auto bg-muted/20 px-6 py-4'>
          {/* ── 基本信息 ── */}
          <section className={formSectionClass}>
            <div>
              <h3 className='text-sm font-semibold'>基本信息</h3>
              <p className='mt-1 text-xs text-muted-foreground'>
                定义资产身份、平台来源和业务说明。
              </p>
            </div>
            <div className={formGridClass}>
              <Field label='Agent 名称' required className='md:col-span-4'>
                <Input
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                />
              </Field>
              <Field label='Agent 类型' className='md:col-span-3'>
                <Select
                  value={form.agentType}
                  onValueChange={(value) => set('agentType', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agentTypeOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='平台来源' className='md:col-span-3'>
                <Select
                  value={form.platformFamily}
                  onValueChange={(value) => {
                    const agentType = platformToRuntimeAgentType(value)
                    set('platformFamily', value)
                    setRuntime({
                      agentType,
                      enabled: form.runtimeConfig.enabled,
                      apiBaseUrl: shouldReplaceRuntimeBaseUrl(
                        form.runtimeConfig.apiBaseUrl
                      )
                        ? defaultRuntimeBaseUrl(agentType)
                        : form.runtimeConfig.apiBaseUrl,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platformOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-[11px] leading-relaxed text-muted-foreground'>
                  资产归属的平台生态，用于分类、筛选和风险画像。
                </p>
              </Field>
              <Field label='当前版本' className='md:col-span-2'>
                <Input
                  value={form.version || ''}
                  onChange={(event) => set('version', event.target.value)}
                />
              </Field>
              <Field label='默认模型' className='md:col-span-8'>
                <Input
                  value={form.defaultModel || ''}
                  onChange={(event) => set('defaultModel', event.target.value)}
                />
              </Field>
              <div className='flex min-h-10 items-center justify-between rounded-md border bg-muted/20 px-3 py-2 md:col-span-4'>
                <Label
                  htmlFor='sensitiveData'
                  className='text-xs font-medium text-muted-foreground'
                >
                  是否涉敏
                </Label>
                <Switch
                  id='sensitiveData'
                  checked={form.sensitiveData}
                  onCheckedChange={(value) => set('sensitiveData', value)}
                />
              </div>
            </div>
            <Field label='功能介绍' required>
              <Textarea
                rows={3}
                value={form.functionIntro}
                onChange={(event) => set('functionIntro', event.target.value)}
              />
            </Field>
          </section>

          {/* ── Agent 接入配置 ── */}
          <section className={formSectionClass}>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold'>Agent 接入配置</h3>
                <p className='mt-1 text-xs text-muted-foreground'>
                  这里配置运行时怎么调用 Agent。平台来源会自动推荐调用协议；只有网关、代理或自研封装时才需要手动改成通用 HTTP / LangChain。
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {form.runtimeConfig.lastProbe && (
                  <Badge
                    variant={
                      form.runtimeConfig.lastProbe.status === 'success'
                        ? 'default'
                        : 'destructive'
                    }
                  >
                    {form.runtimeConfig.lastProbe.status === 'success'
                      ? '最近测试通过'
                      : '最近测试失败'}
                  </Badge>
                )}
                <Button
                  type='button'
                  variant='outline'
                  disabled={
                    probeMutation.isPending ||
                    (!form.runtimeConfig.apiBaseUrl.trim() &&
                      !form.runtimeConfig.webhookUrl.trim() &&
                      form.runtimeConfig.agentType !== 'tencent-adp')
                  }
                  onClick={() => probeMutation.mutate()}
                >
                  <ShieldCheck className='mr-2 h-4 w-4' />
                  {probeMutation.isPending ? '测试中...' : '测试连接'}
                </Button>
              </div>
            </div>
            <div className={formGridClass}>
              <Field label='调用协议' className='md:col-span-2'>
                <Select
                  value={form.runtimeConfig.agentType}
                  onValueChange={(value) => {
                    const agentType = value as TargetAgent['type']
                    setRuntime({
                      agentType,
                      enabled: true,
                      chatPath:
                        agentType === 'api-stream'
                          ? '/v1/chat/stream/message'
                          : form.runtimeConfig.chatPath ||
                            '/v1/chat/completions',
                      apiBaseUrl:
                        shouldReplaceRuntimeBaseUrl(
                          form.runtimeConfig.apiBaseUrl
                        )
                          ? defaultRuntimeBaseUrl(agentType)
                          : form.runtimeConfig.apiBaseUrl,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {runtimeAgentTypeOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-[11px] leading-relaxed text-muted-foreground'>
                  实际请求协议和字段模板。
                </p>
              </Field>
              <Field label='API Base URL' className='md:col-span-5'>
                <Input
                  placeholder={
                    form.runtimeConfig.agentType === 'dify'
                      ? 'https://api.dify.ai'
                      : form.runtimeConfig.agentType === 'coze'
                        ? 'https://api.coze.cn'
                        : form.runtimeConfig.agentType === 'n8n'
                          ? 'https://n8n.example.com'
                          : form.runtimeConfig.agentType === 'fastgpt'
                            ? 'https://fastgpt.example.com'
                            : form.runtimeConfig.agentType === 'tencent-adp'
                              ? 'https://wss.lke.cloud.tencent.com'
                              : 'https://api.example.com'
                  }
                  value={form.runtimeConfig.apiBaseUrl}
                  onChange={(event) =>
                    setRuntime({
                      apiBaseUrl: event.target.value,
                      enabled: true,
                    })
                  }
                />
              </Field>
              <Field
                label={
                  form.runtimeConfig.agentType === 'tencent-adp'
                    ? 'AppKey'
                    : 'API Key'
                }
                className='md:col-span-2'
              >
                <Input
                  type='password'
                  placeholder={
                    form.runtimeConfig.agentType === 'tencent-adp'
                      ? 'ADP AppKey'
                      : 'sk-...'
                  }
                  value={form.runtimeConfig.apiKey}
                  onChange={(event) =>
                    setRuntime({ apiKey: event.target.value, enabled: true })
                  }
                />
              </Field>
              <Field label='测试指令' className='md:col-span-3'>
                <Input
                  value={form.runtimeConfig.testPrompt}
                  onChange={(event) =>
                    setRuntime({
                      testPrompt: event.target.value,
                      enabled: true,
                    })
                  }
                />
              </Field>
            </div>

            {form.runtimeConfig.agentType === 'dify' && (
              <div className={compactPanelClass}>
                <Field label='Dify API 类型' className='md:col-span-2'>
                  <Select
                    value={form.runtimeConfig.apiType}
                    onValueChange={(value) =>
                      setRuntime({
                        apiType: value as RuntimeConfigForm['apiType'],
                        enabled: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='chat'>Chat / Agent</SelectItem>
                      <SelectItem value='workflow'>Workflow</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='Workflow 输入 Key' className='md:col-span-3'>
                  <Input
                    placeholder='query'
                    value={form.runtimeConfig.workflowInputKey}
                    onChange={(event) =>
                      setRuntime({
                        workflowInputKey: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='User ID' className='md:col-span-3'>
                  <Input
                    value={form.runtimeConfig.userId}
                    onChange={(event) =>
                      setRuntime({ userId: event.target.value, enabled: true })
                    }
                  />
                </Field>
                <Field label='响应模式' className='md:col-span-2'>
                  <Select
                    value={form.runtimeConfig.responseMode}
                    onValueChange={(value) =>
                      setRuntime({
                        responseMode:
                          value as RuntimeConfigForm['responseMode'],
                        enabled: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='blocking'>blocking</SelectItem>
                      <SelectItem value='streaming'>streaming</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.runtimeConfig.apiType !== 'workflow' && (
                  <Field label='Conversation ID' className='md:col-span-2'>
                    <Input
                      value={form.runtimeConfig.conversationId}
                      onChange={(event) =>
                        setRuntime({
                          conversationId: event.target.value,
                          enabled: true,
                        })
                      }
                    />
                  </Field>
                )}
              </div>
            )}

            {form.runtimeConfig.agentType === 'coze' && (
              <div className={compactPanelClass}>
                <Field label='Bot ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.botId}
                    onChange={(event) =>
                      setRuntime({ botId: event.target.value, enabled: true })
                    }
                  />
                </Field>
                <Field label='Connector ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.connectorId}
                    onChange={(event) =>
                      setRuntime({
                        connectorId: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
              </div>
            )}

            {form.runtimeConfig.agentType === 'fastgpt' && (
              <div className={compactPanelClass}>
                <Field label='Chat ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.conversationId}
                    onChange={(event) =>
                      setRuntime({
                        conversationId: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='User ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.userId}
                    onChange={(event) =>
                      setRuntime({ userId: event.target.value, enabled: true })
                    }
                  />
                </Field>
              </div>
            )}

            {form.runtimeConfig.agentType === 'n8n' && (
              <div className={compactPanelClass}>
                <Field label='Webhook URL' className='md:col-span-6'>
                  <Input
                    placeholder='https://n8n.example.com/webhook/...'
                    value={form.runtimeConfig.webhookUrl}
                    onChange={(event) =>
                      setRuntime({
                        webhookUrl: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='Webhook Path' className='md:col-span-6'>
                  <Input
                    placeholder='/webhook/agent'
                    value={form.runtimeConfig.webhookPath}
                    onChange={(event) =>
                      setRuntime({
                        webhookPath: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='API Key Header' className='md:col-span-3'>
                  <Input
                    value={form.runtimeConfig.n8nApiKeyHeaderName}
                    onChange={(event) =>
                      setRuntime({
                        n8nApiKeyHeaderName: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='API Key Prefix' className='md:col-span-3'>
                  <Input
                    placeholder='Bearer '
                    value={form.runtimeConfig.n8nApiKeyPrefix}
                    onChange={(event) =>
                      setRuntime({
                        n8nApiKeyPrefix: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='请求体模式' className='md:col-span-3'>
                  <Select
                    value={form.runtimeConfig.n8nRequestBodyMode}
                    onValueChange={(value) =>
                      setRuntime({
                        n8nRequestBodyMode:
                          value as RuntimeConfigForm['n8nRequestBodyMode'],
                        enabled: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='compat'>兼容模式</SelectItem>
                      <SelectItem value='flat'>扁平模式</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='Query 字段名' className='md:col-span-3'>
                  <Input
                    value={form.runtimeConfig.n8nQueryFieldName}
                    onChange={(event) =>
                      setRuntime({
                        n8nQueryFieldName: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='User ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.userId}
                    onChange={(event) =>
                      setRuntime({ userId: event.target.value, enabled: true })
                    }
                  />
                </Field>
                <Field label='Conversation ID' className='md:col-span-6'>
                  <Input
                    value={form.runtimeConfig.conversationId}
                    onChange={(event) =>
                      setRuntime({
                        conversationId: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
              </div>
            )}

            {form.runtimeConfig.agentType === 'tencent-adp' && (
              <div className={compactPanelClass}>
                <Field label='接入方式' className='md:col-span-2'>
                  <Select
                    value={form.runtimeConfig.transportMode}
                    onValueChange={(value) =>
                      setRuntime({
                        transportMode:
                          value as RuntimeConfigForm['transportMode'],
                        enabled: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='sse'>HTTP SSE</SelectItem>
                      <SelectItem value='websocket'>WebSocket</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='VisitorId' className='md:col-span-4'>
                  <Input
                    value={form.runtimeConfig.userId}
                    onChange={(event) =>
                      setRuntime({ userId: event.target.value, enabled: true })
                    }
                  />
                </Field>
                <Field label='ConversationId' className='md:col-span-3'>
                  <Input
                    value={form.runtimeConfig.conversationId}
                    onChange={(event) =>
                      setRuntime({
                        conversationId: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='腾讯云 Region' className='md:col-span-3'>
                  <Input
                    value={form.runtimeConfig.tencentRegion}
                    onChange={(event) =>
                      setRuntime({
                        tencentRegion: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                {form.runtimeConfig.transportMode === 'websocket' && (
                  <>
                    <Field label='腾讯云 SecretId' className='md:col-span-6'>
                      <Input
                        type='password'
                        value={form.runtimeConfig.tencentSecretId}
                        onChange={(event) =>
                          setRuntime({
                            tencentSecretId: event.target.value,
                            enabled: true,
                          })
                        }
                      />
                    </Field>
                    <Field label='腾讯云 SecretKey' className='md:col-span-6'>
                      <Input
                        type='password'
                        value={form.runtimeConfig.tencentSecretKey}
                        onChange={(event) =>
                          setRuntime({
                            tencentSecretKey: event.target.value,
                            enabled: true,
                          })
                        }
                      />
                    </Field>
                  </>
                )}
              </div>
            )}

            {(form.runtimeConfig.agentType === 'api' ||
              form.runtimeConfig.agentType === 'api-stream' ||
              form.runtimeConfig.agentType === 'langchain') && (
              <div className={compactPanelClass}>
                <Field label='Chat Path' className='md:col-span-4'>
                  <Input
                    placeholder={
                      form.runtimeConfig.agentType === 'api-stream'
                        ? '/v1/chat/stream/message'
                        : '/v1/chat/completions'
                    }
                    value={form.runtimeConfig.chatPath}
                    onChange={(event) =>
                      setRuntime({
                        chatPath: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='模型' className='md:col-span-3'>
                  <Input
                    placeholder='gpt-4o-mini'
                    value={form.runtimeConfig.model}
                    onChange={(event) => {
                      setRuntime({ model: event.target.value, enabled: true })
                      set('defaultModel', event.target.value)
                    }}
                  />
                </Field>
                <Field label='鉴权方式' className='md:col-span-2'>
                  <Select
                    value={form.runtimeConfig.authType}
                    onValueChange={(value) =>
                      setRuntime({
                        authType: value as RuntimeConfigForm['authType'],
                        enabled: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='api_key'>Bearer API Key</SelectItem>
                      <SelectItem value='header'>自定义 Header</SelectItem>
                      <SelectItem value='basic'>Basic</SelectItem>
                      <SelectItem value='oauth'>OAuth</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='Header 名称' className='md:col-span-3'>
                  <Input
                    placeholder='Authorization'
                    value={form.runtimeConfig.authHeaderName}
                    onChange={(event) =>
                      setRuntime({
                        authHeaderName: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                <Field label='Tool Choice' className='md:col-span-4'>
                  <Input
                    value={form.runtimeConfig.toolChoice}
                    onChange={(event) =>
                      setRuntime({
                        toolChoice: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
              </div>
            )}

            {[
              'dify',
              'fastgpt',
              'n8n',
              'tencent-adp',
              'api',
              'api-stream',
              'langchain',
            ].includes(form.runtimeConfig.agentType) && (
              <div className={formGridClass}>
                <Field
                  label={
                    form.runtimeConfig.agentType === 'tencent-adp'
                      ? '开始节点入参 JSON'
                      : '请求输入 JSON'
                  }
                  className={
                    form.runtimeConfig.agentType === 'tencent-adp'
                      ? 'md:col-span-12'
                      : 'md:col-span-6'
                  }
                >
                  <Textarea
                    rows={4}
                    className='font-mono text-xs'
                    placeholder={
                      form.runtimeConfig.agentType === 'tencent-adp'
                        ? '{\n  "amount": "12000",\n  "applicant_role": "manager",\n  "department": "sales",\n  "invoice_type": "other",\n  "purpose": "客户招待及差旅混合报销",\n  "urgent": "true"\n}'
                        : '{}'
                    }
                    value={form.runtimeConfig.inputsJson}
                    onChange={(event) =>
                      setRuntime({
                        inputsJson: event.target.value,
                        enabled: true,
                      })
                    }
                  />
                </Field>
                {form.runtimeConfig.agentType !== 'tencent-adp' && (
                  <Field label='附加请求头 JSON' className='md:col-span-6'>
                    <Textarea
                      rows={4}
                      className='font-mono text-xs'
                      value={form.runtimeConfig.additionalHeadersJson}
                      onChange={(event) =>
                        setRuntime({
                          additionalHeadersJson: event.target.value,
                          enabled: true,
                        })
                      }
                    />
                  </Field>
                )}
              </div>
            )}
            {form.runtimeConfig.lastProbe && (
              <div className='rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
                <div className='font-medium text-foreground'>
                  {form.runtimeConfig.lastProbe.message || '连接测试已完成'}
                </div>
                <div className='mt-1'>
                  {form.runtimeConfig.lastProbe.endpoint || '未返回 endpoint'}
                  {form.runtimeConfig.lastProbe.durationMs ||
                  form.runtimeConfig.lastProbe.responseTime
                    ? ` · ${form.runtimeConfig.lastProbe.durationMs || form.runtimeConfig.lastProbe.responseTime}ms`
                    : ''}
                  {form.runtimeConfig.lastProbe.httpStatus
                    ? ` · HTTP ${form.runtimeConfig.lastProbe.httpStatus}`
                    : ''}
                </div>
                {form.runtimeConfig.lastProbe.preview && (
                  <pre className='mt-2 max-h-24 overflow-auto rounded bg-background p-2 whitespace-pre-wrap'>
                    {form.runtimeConfig.lastProbe.preview}
                  </pre>
                )}
              </div>
            )}
          </section>

          {/* ── 配置文件上传 ── */}
          <section className={formSectionClass}>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold'>配置文件上传</h3>
                <p className='mt-1 text-xs text-muted-foreground'>
                  支持 JSON、YAML、Markdown、TXT 等文本配置；ZIP
                  等二进制文件先保存元数据。
                </p>
              </div>
              <Button type='button' variant='outline' asChild>
                <Label className='cursor-pointer'>
                  <UploadCloud className='mr-2 h-4 w-4' />
                  上传配置文件
                  <Input
                    type='file'
                    className='hidden'
                    multiple
                    accept='.json,.yaml,.yml,.txt,.md,.toml,.xml,.zip'
                    onChange={(event) => {
                      void addConfigFiles(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </Label>
              </Button>
            </div>
            {form.configFiles.length > 0 ? (
              <div className='grid gap-2'>
                {form.configFiles.map((file) => (
                  <div
                    key={file.id}
                    className='flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2'
                  >
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-medium'>
                        {file.name}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {(file.size / 1024).toFixed(1)} KB ·{' '}
                        {file.summary || '已上传'}
                      </div>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() =>
                        set(
                          'configFiles',
                          form.configFiles.filter((item) => item.id !== file.id)
                        )
                      }
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className='rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground'>
                暂未上传配置文件
              </div>
            )}
          </section>

          {/* ── 归属与负责人 ── */}
          <section className={formSectionClass}>
            <div>
              <h3 className='text-sm font-semibold'>归属与负责人</h3>
              <p className='mt-1 text-xs text-muted-foreground'>
                明确部门、业务系统和业务 / 开发 / 安全 / 运维责任人。
              </p>
            </div>
            <div className='grid gap-x-6 gap-y-4 md:grid-cols-4'>
              <AgentOwnershipFields
                className='md:col-span-4'
                value={{
                  department: form.department,
                  businessSystem: form.businessSystem || '',
                  businessScene: form.businessScene || '',
                  owners: (form.owners || []).map((owner) => ({
                    ownerType: owner.ownerType,
                    ownerName: owner.ownerName || '',
                    department:
                      owner.department || form.department || undefined,
                    isPrimary: owner.isPrimary,
                  })),
                }}
                onChange={(next) =>
                  setForm((current) => ({
                    ...current,
                    department: next.department,
                    businessSystem: next.businessSystem,
                    businessScene: next.businessScene,
                    owners: next.owners,
                  }))
                }
              />
            </div>
          </section>

          {/* ── 运行与暴露 ── */}
          <section className={formSectionClass}>
            <div>
              <h3 className='text-sm font-semibold'>运行与暴露</h3>
              <p className='mt-1 text-xs text-muted-foreground'>
                记录部署环境、运行状态、对外开放级别和具体访问入口。
              </p>
            </div>
            <div className='grid gap-x-6 gap-y-4 md:grid-cols-4'>
              <Field label='部署环境'>
                <Select
                  value={form.environment}
                  onValueChange={(value) => set('environment', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {environmentOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='运行状态'>
                <Select
                  value={form.runtimeStatus}
                  onValueChange={(value) => set('runtimeStatus', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {runtimeOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='暴露级别'>
                <Select
                  value={form.exposureLevel}
                  onValueChange={(value) => set('exposureLevel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {exposureOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='准入状态'>
                <Select
                  value={form.admissionStatus}
                  onValueChange={(value) => set('admissionStatus', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {admissionOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='风险等级'>
                <Select
                  value={form.riskLevel}
                  onValueChange={(value) => set('riskLevel', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {riskOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='暴露面说明' className='md:col-span-4'>
                <Textarea
                  value={form.exposureSurface || ''}
                  onChange={(event) =>
                    set('exposureSurface', event.target.value)
                  }
                  placeholder='如：内部 API、企业微信入口、公网 Web Chat、客户 App 内嵌、OpenAPI 网关'
                  className='min-h-20'
                />
              </Field>
            </div>
          </section>

          <CapabilityComponentMountSection
            components={components}
            onChange={(next) => set('components', next)}
            catalog={capabilityCatalog}
            loading={capabilityComponentsQuery.isLoading}
          />
        </div>

        <DialogFooter className='border-t bg-background px-6 py-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={isSaveDisabled} onClick={() => mutation.mutate()}>
            {mutation.isPending
              ? '保存中...'
              : asset
                ? '保存变更'
                : '登记并入台账'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
  className,
  required = false,
}: {
  label: string
  children: ReactNode
  className?: string
  required?: boolean
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 content-start gap-1 [&_[data-slot=select-trigger]]:w-full',
        className
      )}
    >
      <Label className='text-xs font-medium text-muted-foreground'>
        {label}
        {required && <span className='ml-0.5 text-destructive'>*</span>}
      </Label>
      {children}
    </div>
  )
}

export function WorkflowStrip({
  asset,
  compact = false,
}: {
  asset: AgentAsset
  compact?: boolean
}) {
  const workflow = workflowMeta(asset)
  const currentIndex = stageIndex(workflow.currentStage)
  return (
    <div className='rounded-md border bg-muted/20 p-3'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='text-sm font-medium'>治理流程进度</div>
        <Badge variant='outline'>
          {governanceStages[currentIndex]?.title || '资产入库'}
        </Badge>
      </div>
      <div
        className={`grid gap-2 ${compact ? 'md:grid-cols-9' : 'md:grid-cols-9'}`}
      >
        {governanceStages.map((stage, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          const Icon = stage.icon
          return (
            <div
              key={stage.key}
              className={[
                'min-w-0 rounded-md border p-2 text-center',
                done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                  : '',
                active ? 'border-primary bg-primary/10 text-primary' : '',
              ].join(' ')}
            >
              <Icon className='mx-auto mb-1 h-4 w-4' />
              <div className='truncate text-[11px] font-medium'>
                {stage.title}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 truncate text-sm font-medium'>{value}</div>
    </div>
  )
}

function PortraitCard({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-h-[132px] rounded-md border bg-muted/10 p-3',
        className
      )}
    >
      <h4 className='text-sm font-semibold'>{title}</h4>
      <div className='mt-2 text-sm leading-6 text-muted-foreground'>
        {children}
      </div>
    </div>
  )
}

function PortraitLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='grid grid-cols-[84px_minmax(0,1fr)] gap-2'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className='min-w-0 break-words text-foreground'>
        {value || '未设置'}
      </span>
    </div>
  )
}

function runtimeConfigOf(asset: AgentAsset) {
  const metadata = asset.metadata || {}
  return metadata.runtimeConfig &&
    typeof metadata.runtimeConfig === 'object' &&
    !Array.isArray(metadata.runtimeConfig)
    ? (metadata.runtimeConfig as Record<string, unknown>)
    : {}
}

function configFilesOf(asset: AgentAsset) {
  return Array.isArray(asset.metadata?.configFiles)
    ? asset.metadata.configFiles
    : []
}

function ownerByType(asset: AgentAsset, ownerType: OwnerType) {
  return asset.owners?.find((owner) => owner.ownerType === ownerType)
}

function ownerDisplay(asset: AgentAsset, ownerType: OwnerType) {
  const owner = ownerByType(asset, ownerType)
  return owner?.ownerName || '未指派'
}

function accessMethodLabel(runtimeConfig: Record<string, unknown>) {
  const method = displayUnknown(runtimeConfig.method, '')
  if (method === 'sdk') {
    return 'SDK 接入'
  }
  if (method === 'webhook') {
    return 'Webhook'
  }
  if (method === 'proxy') {
    return '代理模式'
  }
  if (method === 'platform') {
    return '平台接入'
  }
  if (method === 'file') {
    return '文件导入'
  }
  if (method === 'offline') {
    return '离线评测'
  }
  if (runtimeConfig.webhookUrl) {
    return 'Webhook'
  }
  if (runtimeConfig.agentType || runtimeConfig.apiBaseUrl) {
    return 'API 接入'
  }
  return '未配置'
}

function runtimeConnectorLabel(
  runtimeConfig: Record<string, unknown>,
  asset: AgentAsset
) {
  const value = displayUnknown(
    runtimeConfig.agentType || runtimeConfig.protocol || asset.platformFamily
  )
  if (value === 'tencent-adp') {
    return '腾讯 ADP'
  }
  if (value === 'api-stream') {
    return '流式 API'
  }
  if (value === 'api') {
    return '通用 API'
  }
  if (value === 'custom') {
    return '自定义'
  }
  return value
}

function runtimeEndpoint(runtimeConfig: Record<string, unknown>) {
  const baseUrl = displayUnknown(runtimeConfig.apiBaseUrl, '')
  const webhookUrl = displayUnknown(runtimeConfig.webhookUrl, '')
  const path = displayUnknown(
    runtimeConfig.chatPath || runtimeConfig.webhookPath,
    ''
  )
  if (webhookUrl) {
    return webhookUrl
  }
  if (baseUrl && path) {
    return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  }
  return baseUrl || '未配置'
}

function runtimeTypeFields(runtimeConfig: Record<string, unknown>) {
  const agentType = runtimeConfig.agentType
  if (agentType === 'dify') {
    return [
      ['API 类型', runtimeConfig.apiType === 'workflow' ? 'Workflow' : 'Chat'],
      ['Response Mode', displayUnknown(runtimeConfig.responseMode, 'blocking')],
      [
        'Workflow Input Key',
        displayUnknown(runtimeConfig.workflowInputKey, 'query'),
      ],
      ['User ID', displayUnknown(runtimeConfig.userId)],
      ['Conversation ID', displayUnknown(runtimeConfig.conversationId)],
    ]
  }
  if (agentType === 'coze') {
    return [
      ['Bot ID', displayUnknown(runtimeConfig.botId)],
      ['Connector ID', displayUnknown(runtimeConfig.connectorId)],
      ['User ID', displayUnknown(runtimeConfig.userId)],
    ]
  }
  if (agentType === 'n8n') {
    return [
      ['Webhook URL', displayUnknown(runtimeConfig.webhookUrl)],
      ['Webhook Path', displayUnknown(runtimeConfig.webhookPath)],
      [
        'API Key Header',
        displayUnknown(runtimeConfig.n8nApiKeyHeaderName, 'X-N8N-API-KEY'),
      ],
      [
        'Request Body Mode',
        displayUnknown(runtimeConfig.n8nRequestBodyMode, 'compat'),
      ],
      [
        'Query Field',
        displayUnknown(runtimeConfig.n8nQueryFieldName, 'prompt'),
      ],
    ]
  }
  if (agentType === 'fastgpt') {
    return [
      ['User ID', displayUnknown(runtimeConfig.userId)],
      ['Chat ID', displayUnknown(runtimeConfig.conversationId)],
    ]
  }
  if (agentType === 'tencent-adp') {
    return [
      [
        'Transport',
        displayUnknown(runtimeConfig.transportMode, 'sse').toUpperCase(),
      ],
      ['Region', displayUnknown(runtimeConfig.tencentRegion, 'ap-guangzhou')],
      ['VisitorId', displayUnknown(runtimeConfig.userId)],
      ['ConversationId', displayUnknown(runtimeConfig.conversationId)],
      ['SecretId', maskSecret(runtimeConfig.tencentSecretId)],
    ]
  }
  return [
    [
      'Chat Path',
      displayUnknown(runtimeConfig.chatPath, '/v1/chat/completions'),
    ],
    [
      'Auth Header',
      displayUnknown(runtimeConfig.authHeaderName, 'Authorization'),
    ],
    ['Response Mode', displayUnknown(runtimeConfig.responseMode, 'blocking')],
  ]
}

function probeOf(runtimeConfig: Record<string, unknown>) {
  return runtimeConfig.lastProbe &&
    typeof runtimeConfig.lastProbe === 'object' &&
    !Array.isArray(runtimeConfig.lastProbe)
    ? (runtimeConfig.lastProbe as Record<string, unknown>)
    : undefined
}

function connectionStatusBadge(probe?: Record<string, unknown>) {
  if (!probe) {
    return <Badge variant='secondary'>未测试</Badge>
  }
  if (probe.status === 'success') {
    return (
      <Badge className='bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'>
        已联通
      </Badge>
    )
  }
  return <Badge variant='destructive'>未联通</Badge>
}

function DetailBlock({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-md border bg-background p-4', className)}>
      <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h4 className='text-sm font-semibold'>{title}</h4>
          {subtitle && (
            <div className='mt-1 text-xs leading-5 text-muted-foreground'>
              {subtitle}
            </div>
          )}
        </div>
        {action && (
          <div className='flex shrink-0 flex-wrap justify-end gap-2'>
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

const profileConfigSectionTitle: Record<ProfileConfigSection, string> = {
  ownership: '编辑归属与负责人',
  governance: '编辑治理与检测',
  access: '编辑接入方式',
  connectivity: '编辑连通性说明',
}

function profileConfigInitialForm(
  asset: AgentAsset,
  section: ProfileConfigSection
): Record<string, string> {
  const runtimeConfig = runtimeConfigOf(asset)
  const probe = probeOf(runtimeConfig)
  if (section === 'ownership') {
    return {
      department: ownerByType(asset, 'business')?.department || '',
      businessSystem: asset.businessSystem || '',
      businessScene: asset.businessScene || '',
      platformFamily: asset.platformFamily || '',
      businessOwner:
        ownerDisplay(asset, 'business') === '未指派'
          ? ''
          : ownerDisplay(asset, 'business'),
      developerOwner:
        ownerDisplay(asset, 'developer') === '未指派'
          ? ''
          : ownerDisplay(asset, 'developer'),
      securityOwner:
        ownerDisplay(asset, 'security') === '未指派'
          ? ''
          : ownerDisplay(asset, 'security'),
      opsOwner:
        ownerDisplay(asset, 'ops') === '未指派'
          ? ''
          : ownerDisplay(asset, 'ops'),
    }
  }
  if (section === 'governance') {
    return {
      runtimeStatus: asset.runtimeStatus || 'not_launched',
      admissionStatus: asset.admissionStatus || 'not_checked',
      environment: asset.environment || 'test',
      riskLevel: asset.riskLevel || 'normal',
      version: asset.version || '',
      exposureLevel: asset.exposureLevel || 'internal',
      exposureSurface: asset.exposureSurface || '',
      nextDetect:
        assetMetadataText(asset, [
          'nextDetect',
          'nextDetectAt',
          'nextDetectionAt',
        ]) || '',
    }
  }
  if (section === 'access') {
    return {
      method: displayUnknown(runtimeConfig.method, 'api'),
      agentType: displayUnknown(
        runtimeConfig.agentType,
        platformToRuntimeAgentType(asset.platformFamily)
      ),
      apiBaseUrl: displayUnknown(runtimeConfig.apiBaseUrl, ''),
      webhookUrl: displayUnknown(runtimeConfig.webhookUrl, ''),
      chatPath: displayUnknown(runtimeConfig.chatPath, '/v1/chat/completions'),
      webhookPath: displayUnknown(runtimeConfig.webhookPath, ''),
      authType: displayUnknown(runtimeConfig.authType, 'api_key'),
      authHeaderName: displayUnknown(
        runtimeConfig.authHeaderName,
        'Authorization'
      ),
      apiKey: '',
      userId: displayUnknown(runtimeConfig.userId, 'dodoguard-test-user'),
      conversationId: displayUnknown(runtimeConfig.conversationId, ''),
    }
  }
  return {
    testPrompt: displayUnknown(
      runtimeConfig.testPrompt,
      'DodoGuard connection test ping'
    ),
    connMsg: displayUnknown(runtimeConfig.connMsg || probe?.message, ''),
    lastConnTest: displayUnknown(
      runtimeConfig.lastConnTest || probe?.checkedAt,
      ''
    ),
    endpoint: displayUnknown(
      probe?.endpoint || runtimeEndpoint(runtimeConfig),
      ''
    ),
  }
}

function profileConfigPayload(
  asset: AgentAsset,
  section: ProfileConfigSection,
  form: Record<string, string>
): Partial<AssetAgentPayload> {
  const runtimeConfig = runtimeConfigOf(asset)
  if (section === 'ownership') {
    return {
      businessSystem: form.businessSystem,
      businessScene: form.businessScene,
      platformFamily: form.platformFamily || asset.platformFamily,
      owners: [
        {
          ownerType: 'business',
          ownerName: form.businessOwner,
          department: form.department,
        },
        {
          ownerType: 'developer',
          ownerName: form.developerOwner,
          department: form.department,
        },
        {
          ownerType: 'security',
          ownerName: form.securityOwner,
          department: form.department,
          isPrimary: true,
        },
        {
          ownerType: 'ops',
          ownerName: form.opsOwner,
          department: form.department,
        },
      ],
    }
  }
  if (section === 'governance') {
    return {
      runtimeStatus: form.runtimeStatus,
      admissionStatus: form.admissionStatus,
      environment: form.environment,
      riskLevel: form.riskLevel,
      version: form.version,
      exposureLevel: form.exposureLevel,
      exposureSurface: form.exposureSurface,
      metadata: {
        ...asset.metadata,
        nextDetect: form.nextDetect,
      },
    }
  }
  if (section === 'access') {
    return {
      metadata: {
        ...asset.metadata,
        runtimeConfig: {
          ...runtimeConfig,
          method: form.method,
          agentType: form.agentType,
          apiBaseUrl: form.apiBaseUrl,
          webhookUrl: form.webhookUrl,
          chatPath: form.chatPath,
          webhookPath: form.webhookPath,
          authType: form.authType,
          authHeaderName: form.authHeaderName,
          apiKey: form.apiKey.trim()
            ? form.apiKey.trim()
            : runtimeConfig.apiKey,
          userId: form.userId,
          conversationId: form.conversationId,
          enabled: true,
        },
      },
    }
  }
  return {
    metadata: {
      ...asset.metadata,
      runtimeConfig: {
        ...runtimeConfig,
        testPrompt: form.testPrompt,
        connMsg: form.connMsg,
        lastConnTest: form.lastConnTest,
        lastProbe:
          runtimeConfig.lastProbe &&
          typeof runtimeConfig.lastProbe === 'object' &&
          !Array.isArray(runtimeConfig.lastProbe)
            ? {
                ...(runtimeConfig.lastProbe as Record<string, unknown>),
                message:
                  form.connMsg ||
                  (runtimeConfig.lastProbe as Record<string, unknown>).message,
                endpoint:
                  form.endpoint ||
                  (runtimeConfig.lastProbe as Record<string, unknown>).endpoint,
              }
            : runtimeConfig.lastProbe,
      },
    },
  }
}

function ProfileConfigDialog({
  asset,
  section,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  asset: AgentAsset | null
  section: ProfileConfigSection | null
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (payload: Partial<AssetAgentPayload>) => void
}) {
  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (asset && section) {
      setForm(profileConfigInitialForm(asset, section))
    }
  }, [asset, section])

  const setField = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))
  const submit = () => {
    if (!asset || !section) {
      return
    }
    onSave(profileConfigPayload(asset, section, form))
  }

  return (
    <Dialog open={open && !!asset && !!section} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] w-[min(96vw,760px)] max-w-[min(96vw,760px)] overflow-y-auto'>
        {asset && section && (
          <>
            <DialogHeader>
              <DialogTitle>{profileConfigSectionTitle[section]}</DialogTitle>
              <DialogDescription>
                {asset.name} · 仅维护当前区域相关配置。
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-4 py-2'>
              {section === 'ownership' && (
                <div className='grid gap-3'>
                  <AgentOwnershipFields
                    layout='grid-2'
                    value={{
                      department: form.department || '',
                      businessSystem: form.businessSystem || '',
                      businessScene: form.businessScene || '',
                      owners: [
                        {
                          ownerType: 'business',
                          ownerName: form.businessOwner || '',
                        },
                        {
                          ownerType: 'developer',
                          ownerName: form.developerOwner || '',
                        },
                        {
                          ownerType: 'security',
                          ownerName: form.securityOwner || '',
                          isPrimary: true,
                        },
                        { ownerType: 'ops', ownerName: form.opsOwner || '' },
                      ],
                    }}
                    onChange={(next) =>
                      setForm({
                        ...form,
                        department: next.department,
                        businessSystem: next.businessSystem,
                        businessScene: next.businessScene,
                        businessOwner:
                          next.owners.find(
                            (owner) => owner.ownerType === 'business'
                          )?.ownerName || '',
                        developerOwner:
                          next.owners.find(
                            (owner) => owner.ownerType === 'developer'
                          )?.ownerName || '',
                        securityOwner:
                          next.owners.find(
                            (owner) => owner.ownerType === 'security'
                          )?.ownerName || '',
                        opsOwner:
                          next.owners.find((owner) => owner.ownerType === 'ops')
                            ?.ownerName || '',
                      })
                    }
                  />
                  <Field label='平台类型'>
                    <Select
                      value={form.platformFamily || asset.platformFamily}
                      onValueChange={(value) =>
                        setField('platformFamily', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {platformOptions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}

              {section === 'governance' && (
                <div className='grid gap-3 md:grid-cols-2'>
                  <Field label='运行状态'>
                    <Select
                      value={form.runtimeStatus || 'not_launched'}
                      onValueChange={(value) =>
                        setField('runtimeStatus', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {runtimeOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='放行结论'>
                    <Select
                      value={form.admissionStatus || 'not_checked'}
                      onValueChange={(value) =>
                        setField('admissionStatus', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {admissionOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='部署环境'>
                    <Select
                      value={form.environment || 'test'}
                      onValueChange={(value) => setField('environment', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {environmentOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='风险等级'>
                    <Select
                      value={form.riskLevel || 'normal'}
                      onValueChange={(value) => setField('riskLevel', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {riskOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='当前版本'>
                    <Input
                      value={form.version || ''}
                      onChange={(event) =>
                        setField('version', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='对外开放'>
                    <Select
                      value={form.exposureLevel || 'internal'}
                      onValueChange={(value) =>
                        setField('exposureLevel', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {exposureOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='下次应检'>
                    <Input
                      value={form.nextDetect || ''}
                      onChange={(event) =>
                        setField('nextDetect', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='暴露面说明' className='md:col-span-2'>
                    <Textarea
                      rows={3}
                      value={form.exposureSurface || ''}
                      onChange={(event) =>
                        setField('exposureSurface', event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              {section === 'access' && (
                <div className='grid gap-3 md:grid-cols-2'>
                  <Field label='接入方式'>
                    <Select
                      value={form.method || 'api'}
                      onValueChange={(value) => setField('method', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='api'>API 接入</SelectItem>
                        <SelectItem value='sdk'>SDK 接入</SelectItem>
                        <SelectItem value='webhook'>Webhook</SelectItem>
                        <SelectItem value='proxy'>代理模式</SelectItem>
                        <SelectItem value='platform'>平台接入</SelectItem>
                        <SelectItem value='offline'>离线评测</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='连接器类型'>
                    <Select
                      value={form.agentType || 'api'}
                      onValueChange={(value) => setField('agentType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='dify'>Dify</SelectItem>
                        <SelectItem value='coze'>Coze</SelectItem>
                        <SelectItem value='n8n'>N8N</SelectItem>
                        <SelectItem value='fastgpt'>FastGPT</SelectItem>
                        <SelectItem value='tencent-adp'>腾讯 ADP</SelectItem>
                        <SelectItem value='api'>通用 HTTP API</SelectItem>
                        <SelectItem value='api-stream'>通用流式 API</SelectItem>
                        <SelectItem value='langchain'>LangChain</SelectItem>
                        <SelectItem value='custom'>Custom</SelectItem>
                        <SelectItem value='other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='API Base URL' className='md:col-span-2'>
                    <Input
                      value={form.apiBaseUrl || ''}
                      onChange={(event) =>
                        setField('apiBaseUrl', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='Webhook URL' className='md:col-span-2'>
                    <Input
                      value={form.webhookUrl || ''}
                      onChange={(event) =>
                        setField('webhookUrl', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='Chat Path'>
                    <Input
                      value={form.chatPath || ''}
                      onChange={(event) =>
                        setField('chatPath', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='Webhook Path'>
                    <Input
                      value={form.webhookPath || ''}
                      onChange={(event) =>
                        setField('webhookPath', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='鉴权方式'>
                    <Select
                      value={form.authType || 'api_key'}
                      onValueChange={(value) => setField('authType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='api_key'>Bearer API Key</SelectItem>
                        <SelectItem value='header'>自定义 Header</SelectItem>
                        <SelectItem value='basic'>Basic</SelectItem>
                        <SelectItem value='oauth'>OAuth</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label='Header 名称'>
                    <Input
                      value={form.authHeaderName || ''}
                      onChange={(event) =>
                        setField('authHeaderName', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='API Key / Token'>
                    <Input
                      type='password'
                      value={form.apiKey || ''}
                      placeholder='留空则不修改'
                      onChange={(event) =>
                        setField('apiKey', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='User ID'>
                    <Input
                      value={form.userId || ''}
                      onChange={(event) =>
                        setField('userId', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='Conversation ID' className='md:col-span-2'>
                    <Input
                      value={form.conversationId || ''}
                      onChange={(event) =>
                        setField('conversationId', event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}

              {section === 'connectivity' && (
                <div className='grid gap-3'>
                  <Field label='测试指令'>
                    <Input
                      value={form.testPrompt || ''}
                      onChange={(event) =>
                        setField('testPrompt', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='测试端点'>
                    <Input
                      value={form.endpoint || ''}
                      onChange={(event) =>
                        setField('endpoint', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='最近测试时间'>
                    <Input
                      value={form.lastConnTest || ''}
                      onChange={(event) =>
                        setField('lastConnTest', event.target.value)
                      }
                    />
                  </Field>
                  <Field label='连通性说明'>
                    <Textarea
                      rows={4}
                      value={form.connMsg || ''}
                      onChange={(event) =>
                        setField('connMsg', event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AssetBaseArchive({
  asset,
  onEditSection,
  onCreateDetection,
}: {
  asset: AgentAsset
  onEditSection: (section: ProfileConfigSection) => void
  onCreateDetection: () => void
}) {
  const runtimeConfig = runtimeConfigOf(asset)
  const probe = probeOf(runtimeConfig)
  const configFiles = configFilesOf(asset)
  const openRiskCount =
    assetMetadataNumber(asset, [
      'openRiskCount',
      'openRisks',
      'riskOpenCount',
    ]) ?? 0
  const highRiskCount =
    assetMetadataNumber(asset, ['highRiskCount', 'criticalRiskCount']) ??
    (asset.components || []).filter((component) => component.highRisk).length
  const lastDetect =
    assetMetadataText(asset, [
      'lastDetect',
      'lastDetectedAt',
      'lastDetectionAt',
    ]) ||
    asset.events?.find((event) => event.eventType.includes('detect'))?.createdAt
  const nextDetect =
    assetMetadataText(asset, [
      'nextDetect',
      'nextDetectAt',
      'nextDetectionAt',
    ]) || '未设置'
  const runtimeFields = runtimeTypeFields(runtimeConfig)

  return (
    <div>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-semibold'>基础档案</h4>
        <p className='text-xs text-muted-foreground'>
          归属与负责人、治理与风险、接入方式、连通性说明
        </p>
      </div>
      <div className='grid gap-3 lg:grid-cols-2'>
        <DetailBlock
          title='归属与负责人'
          subtitle={
            <>
              {asset.name} · {asset.businessSystem || '未设置业务系统'} ·{' '}
              {asset.owners?.length ? '负责人已登记' : '负责人待补全'}
            </>
          }
          action={
            <Button
              variant='outline'
              size='sm'
              onClick={() => onEditSection('ownership')}
            >
              <Pencil className='mr-2 h-4 w-4' />
              编辑配置
            </Button>
          }
        >
          <div className='grid gap-3 md:grid-cols-2'>
            <PortraitLine
              label='所属部门'
              value={ownerByType(asset, 'business')?.department || '未设置'}
            />
            <PortraitLine
              label='业务系统'
              value={asset.businessSystem || '未设置'}
            />
            <PortraitLine
              label='业务场景'
              value={asset.businessScene || '未设置'}
            />
            <PortraitLine
              label='平台类型'
              value={asset.platformFamily || '未设置'}
            />
            <PortraitLine
              label='业务负责人'
              value={ownerDisplay(asset, 'business')}
            />
            <PortraitLine
              label='开发负责人'
              value={ownerDisplay(asset, 'developer')}
            />
            <PortraitLine
              label='安全负责人'
              value={ownerDisplay(asset, 'security')}
            />
            <PortraitLine
              label='运维负责人'
              value={ownerDisplay(asset, 'ops')}
            />
          </div>
        </DetailBlock>

        <DetailBlock
          title='治理与检测'
          subtitle={
            <>
              {ledgerRuntimeLabel(asset.runtimeStatus)} ·{' '}
              {ledgerAdmissionLabel(asset.admissionStatus)} ·{' '}
              {labelFrom(riskOptions, asset.riskLevel)}
            </>
          }
          action={
            <>
              <Button variant='outline' size='sm' onClick={onCreateDetection}>
                <ScanSearch className='mr-2 h-4 w-4' />
                发起检测
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => onEditSection('governance')}
              >
                <Pencil className='mr-2 h-4 w-4' />
                编辑配置
              </Button>
            </>
          }
        >
          <div className='grid gap-3 md:grid-cols-2'>
            <PortraitLine
              label='运行状态'
              value={ledgerRuntimeLabel(asset.runtimeStatus)}
            />
            <PortraitLine
              label='放行结论'
              value={ledgerAdmissionLabel(asset.admissionStatus)}
            />
            <PortraitLine
              label='部署环境'
              value={labelFrom(environmentOptions, asset.environment)}
            />
            <PortraitLine
              label='风险等级'
              value={labelFrom(riskOptions, asset.riskLevel)}
            />
            <PortraitLine label='当前版本' value={asset.version || '未设置'} />
            <PortraitLine
              label='对外开放'
              value={labelFrom(exposureOptions, asset.exposureLevel)}
            />
            <PortraitLine label='未关闭风险' value={`${openRiskCount} 项`} />
            <PortraitLine label='高危信号' value={`${highRiskCount} 项`} />
            <PortraitLine
              label='最近检测'
              value={lastDetect ? formatAssetTime(lastDetect) : '未记录'}
            />
            <PortraitLine label='下次应检' value={nextDetect} />
          </div>
        </DetailBlock>

        <DetailBlock
          title='接入方式'
          subtitle={
            <>
              {runtimeConnectorLabel(runtimeConfig, asset)} ·{' '}
              {accessMethodLabel(runtimeConfig)} · API / 配置文件 / 凭据
            </>
          }
          action={
            <Button
              variant='outline'
              size='sm'
              onClick={() => onEditSection('access')}
            >
              <Pencil className='mr-2 h-4 w-4' />
              编辑配置
            </Button>
          }
        >
          <div className='grid gap-3 md:grid-cols-2'>
            <PortraitLine
              label='接入方式'
              value={accessMethodLabel(runtimeConfig)}
            />
            <PortraitLine
              label='连接器类型'
              value={runtimeConnectorLabel(runtimeConfig, asset)}
            />
            <PortraitLine
              label='Base URL'
              value={displayUnknown(runtimeConfig.apiBaseUrl)}
            />
            <PortraitLine
              label='调用入口'
              value={runtimeEndpoint(runtimeConfig)}
            />
            <PortraitLine
              label='鉴权方式'
              value={displayUnknown(
                runtimeConfig.authType || runtimeConfig.authHeaderName,
                '未配置'
              )}
            />
            <PortraitLine
              label='凭据状态'
              value={maskSecret(
                runtimeConfig.apiKey ||
                  runtimeConfig.tencentSecretId ||
                  runtimeConfig.tencentSecretKey
              )}
            />
            {runtimeFields.map(([label, value]) => (
              <PortraitLine key={label} label={label} value={value} />
            ))}
            <PortraitLine
              label='配置文件'
              value={
                configFiles.length
                  ? `${configFiles.length} 个配置附件`
                  : '未上传'
              }
            />
          </div>
        </DetailBlock>

        <DetailBlock
          title='连通性说明'
          subtitle={
            <div className='flex flex-wrap items-center gap-2'>
              {connectionStatusBadge(probe)}
              <span>
                {displayUnknown(
                  probe?.checkedAt ||
                    runtimeConfig.lastConnTest ||
                    runtimeConfig.updatedAt,
                  '尚未执行联通性测试'
                )}
              </span>
            </div>
          }
          action={
            <Button
              variant='outline'
              size='sm'
              onClick={() => onEditSection('connectivity')}
            >
              <Pencil className='mr-2 h-4 w-4' />
              编辑配置
            </Button>
          }
        >
          <div className='grid gap-3'>
            <div className='grid gap-3 md:grid-cols-2'>
              <PortraitLine
                label='测试端点'
                value={displayUnknown(
                  probe?.endpoint || runtimeEndpoint(runtimeConfig),
                  '未返回 endpoint'
                )}
              />
              <PortraitLine
                label='响应耗时'
                value={
                  probe?.durationMs || probe?.responseTime
                    ? `${displayUnknown(probe.durationMs || probe.responseTime)}ms`
                    : '未记录'
                }
              />
              <PortraitLine
                label='HTTP 状态'
                value={
                  probe?.httpStatus
                    ? `HTTP ${displayUnknown(probe.httpStatus)}`
                    : '未记录'
                }
              />
              <PortraitLine
                label='测试指令'
                value={displayUnknown(runtimeConfig.testPrompt)}
              />
            </div>
            <div className='rounded-md border bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground'>
              <div className='font-medium text-foreground'>
                {displayUnknown(
                  probe?.message || runtimeConfig.connMsg,
                  '尚未执行联通性测试'
                )}
              </div>
              {Boolean(probe?.preview) && (
                <pre className='mt-2 max-h-24 overflow-auto rounded bg-background p-2 text-xs whitespace-pre-wrap'>
                  {displayUnknown(probe?.preview)}
                </pre>
              )}
            </div>
          </div>
        </DetailBlock>
      </div>
    </div>
  )
}

function componentTypeLabel(type?: string | null) {
  return (
    componentTypeOptions.find(([value]) => value === type)?.[1] ||
    type ||
    '组件'
  )
}

function componentChecks(component: AgentAssetComponent) {
  const checks = component.configSnapshot?.checks
  if (Array.isArray(checks)) {
    return checks.map((item) => String(item)).filter(Boolean)
  }
  return []
}

function componentPermission(component: AgentAssetComponent) {
  const permission = component.permissionScope
  if (!permission) {
    return '未设置'
  }
  if (
    typeof permission.description === 'string' &&
    permission.description.trim()
  ) {
    return permission.description
  }
  return displayUnknown(permission)
}

function AssetComponentProfile({ asset }: { asset: AgentAsset }) {
  const components = asset.components || []
  if (!components.length) {
    return <p className='text-sm text-muted-foreground'>暂无能力组件明细</p>
  }

  return (
    <div className='grid gap-2'>
      {components.map((component) => {
        const checks = componentChecks(component)
        return (
          <div
            key={component.id}
            className='rounded-md border bg-background p-3'
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='min-w-0'>
                <div className='truncate text-sm font-semibold'>
                  {component.componentName}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {componentTypeLabel(component.componentType)}
                  {component.componentKey ? ` · ${component.componentKey}` : ''}
                  {component.version ? ` · ${component.version}` : ''}
                </div>
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {component.highRisk && (
                  <Badge variant='destructive'>高危</Badge>
                )}
                {component.sensitiveLevel && (
                  <Badge variant='outline'>{component.sensitiveLevel}</Badge>
                )}
                {component.sourceType && (
                  <Badge variant='secondary'>{component.sourceType}</Badge>
                )}
              </div>
            </div>
            <div className='mt-2 grid gap-1.5 text-xs text-muted-foreground md:grid-cols-2'>
              <div className='break-words'>
                权限范围：{componentPermission(component)}
              </div>
              <div className='break-words'>
                风险项：
                {displayUnknown(
                  component.configSnapshot?.riskTitle,
                  component.sourceRefId ? '能力组件风险' : '未关联'
                )}
              </div>
              <div className='break-words md:col-span-2'>
                检查项：{checks.length ? checks.join(' / ') : '未配置'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AssetPortraitGrid({ asset }: { asset: AgentAsset }) {
  const metadata = asset.metadata || {}
  const runtimeConfig =
    metadata.runtimeConfig &&
    typeof metadata.runtimeConfig === 'object' &&
    !Array.isArray(metadata.runtimeConfig)
      ? (metadata.runtimeConfig as Record<string, unknown>)
      : {}
  const configFiles = Array.isArray(metadata.configFiles)
    ? metadata.configFiles
    : []
  const openRiskCount = assetMetadataNumber(asset, [
    'openRiskCount',
    'openRisks',
    'riskOpenCount',
  ])
  const highRiskCount = assetMetadataNumber(asset, [
    'highRiskCount',
    'criticalRiskCount',
  ])
  const lastDetect =
    assetMetadataText(asset, [
      'lastDetect',
      'lastDetectedAt',
      'lastDetectionAt',
    ]) ||
    asset.events?.find((event) => event.eventType.includes('detect'))?.createdAt
  const promptTypes = assetMetadataList(asset, [
    'promptTypes',
    'prompts',
    'promptProfile',
  ])
  const dataCategories = assetMetadataList(asset, [
    'dataCategories',
    'sensitiveDataTypes',
    'dataTypes',
  ])
  const memoryTypes = assetMetadataList(asset, ['memoryTypes', 'memoryStores'])
  const permissionScopes = assetMetadataList(asset, [
    'permissionScopes',
    'roles',
    'accessScopes',
  ])
  const auditRetention =
    assetMetadataText(asset, ['auditRetention', 'logRetention']) ||
    displayUnknown(runtimeConfig.auditRetention)

  return (
    <div>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <h4 className='text-sm font-semibold'>Agent 资产画像</h4>
        <p className='text-xs text-muted-foreground'>
          基本、模型、Prompt、能力、知识、数据、权限、记忆、暴露、风险、合规、审计
        </p>
      </div>
      <div className='grid gap-3 lg:grid-cols-3'>
        <PortraitCard title='基本画像'>
          <PortraitLine
            label='类型/版本'
            value={`${labelFrom(agentTypeOptions, asset.agentType)} · ${asset.version || '未设置'}`}
          />
          <PortraitLine
            label='业务场景'
            value={asset.businessScene || '未设置'}
          />
          <PortraitLine
            label='功能介绍'
            value={asset.functionIntro || '未设置'}
          />
        </PortraitCard>
        <PortraitCard title='模型画像'>
          <PortraitLine
            label='默认模型'
            value={asset.defaultModel || displayUnknown(runtimeConfig.model)}
          />
          <PortraitLine
            label='接入类型'
            value={displayUnknown(
              runtimeConfig.agentType ||
                runtimeConfig.protocol ||
                asset.platformFamily
            )}
          />
          <PortraitLine
            label='模型策略'
            value={
              assetMetadataText(asset, ['modelPolicy', 'modelProfile']) ||
              displayUnknown(runtimeConfig.toolChoice)
            }
          />
        </PortraitCard>
        <PortraitCard title='Prompt 画像'>
          <PortraitLine
            label='Prompt 类型'
            value={
              promptTypes.length
                ? promptTypes.join(' / ')
                : '系统、安全、工具、RAG Prompt 已登记'
            }
          />
          <PortraitLine
            label='配置文件'
            value={
              configFiles.length ? `${configFiles.length} 个配置附件` : '未上传'
            }
          />
          <PortraitLine
            label='测试指令'
            value={displayUnknown(runtimeConfig.testPrompt)}
          />
        </PortraitCard>
        <PortraitCard title='能力画像' className='lg:col-span-2'>
          <AssetComponentProfile asset={asset} />
        </PortraitCard>
        <PortraitCard title='知识画像'>
          <PortraitLine
            label='知识库'
            value={`${(asset.components || []).filter((item) => item.componentType === 'knowledge_base').length} 个`}
          />
          <PortraitLine
            label='检索范围'
            value={
              assetMetadataText(asset, ['knowledgeScope', 'ragScope']) ||
              '未设置'
            }
          />
          <PortraitLine
            label='敏感级别'
            value={
              assetMetadataText(asset, [
                'knowledgeSensitiveLevel',
                'ragSensitiveLevel',
              ]) || (asset.sensitiveData ? '涉敏' : '未标记涉敏')
            }
          />
        </PortraitCard>
        <PortraitCard title='数据画像'>
          <PortraitLine
            label='是否涉敏'
            value={asset.sensitiveData ? '是' : '否'}
          />
          <PortraitLine
            label='数据类型'
            value={
              dataCategories.length
                ? dataCategories.join(' / ')
                : asset.sensitiveData
                  ? '敏感数据类型待补充'
                  : '未设置'
            }
          />
          <PortraitLine
            label='输入参数'
            value={displayUnknown(runtimeConfig.inputs, '未设置')}
          />
        </PortraitCard>
        <PortraitCard title='权限画像'>
          <PortraitLine
            label='访问角色'
            value={
              permissionScopes.length ? permissionScopes.join(' / ') : '未设置'
            }
          />
          <PortraitLine
            label='鉴权方式'
            value={displayUnknown(
              runtimeConfig.authType || runtimeConfig.authHeaderName
            )}
          />
          <PortraitLine
            label='凭据状态'
            value={maskSecret(
              runtimeConfig.apiKey ||
                runtimeConfig.tencentSecretId ||
                runtimeConfig.tencentSecretKey
            )}
          />
        </PortraitCard>
        <PortraitCard title='记忆画像'>
          <PortraitLine
            label='记忆类型'
            value={memoryTypes.length ? memoryTypes.join(' / ') : '未设置'}
          />
          <PortraitLine
            label='会话 ID'
            value={displayUnknown(runtimeConfig.conversationId)}
          />
          <PortraitLine
            label='用户标识'
            value={displayUnknown(runtimeConfig.userId)}
          />
        </PortraitCard>
        <PortraitCard title='暴露画像'>
          <PortraitLine
            label='暴露级别'
            value={labelFrom(exposureOptions, asset.exposureLevel)}
          />
          <PortraitLine
            label='入口'
            value={
              asset.exposureSurface ||
              displayUnknown(
                runtimeConfig.apiBaseUrl || runtimeConfig.webhookUrl
              )
            }
          />
          <PortraitLine
            label='环境'
            value={labelFrom(environmentOptions, asset.environment)}
          />
        </PortraitCard>
        <PortraitCard title='风险画像'>
          <PortraitLine
            label='风险等级'
            value={labelFrom(riskOptions, asset.riskLevel)}
          />
          <PortraitLine label='未关闭' value={`${openRiskCount ?? 0} 项`} />
          <PortraitLine
            label='高危信号'
            value={`${highRiskCount ?? (asset.components || []).filter((item) => item.highRisk).length} 项`}
          />
        </PortraitCard>
        <PortraitCard title='合规画像'>
          <PortraitLine
            label='合规场景'
            value={
              asset.businessScene ||
              labelFrom(exposureOptions, asset.exposureLevel)
            }
          />
          <PortraitLine
            label='放行结论'
            value={ledgerAdmissionLabel(asset.admissionStatus)}
          />
          <PortraitLine
            label='检测状态'
            value={labelFrom(admissionOptions, asset.admissionStatus)}
          />
        </PortraitCard>
        <PortraitCard title='审计画像'>
          <PortraitLine
            label='最近检测'
            value={lastDetect ? formatAssetTime(lastDetect) : '未记录'}
          />
          <PortraitLine label='日志留存' value={auditRetention} />
          <PortraitLine
            label='最近更新'
            value={formatAssetTime(asset.updatedAt)}
          />
        </PortraitCard>
      </div>
    </div>
  )
}

export function countComponents(asset: AgentAsset) {
  return (asset.components || []).reduce<Record<string, number>>(
    (acc, component) => {
      acc[component.componentType] = (acc[component.componentType] || 0) + 1
      return acc
    },
    {}
  )
}

function isPendingSecurityAck(asset: AgentAsset) {
  const metadata = asset.metadata || {}
  const status =
    metadata.secAckStatus || metadata.securityAckStatus || metadata.ackStatus
  return (
    status === '待安全知晓' || status === 'pending' || status === 'pending_ack'
  )
}

export function AssetProfilePage({ assetId }: { assetId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editingAsset, setEditingAsset] = useState<AgentAsset | null>(null)
  const [editingSection, setEditingSection] =
    useState<ProfileConfigSection | null>(null)
  const [dialogueWizardOpen, setDialogueWizardOpen] = useState(false)

  const assetQuery = useQuery({
    queryKey: ['asset-agent', assetId],
    queryFn: () => assetIntakeApi.getAgent(assetId),
  })
  const asset = assetQuery.data || null

  const updateAssetMutation = useMutation({
    mutationFn: ({
      assetId,
      payload,
    }: {
      assetId: string
      payload: Partial<AssetAgentPayload>
    }) => assetIntakeApi.updateAgent(assetId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-agent', assetId] })
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] })
      setEditingSection(null)
      toast.success('画像配置已保存')
    },
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  })

  return (
    <>
      <HeaderFrame />
      <Main className='flex flex-1 flex-col gap-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <Button
              variant='ghost'
              className='mb-2 -ml-3'
              onClick={() => navigate({ to: '/assets/ledger' })}
            >
              <ArrowLeft className='mr-2 h-4 w-4' />
              返回资产台账
            </Button>
            <h1 className='text-2xl font-semibold tracking-tight'>资产风险画像</h1>
            <p className='text-sm text-muted-foreground'>
              集中查看 Agent 基础档案、治理流程，以及来自风险闭环工作台的六域风险数据。
            </p>
          </div>
        </div>

        {assetQuery.isLoading ? (
          <div className='grid gap-3'>
            <Skeleton className='h-40 w-full' />
            <Skeleton className='h-72 w-full' />
          </div>
        ) : assetQuery.error ? (
          <div className='rounded-md border border-destructive/30 p-4 text-sm text-destructive'>
            资产画像加载失败
          </div>
        ) : asset ? (
          <AssetProfilePanel
            asset={asset}
            onEdit={() => setEditingAsset(asset)}
            onEditSection={setEditingSection}
            onCreateDetection={() => setDialogueWizardOpen(true)}
          />
        ) : (
          <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
            未找到该资产
          </div>
        )}
      </Main>

      <ProfileConfigDialog
        asset={asset}
        section={editingSection}
        open={!!editingSection}
        saving={updateAssetMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setEditingSection(null)
          }
        }}
        onSave={(payload) => {
          if (!asset) {
            return
          }
          updateAssetMutation.mutate({
            assetId: asset.id,
            payload,
          })
        }}
      />
      <DialogueSecurityWizardDialog
        open={dialogueWizardOpen && !!asset}
        onOpenChange={setDialogueWizardOpen}
        initialAssetId={asset?.id}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['asset-agent', assetId] })
          queryClient.invalidateQueries({ queryKey: ['asset-agents'] })
          queryClient.invalidateQueries({ queryKey: ['security-scan-tasks'] })
          queryClient.invalidateQueries({ queryKey: ['security-scan-findings'] })
          queryClient.invalidateQueries({ queryKey: ['security-remediations'] })
        }}
      />
      <AssetFormDialog
        open={!!editingAsset}
        onOpenChange={(open) => !open && setEditingAsset(null)}
        asset={editingAsset}
      />
    </>
  )
}

export function AssetLedgerPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [environment, setEnvironment] = useState('all')
  const [riskLevel, setRiskLevel] = useState('all')
  const [platformFamily, setPlatformFamily] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<AgentAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentAsset | null>(null)
  const [summaryAsset, setSummaryAsset] = useState<AgentAsset | null>(null)
  const [ledgerView, setLedgerView] = useState<'table' | 'card'>(readLedgerView)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(10)

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'asset-agents',
      searchTerm,
      environment,
      riskLevel,
      platformFamily,
    ],
    queryFn: () =>
      assetIntakeApi.listAgents({
        search: searchTerm || undefined,
        environment: environment === 'all' ? undefined : environment,
        riskLevel: riskLevel === 'all' ? undefined : riskLevel,
        platformFamily: platformFamily === 'all' ? undefined : platformFamily,
        limit: 50,
      }),
  })
  const pendingDiscoveredQuery = useQuery({
    queryKey: ['asset-discovered', 'pending-count'],
    queryFn: () =>
      assetIntakeApi.listDiscovered({ claimStatus: 'pending', limit: 1 }),
  })

  const deleteMutation = useMutation({
    mutationFn: assetIntakeApi.deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] })
      setDeleteTarget(null)
      toast.success('删除成功')
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  })

  const updateAssetMutation = useMutation({
    mutationFn: ({
      assetId,
      payload,
    }: {
      assetId: string
      payload: Partial<AssetAgentPayload>
    }) => assetIntakeApi.updateAgent(assetId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-agents'] })
      toast.success('Agent 状态已更新')
    },
    onError: (error: Error) => toast.error(error.message || '更新失败'),
  })

  const assets = data?.data || []
  const pendingClaim = pendingDiscoveredQuery.data?.total || 0
  const pendingAck = assets.filter(isPendingSecurityAck).length
  const pendingIntake = pendingClaim + pendingAck
  const stats = {
    managed: data?.total || 0,
    pendingIntake,
    pendingClaim,
    pendingAck,
    running: assets.filter((asset) => asset.runtimeStatus === 'running').length,
    highRisk: assets.filter((asset) =>
      ['high', 'critical'].includes(asset.riskLevel)
    ).length,
  }

  useEffect(() => {
    setLedgerPage(1)
  }, [searchTerm, environment, riskLevel, platformFamily])

  const ledgerTotal = assets.length
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerTotal / ledgerPageSize) || 1)
  const safeLedgerPage = Math.min(ledgerPage, ledgerTotalPages)
  const ledgerPageStart =
    ledgerTotal === 0 ? 0 : (safeLedgerPage - 1) * ledgerPageSize
  const ledgerPageEnd =
    ledgerTotal === 0
      ? 0
      : Math.min(ledgerPageStart + ledgerPageSize, ledgerTotal)
  const pagedAssets = assets.slice(ledgerPageStart, ledgerPageEnd)

  useEffect(() => {
    if (ledgerPage !== safeLedgerPage) {
      setLedgerPage(safeLedgerPage)
    }
  }, [ledgerPage, safeLedgerPage])

  const setLedgerViewPreference = (view: 'table' | 'card') => {
    setLedgerView(view)
    try {
      localStorage.setItem(LEDGER_VIEW_STORAGE_KEY, view)
    } catch {
      // ignore storage failures
    }
  }

  const renderRowActions = (asset: AgentAsset) => (
    <AssetLedgerRowActions
      asset={asset}
      riskOptions={riskOptions}
      admissionOptions={admissionOptions}
      runtimeOptions={runtimeOptions}
      onCreatePeriodic={(next) => {
        void navigate({
          to: '/launch-monitoring',
          search: { create: true, assetId: next.id },
        })
      }}
      onCreateTechnical={(next) => {
        void navigate({
          to: '/scan/technical-risks',
          search: { create: true, assetId: next.id },
        })
      }}
      onCreateCompliance={(next) => {
        void navigate({
          to: '/scan/compliance-tasks',
          search: { create: true, assetId: next.id },
        })
      }}
      onGoRemediation={() =>
        navigate({
          to: '/scan/remediation',
          search: {
            tab: undefined,
            taskId: undefined,
            riskId: undefined,
          },
        })
      }
      onOpenProfile={(next) =>
        navigate({
          to: '/assets/ledger/$assetId/profile',
          params: { assetId: next.id },
        })
      }
      onUpdateRiskLevel={(next, riskLevelValue) =>
        updateAssetMutation.mutate({
          assetId: next.id,
          payload: { riskLevel: riskLevelValue },
        })
      }
      onUpdateAdmission={(next, admissionStatus) =>
        updateAssetMutation.mutate({
          assetId: next.id,
          payload: { admissionStatus },
        })
      }
      onUpdateRuntime={(next, runtimeStatus) =>
        updateAssetMutation.mutate({
          assetId: next.id,
          payload: { runtimeStatus },
        })
      }
      onEdit={(next) => {
        setEditingAsset(next)
        setDialogOpen(true)
      }}
      onDelete={setDeleteTarget}
    />
  )

  const renderLedgerPagination = () =>
    ledgerTotal > 0 ? (
      <div className='mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          共 {ledgerTotal} 条 · 显示 {ledgerPageStart + 1}-{ledgerPageEnd} · 第{' '}
          {safeLedgerPage}/{ledgerTotalPages} 页
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={String(ledgerPageSize)}
            onValueChange={(value) => {
              setLedgerPageSize(Number(value))
              setLedgerPage(1)
            }}
          >
            <SelectTrigger className='h-8 w-[110px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEDGER_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  每页 {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-2'
            disabled={safeLedgerPage <= 1}
            onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft className='h-4 w-4' />
            上一页
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-2'
            disabled={safeLedgerPage >= ledgerTotalPages}
            onClick={() =>
              setLedgerPage((page) => Math.min(ledgerTotalPages, page + 1))
            }
          >
            下一页
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    ) : null

  return (
    <>
      <HeaderFrame />
      <Main className='flex flex-1 flex-col gap-5'>
        <GovernanceFlowStrip active={0} />

        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>资产管理</h1>
            <p className='text-sm text-muted-foreground'>
              运行台账 · 行内「治理档案」查看单 Agent 全貌 · 上线须完成安全准入
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingAsset(null)
              setDialogOpen(true)
            }}
          >
            <Plus className='mr-2 h-4 w-4' />
            安全手工登记 Agent
          </Button>
        </div>

        <div className='grid gap-3 md:grid-cols-4'>
          <Metric
            icon={Boxes}
            label='纳管智能体'
            value={stats.managed}
            description='全公司台账 · 含发现认领与手工登记'
          />
          <Metric
            icon={UploadCloud}
            label='待入库'
            value={stats.pendingIntake}
            description={
              stats.pendingIntake
                ? `待认领(未纳管) ${stats.pendingClaim} · 待确认(已纳管) ${stats.pendingAck} · 知晓 ≠ 放行`
                : '暂无待认领与待确认'
            }
          />
          <Metric
            icon={LineChart}
            label='运行中'
            value={stats.running}
            description='已放行上线 · 持续运行期检测'
          />
          <Metric
            icon={ShieldCheck}
            label='高危'
            value={stats.highRisk}
            description={
              stats.highRisk
                ? '严重/高危定级 · 须优先治理'
                : '暂无严重/高危定级'
            }
          />
        </div>

        <Card>
          <CardHeader className='gap-3'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <CardTitle className='text-base'>已纳管资产</CardTitle>
              <Tabs
                value={ledgerView}
                onValueChange={(value) =>
                  setLedgerViewPreference(value as 'table' | 'card')
                }
              >
                <TabsList className='h-8' title='切换列表视图'>
                  <TabsTrigger className='px-3 text-xs' value='table'>
                    表格
                  </TabsTrigger>
                  <TabsTrigger className='px-3 text-xs' value='card'>
                    卡片
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-4 [&_[data-slot=select-trigger]]:w-full'>
              <div className='relative'>
                <Filter className='absolute top-2.5 left-3 h-4 w-4 text-muted-foreground' />
                <Input
                  className='pl-9'
                  placeholder='搜索名称、资产编号、业务系统'
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={platformFamily} onValueChange={setPlatformFamily}>
                <SelectTrigger>
                  <SelectValue placeholder='平台类型' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部平台</SelectItem>
                  {platformOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger>
                  <SelectValue placeholder='环境' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部环境</SelectItem>
                  {environmentOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger>
                  <SelectValue placeholder='风险等级' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>全部风险</SelectItem>
                  {riskOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              ledgerView === 'card' ? (
                <div className='asset-ledger-card-grid'>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className='h-[220px] w-full rounded-xl' />
                  ))}
                </div>
              ) : (
                <div className='grid gap-2'>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className='h-12 w-full' />
                  ))}
                </div>
              )
            ) : error ? (
              <div className='rounded-md border border-destructive/30 p-4 text-sm text-destructive'>
                资产列表加载失败
              </div>
            ) : assets.length === 0 ? (
              <div className='flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center'>
                <Archive className='mb-3 h-10 w-10 text-muted-foreground' />
                <h3 className='font-medium'>暂无已纳管资产</h3>
                <p className='mt-1 text-sm text-muted-foreground'>
                  点击“安全手工登记 Agent”录入第一条资产。
                </p>
              </div>
            ) : ledgerView === 'card' ? (
              <>
                <div className='asset-ledger-card-grid'>
                  {pagedAssets.map((asset) => {
                    const openRiskCount =
                      assetMetadataNumber(asset, [
                        'openRiskCount',
                        'openRisks',
                        'riskOpenCount',
                      ]) ?? 0
                    return (
                      <AssetLedgerAgentCard
                        key={asset.id}
                        asset={asset}
                        selected={summaryAsset?.id === asset.id}
                        onSelect={() => setSummaryAsset(asset)}
                        openRiskCount={openRiskCount}
                        admissionLabel={ledgerAdmissionLabel(
                          asset.admissionStatus
                        )}
                        admissionClassName={
                          admissionTone[asset.admissionStatus] || ''
                        }
                        runtimeLabel={ledgerRuntimeLabel(asset.runtimeStatus)}
                        riskLabel={labelFrom(riskOptions, asset.riskLevel)}
                        riskClassName={riskTone[asset.riskLevel] || ''}
                        environmentLabel={labelFrom(
                          environmentOptions,
                          asset.environment
                        )}
                        department={
                          asset.owners?.find(
                            (owner) => owner.ownerType === 'business'
                          )?.department || ''
                        }
                        scene={
                          asset.businessScene || asset.businessSystem || ''
                        }
                        platformToneClassName={platformBadgeTone}
                        actionsMenu={renderRowActions(asset)}
                      />
                    )
                  })}
                </div>
                {renderLedgerPagination()}
              </>
            ) : (
              <>
                <div className='overflow-x-auto rounded-md border'>
                  <Table className='min-w-[1500px]'>
                    <TableHeader>
                      <TableRow className='bg-muted/30'>
                        <TableHead className='w-[190px]'>Agent 名称</TableHead>
                        <TableHead className='w-[130px]'>平台类型</TableHead>
                        <TableHead className='w-[180px]'>所属业务系统</TableHead>
                        <TableHead className='w-[120px]'>部署环境</TableHead>
                        <TableHead className='w-[120px]'>运行状态</TableHead>
                        <TableHead className='w-[130px]'>放行结论</TableHead>
                        <TableHead className='w-[120px]'>未关闭风险</TableHead>
                        <TableHead className='w-[120px]'>风险等级</TableHead>
                        <TableHead className='w-[170px]'>
                          是否接触敏感数据
                        </TableHead>
                        <TableHead className='w-[140px]'>最近检测时间</TableHead>
                        <TableHead className='sticky right-0 z-20 w-[88px] bg-background text-right shadow-[-10px_0_16px_-14px_hsl(var(--foreground))]'>
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedAssets.map((asset) => {
                        const openRiskCount = assetMetadataNumber(asset, [
                          'openRiskCount',
                          'openRisks',
                          'riskOpenCount',
                        ])
                        const lastDetect =
                          assetMetadataText(asset, [
                            'lastDetect',
                            'lastDetectedAt',
                            'lastDetectionAt',
                          ]) ||
                          asset.events?.find((event) =>
                            event.eventType.includes('detect')
                          )?.createdAt

                        return (
                          <TableRow
                            key={asset.id}
                            className='cursor-pointer'
                            onClick={(event) => {
                              const target = event.target as HTMLElement
                              if (
                                target.closest(
                                  'button, input, select, textarea, label, [role="menuitem"], [data-radix-collection-item]'
                                )
                              ) {
                                return
                              }
                              setSummaryAsset(asset)
                            }}
                          >
                            <TableCell className='font-medium'>
                              {asset.name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  'h-6 rounded-md px-2 font-medium',
                                  platformBadgeTone
                                )}
                                variant='outline'
                              >
                                {asset.platformFamily || '未设置'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {asset.businessSystem || '未设置'}
                            </TableCell>
                            <TableCell>
                              {labelFrom(environmentOptions, asset.environment)}
                            </TableCell>
                            <TableCell className='font-medium'>
                              {ledgerRuntimeLabel(asset.runtimeStatus)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  admissionTone[asset.admissionStatus] || ''
                                }
                                variant='secondary'
                              >
                                {ledgerAdmissionLabel(asset.admissionStatus)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  openRiskCount && openRiskCount > 0
                                    ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                }
                                variant='secondary'
                              >
                                {openRiskCount ?? 0}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={riskTone[asset.riskLevel] || ''}
                                variant='secondary'
                              >
                                {labelFrom(riskOptions, asset.riskLevel)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {asset.sensitiveData ? (
                                <Badge
                                  className='bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                  variant='secondary'
                                >
                                  是
                                </Badge>
                              ) : (
                                <span className='text-muted-foreground'>否</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {lastDetect
                                ? formatAssetTime(lastDetect)
                                : '未记录'}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'sticky right-0 z-10 align-top shadow-[-10px_0_16px_-14px_hsl(var(--foreground))]',
                                'bg-background'
                              )}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className='flex justify-end'>
                                {renderRowActions(asset)}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {renderLedgerPagination()}
              </>
            )}
          </CardContent>
        </Card>
      </Main>
      <AssetLedgerDrawer
        asset={summaryAsset}
        open={summaryAsset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSummaryAsset(null)
          }
        }}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除智能体？</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name ?? '该智能体'}
              」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id)
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AssetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editingAsset}
      />
    </>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: LucideIcon
  label: string
  value: number
  description: string
}) {
  return (
    <Card>
      <CardContent className='flex items-center justify-between gap-3 p-4'>
        <div>
          <div className='text-2xl font-semibold'>{value}</div>
          <div className='text-sm text-muted-foreground'>{label}</div>
          <div className='mt-1 text-xs leading-4 text-muted-foreground'>
            {description}
          </div>
        </div>
        <Icon className='h-8 w-8 shrink-0 text-muted-foreground' />
      </CardContent>
    </Card>
  )
}

/** @deprecated Use AssetLedgerPage with tab=inbox */
export function AssetDiscoveredPage() {
  return <AssetInboxPanel />
}

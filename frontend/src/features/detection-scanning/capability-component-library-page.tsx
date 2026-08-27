import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { strFromU8, unzipSync } from 'fflate';
import { Eye, EyeOff, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { GovernanceFlowStrip } from '@/features/shared/governance-flow-strip';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { CapabilityComponentDetailView } from './capability-component-detail';
import type {
  CapabilityComponentKind,
  CapabilityComponentRegistry,
  DetectionRiskLevel,
} from '@/types/entities';

type CapTab = CapabilityComponentKind;

const TAB_ORDER: CapTab[] = ['tool', 'skill', 'mcp', 'model', 'knowledge'];

const TAB_LABEL: Record<CapTab, string> = {
  tool: '工具',
  skill: 'Skills',
  mcp: 'MCP',
  model: '大模型',
  knowledge: '知识库',
};

const TAB_HINT: Record<CapTab, string> = {
  tool: '主数据名录',
  skill: '能力模块',
  mcp: '插件 / 协议',
  model: '模型资产',
  knowledge: 'RAG 资产',
};

/** 与设置页 ChatModelForm / 原型 chat-model-form 对齐 */
const MODEL_SOURCE_OPTIONS = [
  { id: 'remote', label: 'Remote API (远程)' },
  { id: 'ollama', label: 'Ollama (本地)' },
  { id: 'lmstudio', label: 'LM Studio (本地)' },
] as const;

const MODEL_VENDOR_OPTIONS = [
  { id: 'custom_openai', label: '自定义 (OpenAI兼容接口)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'azure_openai', label: 'Azure OpenAI' },
  { id: 'doubao', label: '豆包' },
  { id: 'aliyun', label: '阿里云' },
] as const;

type ModelSourceId = (typeof MODEL_SOURCE_OPTIONS)[number]['id'];

type SkillPackageMetadata = {
  name?: string;
  title?: string;
  displayName?: string;
  slug?: string;
  id?: string;
  key?: string;
  componentKey?: string;
  version?: string;
  ver?: string;
  description?: string;
  desc?: string;
  author?: string;
  category?: string;
  source?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  homepage?: string;
  mcpDeps?: string;
  mcpDependencies?: string[] | string;
  installCmd?: string;
  installCommand?: string;
};

function modelVendorLabel(vendorId: string) {
  return MODEL_VENDOR_OPTIONS.find((item) => item.id === vendorId)?.label || vendorId;
}

function modelSourceLabel(sourceId: string) {
  return MODEL_SOURCE_OPTIONS.find((item) => item.id === sourceId)?.label || sourceId;
}

function defaultModelBaseUrl(source: string, vendor: string) {
  if (source === 'ollama') {
    return 'http://localhost:11434';
  }
  if (source === 'lmstudio') {
    return 'http://localhost:1234/v1';
  }
  const map: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com',
    anthropic: 'https://api.anthropic.com',
    azure_openai: 'https://{resource}.openai.azure.com',
  };
  return map[vendor] || '';
}

function deriveModelSupplierType(source: string, vendor: string) {
  if (source !== 'remote' || vendor === 'custom_openai') {
    return '自定义供应商';
  }
  return '系统供应商';
}

function deriveModelDeploy(source: string) {
  if (source === 'ollama' || source === 'lmstudio') {
    return '私有化部署';
  }
  return '公有云 API';
}

function deriveModelProviderLabel(source: string, vendor: string) {
  if (source === 'ollama') {
    return 'Ollama (本地)';
  }
  if (source === 'lmstudio') {
    return 'LM Studio (本地)';
  }
  return modelVendorLabel(vendor);
}

/** 知识库平台 — 不同平台对应不同 API 接入字段 */
const KB_PLATFORM_OPTIONS = [
  { id: 'dify', label: 'Dify 知识库' },
  { id: 'fastgpt', label: 'FastGPT 知识库' },
  { id: 'milvus', label: 'Milvus (向量库直连)' },
  { id: 'elasticsearch', label: 'Elasticsearch' },
  { id: 'weaviate', label: 'Weaviate' },
  { id: 'custom', label: '自定义 RAG API' },
] as const;

type KbPlatformId = (typeof KB_PLATFORM_OPTIONS)[number]['id'];

const KB_CATEGORIES = [
  '金融',
  '客服',
  '政务',
  '办公',
  '法务',
  '数据分析',
  '研发',
  '运维',
  '营销',
  '通用',
];

function kbPlatformLabel(platformId: string) {
  return KB_PLATFORM_OPTIONS.find((item) => item.id === platformId)?.label || platformId;
}

function defaultKbBaseUrl(platform: string) {
  const map: Record<string, string> = {
    dify: 'https://api.dify.ai',
    fastgpt: 'https://fastgpt.example.com',
    milvus: 'http://localhost:19530',
    elasticsearch: 'http://localhost:9200',
    weaviate: 'http://localhost:8080',
  };
  return map[platform] || '';
}

function defaultKbApiPath(platform: string) {
  if (platform === 'dify') {
    return '/v1/datasets/{dataset_id}/retrieve';
  }
  if (platform === 'fastgpt') {
    return '/api/core/dataset/searchTest';
  }
  if (platform === 'custom') {
    return '/v1/knowledge/retrieve';
  }
  return '';
}

function kbUsesDatasetId(platform: string) {
  return platform === 'dify' || platform === 'fastgpt';
}

function kbUsesVectorIndex(platform: string) {
  return platform === 'milvus' || platform === 'elasticsearch' || platform === 'weaviate';
}

function kbVectorIndexLabel(platform: string) {
  if (platform === 'milvus') {
    return 'Collection 名称';
  }
  if (platform === 'elasticsearch') {
    return 'Index 名称';
  }
  if (platform === 'weaviate') {
    return 'Class 名称';
  }
  return '向量库 / 索引';
}

function deriveKbSourcePlatform(platform: string) {
  const map: Record<string, string> = {
    dify: 'Dify',
    fastgpt: 'FastGPT',
    milvus: 'Milvus',
    elasticsearch: 'Elasticsearch',
    weaviate: 'Weaviate',
    custom: '自研',
  };
  return map[platform] || '其他';
}

const SKILL_SOURCES = ['自研', 'ClawHub', 'Cursor Skills', 'GitHub', '社区/第三方', '其他'];
const SKILL_CATEGORIES = [
  '金融',
  '客服',
  '政务',
  '办公',
  '法务',
  '数据分析',
  '研发',
  '运维',
  '营销',
  '通用',
];
const TOOL_SOURCES = ['自研', 'Coze 插件', 'Dify', '社区/第三方', '其他'];
const TOOL_CATEGORIES = [
  '业务 API',
  'CRM',
  '风控',
  '通知',
  '研发',
  '数据',
  '运维',
  '法务',
  '效率办公',
  '生活服务',
  '通用',
];
const MCP_SOURCES = ['自研', 'ModelScope MCP', 'Cursor MCP', '社区/第三方', '其他'];
const RISK_LEVELS: DetectionRiskLevel[] = ['low', 'medium', 'high'];
const RISK_LABEL: Record<DetectionRiskLevel, string> = {
  critical: '有风险',
  high: '有风险',
  medium: '待审查',
  low: '安全',
};

function riskBadgeClassName(level: DetectionRiskLevel | string) {
  if (level === 'low') {
    return 'border-transparent bg-emerald-600 text-white hover:bg-emerald-600';
  }
  if (level === 'medium') {
    return 'border-transparent bg-neutral-950 text-white hover:bg-neutral-950';
  }
  return 'border-transparent bg-destructive text-white hover:bg-destructive';
}

function riskLabelOf(level: DetectionRiskLevel | string) {
  return RISK_LABEL[level as DetectionRiskLevel] || '待审查';
}

function isRisky(level: DetectionRiskLevel | string) {
  return level === 'high' || level === 'critical';
}

function RiskBadge({ level }: { level: DetectionRiskLevel | string }) {
  return <Badge className={riskBadgeClassName(level)}>{riskLabelOf(level)}</Badge>;
}

type Meta = {
  author?: string;
  category?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  enName?: string;
  mcpDeps?: string;
  installCmd?: string;
  type?: string;
  protocol?: string;
  transport?: string;
  provider?: string;
  modelId?: string;
  modelType?: string;
  supplierType?: string;
  deploy?: string;
  modelSource?: string;
  vendor?: string;
  baseUrl?: string;
  endpoint?: string;
  apiKeySet?: boolean;
  multimodal?: boolean;
  connStatus?: string;
  connMsg?: string;
  kbPlatform?: string;
  datasetId?: string;
  kbApiPath?: string;
  dept?: string;
  sensitive?: string;
  vectorStore?: string;
  docCount?: string;
};

function readMeta(row: CapabilityComponentRegistry): Meta {
  const meta = (row.metadata || {}) as Meta;
  return meta;
}

function MetricCard({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[108px] rounded-lg border bg-card p-[18px_16px] text-left transition hover:bg-muted/30',
        active && 'border-primary ring-1 ring-primary/30',
      )}
    >
      <div className="text-[13px] font-semibold leading-snug text-muted-foreground">{label}</div>
      <div className="mt-3.5 text-[26px] font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className="flex flex-1 flex-col gap-5">{children}</Main>
    </>
  );
}

function emptyForm(kind: CapTab) {
  return {
    componentKind: kind,
    name: '',
    componentKey: '',
    version: 'v1.0.0',
    author: '',
    sourcePlatform:
      kind === 'skill'
        ? '自研'
        : kind === 'mcp'
          ? '自研'
          : kind === 'tool'
            ? '自研'
            : kind === 'knowledge'
              ? 'Dify'
              : '自研',
    sourceUrl: '',
    category:
      kind === 'skill' || kind === 'knowledge'
        ? '通用'
        : kind === 'tool'
          ? '业务 API'
          : '通用',
    riskLevel: 'low' as DetectionRiskLevel,
    description: '',
    mcpDeps: '',
    installCmd: '',
    type: '查询',
    protocol: 'stdio',
    provider: '',
    modelId: '',
    modelType: '大语言模型',
    supplierType: '自定义供应商',
    modelSource: 'remote' as ModelSourceId,
    vendor: 'custom_openai',
    baseUrl: kind === 'knowledge' ? defaultKbBaseUrl('dify') : '',
    apiKey: '',
    apiKeySet: false,
    multimodal: false,
    connStatus: '未测试',
    connMsg: '',
    kbPlatform: 'dify' as KbPlatformId,
    datasetId: '',
    kbApiPath: defaultKbApiPath('dify'),
    dept: '',
    sensitive: '内部',
    vectorStore: kind === 'knowledge' ? '平台托管' : 'Milvus',
    docCount: '0',
  };
}

function parseSimpleFrontmatter(text: string): SkillPackageMetadata | null {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match?.[1]) {
    return null;
  }
  const meta: SkillPackageMetadata = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!pair?.[1]) {
      continue;
    }
    const value = (pair[2] || '').replace(/^['"]|['"]$/g, '').trim();
    if (value) {
      (meta as Record<string, string>)[pair[1]] = value;
    }
  }
  return Object.keys(meta).length > 0 ? meta : null;
}

async function inferSkillFormFromZip(file: File): Promise<Partial<ReturnType<typeof emptyForm>>> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  let metadata: SkillPackageMetadata = {};
  let title = '';
  let description = '';

  for (const rawName of names) {
    const relativePath = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
    const base = relativePath.split('/').pop()?.toLowerCase() || '';
    const data = entries[rawName];
    if (!data || relativePath.endsWith('/')) {
      continue;
    }

    if (
      base === '_meta.json' ||
      base === 'meta.json' ||
      base === 'manifest.json' ||
      base === 'package.json' ||
      base === 'skill.json'
    ) {
      try {
        const json = JSON.parse(strFromU8(data));
        if (json && typeof json === 'object') {
          metadata = { ...metadata, ...(json as SkillPackageMetadata) };
        }
      } catch {
        // Keep using SKILL.md inference if optional metadata is invalid.
      }
    }

    if (base === 'skill.md' || base === 'skills.md' || base === 'readme.md') {
      const text = strFromU8(data).slice(0, 8000);
      metadata = { ...parseSimpleFrontmatter(text), ...metadata };
      title = title || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
      description =
        description ||
        text
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('#') && !line.startsWith('---')) ||
        '';
    }
  }

  const name = String(metadata.name || metadata.title || metadata.displayName || title || '')
    .trim()
    .slice(0, 200);
  const componentKey = String(
    metadata.slug || metadata.id || metadata.key || metadata.componentKey || metadata.name || '',
  ).trim();
  const mcpDeps = Array.isArray(metadata.mcpDependencies)
    ? metadata.mcpDependencies.join(', ')
    : String(metadata.mcpDeps || metadata.mcpDependencies || '').trim();

  return {
    name,
    componentKey,
    version: String(metadata.version || metadata.ver || '').trim(),
    author: String(metadata.author || '').trim(),
    category: String(metadata.category || '').trim(),
    sourcePlatform: String(metadata.sourcePlatform || metadata.source || '').trim(),
    sourceUrl: String(metadata.sourceUrl || metadata.homepage || '').trim(),
    description: String(metadata.description || metadata.desc || description || '').trim(),
    mcpDeps,
    installCmd: String(metadata.installCmd || metadata.installCommand || '').trim(),
  };
}

export function CapabilityRiskLibraryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const routeSearch = useSearch({ from: '/_authenticated/scan/capability-risks' }) as {
    kind?: CapTab;
    componentId?: string;
  };
  const [kind, setKindState] = useState<CapTab>(routeSearch.kind || 'tool');
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState('全部');
  const [filter1, setFilter1] = useState('全部');
  const [filter2, setFilter2] = useState('全部');
  const [filter3, setFilter3] = useState('全部');
  const [chip, setChip] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CapabilityComponentRegistry | null>(null);
  const [detailId, setDetailId] = useState<string | null>(routeSearch.componentId || null);
  const [pendingZip, setPendingZip] = useState<File | null>(null);
  const [form, setForm] = useState(() => emptyForm(routeSearch.kind || 'tool'));
  const [showApiKey, setShowApiKey] = useState(false);
  const [connTesting, setConnTesting] = useState(false);

  const handlePackageChange = async (file: File | null) => {
    setPendingZip(file);
    if (!file || kind !== 'skill') {
      return;
    }
    try {
      const inferred = await inferSkillFormFromZip(file);
      setForm((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(inferred).filter(([, value]) => typeof value === 'string' && value.trim()),
        ),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Skills 代码包解析失败');
    }
  };

  useEffect(() => {
    if (routeSearch.kind && routeSearch.kind !== kind) {
      setKindState(routeSearch.kind);
      if (!editingId && !createOpen) {
        setForm(emptyForm(routeSearch.kind));
      }
    }
    if (routeSearch.componentId && routeSearch.componentId !== detailId) {
      setDetailId(routeSearch.componentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional URL → state bridge
  }, [routeSearch.kind, routeSearch.componentId]);

  const setKind = (next: CapTab) => {
    setKindState(next);
    void navigate({
      to: '/scan/capability-risks',
      search: { kind: next, componentId: detailId || undefined },
      replace: true,
    });
  };

  const openDetail = (id: string) => {
    setDetailId(id);
    void navigate({
      to: '/scan/capability-risks',
      search: { kind, componentId: id },
      replace: true,
    });
  };

  const closeDetail = () => {
    setDetailId(null);
    void navigate({
      to: '/scan/capability-risks',
      search: { kind, componentId: undefined },
      replace: true,
    });
  };

  const allQuery = useQuery({
    queryKey: ['capability-components', 'all-kinds'],
    queryFn: () => detectionScanningApi.listCapabilityComponents({ limit: 200 }),
  });

  const allRows = allQuery.data?.data || [];

  const counts = useMemo(() => {
    const base: Record<CapTab, number> = {
      tool: 0,
      skill: 0,
      mcp: 0,
      model: 0,
      knowledge: 0,
    };
    for (const row of allRows) {
      if (row.componentKind in base) {
        base[row.componentKind as CapTab] += 1;
      }
    }
    return base;
  }, [allRows]);

  const kindRows = useMemo(
    () => allRows.filter((row) => row.componentKind === kind),
    [allRows, kind],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).category).filter(Boolean) as string[]),
      ),
    [kindRows],
  );
  const platforms = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).sourcePlatform).filter(Boolean) as string[]),
      ),
    [kindRows],
  );
  const types = useMemo(
    () =>
      Array.from(new Set(kindRows.map((row) => readMeta(row).type).filter(Boolean) as string[])),
    [kindRows],
  );
  const protocols = useMemo(
    () =>
      Array.from(
        new Set(
          kindRows
            .map((row) => readMeta(row).transport || readMeta(row).protocol)
            .filter(Boolean) as string[],
        ),
      ),
    [kindRows],
  );
  const providers = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).provider).filter(Boolean) as string[]),
      ),
    [kindRows],
  );
  const modelTypes = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).modelType).filter(Boolean) as string[]),
      ),
    [kindRows],
  );
  const depts = useMemo(
    () =>
      Array.from(new Set(kindRows.map((row) => readMeta(row).dept).filter(Boolean) as string[])),
    [kindRows],
  );
  const sensitives = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).sensitive).filter(Boolean) as string[]),
      ),
    [kindRows],
  );
  const vectorStores = useMemo(
    () =>
      Array.from(
        new Set(kindRows.map((row) => readMeta(row).vectorStore).filter(Boolean) as string[]),
      ),
    [kindRows],
  );

  const filteredRows = useMemo(() => {
    return kindRows.filter((row) => {
      const meta = readMeta(row);
      if (kind === 'tool') {
        if (filter1 !== '全部' && meta.category !== filter1) {
          return false;
        }
        if (filter2 !== '全部' && meta.sourcePlatform !== filter2) {
          return false;
        }
        if (filter3 !== '全部' && meta.type !== filter3) {
          return false;
        }
      } else if (kind === 'skill') {
        if (filter1 !== '全部' && meta.category !== filter1) {
          return false;
        }
        if (filter2 !== '全部' && meta.sourcePlatform !== filter2) {
          return false;
        }
        if (filter3 !== '全部' && riskLabelOf(row.riskLevel) !== filter3) {
          return false;
        }
      } else if (kind === 'mcp') {
        if (filter1 !== '全部' && meta.category !== filter1) {
          return false;
        }
        if (filter2 !== '全部' && meta.sourcePlatform !== filter2) {
          return false;
        }
        if (filter3 !== '全部' && (meta.transport || meta.protocol) !== filter3) {
          return false;
        }
      } else if (kind === 'model') {
        if (filter1 !== '全部' && meta.provider !== filter1) {
          return false;
        }
        if (filter2 !== '全部' && (meta.modelType || '大语言模型') !== filter2) {
          return false;
        }
        if (filter3 !== '全部' && (meta.supplierType || '自定义供应商') !== filter3) {
          return false;
        }
      } else {
        if (filter1 !== '全部' && meta.dept !== filter1) {
          return false;
        }
        if (filter2 !== '全部' && meta.sensitive !== filter2) {
          return false;
        }
        if (filter3 !== '全部' && meta.vectorStore !== filter3) {
          return false;
        }
      }
      if (chip === 'ClawHub' && meta.sourcePlatform !== 'ClawHub') {
        return false;
      }
      if (chip === 'Coze 插件' && meta.sourcePlatform !== 'Coze 插件') {
        return false;
      }
      if (chip === 'ModelScope MCP' && meta.sourcePlatform !== 'ModelScope MCP') {
        return false;
      }
      if (chip === '自研' && meta.sourcePlatform !== '自研') {
        return false;
      }
      if (chip === '已关联' && !(row.affectedAssets && row.affectedAssets > 0)) {
        return false;
      }
      if (chip === '未关联' && row.affectedAssets && row.affectedAssets > 0) {
        return false;
      }
      if (chip === '有风险' && !isRisky(row.riskLevel)) {
        return false;
      }
      if (chip === '安全' && row.riskLevel !== 'low') {
        return false;
      }
      if (chip === '待审查' && row.riskLevel !== 'medium') {
        return false;
      }
      if (chip === '高危' && !isRisky(row.riskLevel)) {
        return false;
      }
      if (chip === '已上传' && !row.hasPackage) {
        return false;
      }
      if (chip === '敏感' && meta.sensitive !== '敏感') {
        return false;
      }
      if (chip === '公开' && meta.sensitive !== '公开') {
        return false;
      }
      if (chip === '涉敏' && meta.sensitive !== '敏感' && meta.sensitive !== '是') {
        return false;
      }
      if (chip === '系统供应商' && meta.supplierType !== '系统供应商') {
        return false;
      }
      if (chip === '私有化部署' && meta.deploy !== '私有化部署' && meta.deploy !== '本地 Ollama') {
        if (meta.modelSource !== 'ollama' && meta.modelSource !== 'lmstudio') {
          return false;
        }
      }
      const q = searchText.trim().toLowerCase();
      if (!q) {
        return true;
      }
      const haystacks: Record<string, string> = {
        全部: [
          row.name,
          row.componentKey,
          row.version,
          meta.author,
          meta.category,
          meta.sourcePlatform,
          row.description,
          meta.enName,
          meta.provider,
          meta.modelId,
          meta.dept,
          meta.vectorStore,
          meta.type,
          meta.protocol,
          meta.transport,
        ]
          .filter(Boolean)
          .join(' '),
        名称: row.name,
        Slug: row.componentKey || '',
        版本: row.version || '',
        作者: meta.author || '',
        分类: meta.category || '',
        来源平台: meta.sourcePlatform || '',
        类型: meta.type || '',
        协议: meta.transport || meta.protocol || '',
        描述: row.description || '',
        提供商: meta.provider || '',
        'Model ID': meta.modelId || '',
        所属部门: meta.dept || '',
        向量库: meta.vectorStore || '',
      };
      const hay = (haystacks[searchField] || haystacks['全部']).toLowerCase();
      return hay.includes(q);
    });
  }, [kindRows, filter1, filter2, filter3, chip, searchText, searchField, kind]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const isModel = form.componentKind === 'model';
      const isKnowledge = form.componentKind === 'knowledge';
      const modelSource = form.modelSource || 'remote';
      const vendor = form.vendor || 'custom_openai';
      const kbPlatform = form.kbPlatform || 'dify';
      const providerLabel = isModel
        ? deriveModelProviderLabel(modelSource, vendor)
        : form.provider.trim() || undefined;
      const modelId = isModel
        ? form.name.trim() || form.modelId.trim()
        : form.modelId.trim() || undefined;
      const baseUrl = form.baseUrl.trim();
      const metadata: Meta = {
        author: form.author.trim() || undefined,
        category: form.category,
        sourcePlatform: isModel
          ? modelSourceLabel(modelSource)
          : isKnowledge
            ? deriveKbSourcePlatform(kbPlatform)
            : form.sourcePlatform,
        sourceUrl: form.sourceUrl.trim() || undefined,
        enName:
          form.componentKind === 'skill' ? form.componentKey.trim() || form.name.trim() : undefined,
        mcpDeps: form.mcpDeps.trim() || undefined,
        installCmd: form.installCmd.trim() || undefined,
        type: form.type,
        protocol: form.protocol,
        transport: form.protocol,
        provider: isKnowledge ? kbPlatformLabel(kbPlatform) : providerLabel,
        modelId,
        modelType: form.modelType,
        supplierType: isModel
          ? deriveModelSupplierType(modelSource, vendor)
          : form.supplierType,
        deploy: isModel ? deriveModelDeploy(modelSource) : undefined,
        modelSource: isModel ? modelSource : undefined,
        vendor: isModel ? vendor : undefined,
        baseUrl: isModel || isKnowledge ? baseUrl || undefined : undefined,
        endpoint: isModel || isKnowledge ? baseUrl || undefined : undefined,
        apiKeySet:
          isModel || isKnowledge ? Boolean(form.apiKey.trim() || form.apiKeySet) : undefined,
        multimodal: isModel ? form.multimodal : undefined,
        connStatus: isModel || isKnowledge ? form.connStatus || '未测试' : undefined,
        connMsg: isModel || isKnowledge ? form.connMsg || undefined : undefined,
        kbPlatform: isKnowledge ? kbPlatform : undefined,
        datasetId: isKnowledge && kbUsesDatasetId(kbPlatform) ? form.datasetId.trim() || undefined : undefined,
        kbApiPath:
          isKnowledge && (kbUsesDatasetId(kbPlatform) || kbPlatform === 'custom')
            ? form.kbApiPath.trim() || defaultKbApiPath(kbPlatform)
            : undefined,
        dept: form.dept.trim() || undefined,
        sensitive: form.sensitive,
        vectorStore: isKnowledge
          ? kbUsesVectorIndex(kbPlatform)
            ? form.vectorStore.trim() || undefined
            : form.vectorStore.trim() || '平台托管'
          : form.vectorStore,
        docCount: form.docCount,
      };
      const payload = {
        componentKind: form.componentKind,
        name: form.name.trim(),
        componentKey:
          form.componentKey.trim() ||
          (isModel && modelId
            ? modelId
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
            : undefined),
        version: form.version.trim() || undefined,
        source: isModel
          ? modelSourceLabel(modelSource)
          : isKnowledge
            ? deriveKbSourcePlatform(kbPlatform)
            : form.sourcePlatform,
        description: form.description.trim() || `${form.name.trim()} 能力组件`,
        riskLevel: form.riskLevel,
        riskTitle: `${form.name.trim()} 准入风险`,
        ...(editingId
          ? {}
          : {
              enabled: true,
              status: 'active',
            }),
        checks:
          form.componentKind === 'skill'
            ? ['权限边界', '代码包完整性', '注入风险', '审计日志']
            : form.componentKind === 'knowledge'
              ? ['权限边界', '检索越权', '敏感泄露', 'RAG 投毒', '引用校验']
              : ['权限边界', '人工确认', '审计日志'],
        metadata,
        createRiskProfile: true,
      };

      if (editingId) {
        const updated = await detectionScanningApi.updateCapabilityComponent(editingId, payload);
        if (pendingZip) {
          await detectionScanningApi.uploadCapabilityPackage(editingId, pendingZip);
        }
        return updated;
      }

      const created = await detectionScanningApi.createCapabilityComponent(payload);
      if (pendingZip) {
        await detectionScanningApi.uploadCapabilityPackage(created.id, pendingZip);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capability-components'] });
      queryClient.invalidateQueries({ queryKey: ['capability-component-detail'] });
      setCreateOpen(false);
      setEditingId(null);
      setPendingZip(null);
      setShowApiKey(false);
      setConnTesting(false);
      setForm(emptyForm(kind));
      toast.success(editingId ? `${TAB_LABEL[kind]} 已更新` : `${TAB_LABEL[kind]} 已创建`);
    },
    onError: (error: Error) => toast.error(error.message || (editingId ? '更新失败' : '创建失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => detectionScanningApi.deleteCapabilityComponent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capability-components'] });
      queryClient.invalidateQueries({ queryKey: ['capability-component-detail'] });
      setDeleteTarget(null);
      if (detailId === deleteTarget?.id) {
        closeDetail();
      }
      toast.success(`${TAB_LABEL[kind]} 已删除`);
    },
    onError: (error: Error) => toast.error(error.message || '删除失败'),
  });

  const searchFields =
    kind === 'tool'
      ? ['全部', '名称', 'Slug', '版本', '作者', '分类', '来源平台', '类型', '描述']
      : kind === 'skill'
        ? ['全部', '名称', 'Slug', '版本', '作者', '分类', '来源平台', '描述']
        : kind === 'mcp'
          ? ['全部', '名称', 'Slug', '版本', '作者', '分类', '来源平台', '协议', '描述']
          : kind === 'model'
            ? ['全部', '名称', '提供商', 'Model ID']
            : ['全部', '名称', '所属部门', '向量库', '描述'];

  const chips =
    kind === 'skill'
      ? ['', 'ClawHub', '自研', '已关联', '未关联']
      : kind === 'tool'
        ? ['', '安全', '待审查', '有风险', 'Coze 插件', '自研', '已上传', '已关联', '未关联']
        : kind === 'mcp'
          ? ['', '安全', '待审查', '有风险', 'ModelScope MCP', '自研', '已上传', '已关联', '未关联']
          : kind === 'model'
            ? ['', '涉敏', '私有化部署', '系统供应商']
            : ['', '敏感', '公开', '已关联'];

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(kind));
    setPendingZip(null);
    setShowApiKey(false);
    setConnTesting(false);
    setCreateOpen(true);
  };

  const openEdit = (row: CapabilityComponentRegistry) => {
    const meta = readMeta(row);
    const modelSource = (meta.modelSource ||
      (meta.deploy === '私有化部署' || /ollama/i.test(meta.provider || '')
        ? 'ollama'
        : 'remote')) as ModelSourceId;
    const vendor =
      meta.vendor ||
      MODEL_VENDOR_OPTIONS.find((item) => item.label === meta.provider)?.id ||
      'custom_openai';
    const kbPlatform = (meta.kbPlatform ||
      KB_PLATFORM_OPTIONS.find((item) => item.label === meta.provider)?.id ||
      (meta.sourcePlatform === 'Dify'
        ? 'dify'
        : meta.sourcePlatform === 'FastGPT'
          ? 'fastgpt'
          : meta.sourcePlatform === 'Milvus'
            ? 'milvus'
            : meta.sourcePlatform === 'Elasticsearch'
              ? 'elasticsearch'
              : meta.sourcePlatform === 'Weaviate'
                ? 'weaviate'
                : 'custom')) as KbPlatformId;
    setEditingId(row.id);
    setForm({
      ...emptyForm(row.componentKind as CapTab),
      componentKind: row.componentKind as CapTab,
      name: row.name || '',
      componentKey: row.componentKey || '',
      version: row.version || 'v1.0.0',
      author: meta.author || '',
      sourcePlatform: meta.sourcePlatform || row.source || '自研',
      sourceUrl: meta.sourceUrl || '',
      category: meta.category || (row.componentKind === 'tool' ? '业务 API' : '通用'),
      riskLevel: row.riskLevel === 'low' || row.riskLevel === 'medium' ? row.riskLevel : 'high',
      description: row.description || '',
      mcpDeps: meta.mcpDeps || '',
      installCmd: meta.installCmd || '',
      type: meta.type || '查询',
      protocol: meta.transport || meta.protocol || 'stdio',
      provider: meta.provider || '',
      modelId: meta.modelId || '',
      modelType: meta.modelType || '大语言模型',
      supplierType: meta.supplierType || '自定义供应商',
      modelSource,
      vendor,
      baseUrl: meta.baseUrl || meta.endpoint || '',
      apiKey: '',
      apiKeySet: Boolean(meta.apiKeySet),
      multimodal: Boolean(meta.multimodal),
      connStatus: meta.connStatus || '未测试',
      connMsg: meta.connMsg || '',
      kbPlatform,
      datasetId: meta.datasetId || '',
      kbApiPath: meta.kbApiPath || defaultKbApiPath(kbPlatform),
      dept: meta.dept || '',
      sensitive: meta.sensitive || '内部',
      vectorStore: meta.vectorStore || 'Milvus',
      docCount: meta.docCount || '0',
    });
    setPendingZip(null);
    setShowApiKey(false);
    setConnTesting(false);
    setCreateOpen(true);
  };

  const filter1Meta =
    kind === 'model'
      ? { label: '提供商', options: providers, allLabel: '全部提供商' }
      : kind === 'knowledge'
        ? { label: '所属部门', options: depts, allLabel: '全部部门' }
        : { label: '分类', options: categories, allLabel: '全部分类' };

  const filter2Meta =
    kind === 'model'
      ? { label: '模型类型', options: modelTypes, allLabel: '全部模型类型' }
      : kind === 'knowledge'
        ? { label: '敏感级别', options: sensitives, allLabel: '全部敏感级别' }
        : { label: '来源平台', options: platforms, allLabel: '全部来源平台' };

  const filter3Meta =
    kind === 'tool'
      ? { label: '类型', options: types, allLabel: '全部类型' }
      : kind === 'skill'
        ? {
            label: '风险等级',
            options: ['安全', '待审查', '有风险'],
            allLabel: '全部风险等级',
          }
        : kind === 'mcp'
          ? { label: '协议', options: protocols, allLabel: '全部协议' }
          : kind === 'model'
            ? {
                label: '供应商类型',
                options: ['系统供应商', '自定义供应商'],
                allLabel: '全部供应商类型',
              }
            : { label: '向量库', options: vectorStores, allLabel: '全部向量库' };

  const tableHeaders =
    kind === 'skill'
      ? ['Skills 名称', '来源', 'Slug', '版本', '风险等级', '关联 Agent', '操作']
      : kind === 'tool'
        ? ['工具名称', 'Slug', '版本', '来源平台', '风险等级', '关联 Agent', '操作']
        : kind === 'mcp'
          ? ['MCP 名称', 'Slug', '版本', '来源平台', '风险等级', '关联 Agent', '操作']
          : kind === 'model'
            ? ['模型名称', '供应商', '类型', 'Model ID', '风险等级', '关联 Agent', '操作']
            : ['知识库名称', '所属部门', '敏感级别', '文档数', '向量库', '关联 Agent', '操作'];

  const footHint =
    kind === 'skill'
      ? '「关联 Agent 数」为只读统计 · 新增 Skills 请上传含 SKILL.md / _meta.json 的 ZIP 代码包 · 为具体 Agent 配置挂载请进入资产台账 / 资产画像'
      : kind === 'tool'
        ? '「关联 Agent 数」为只读统计 · 新增工具请上传含 plugin.json / openapi.yaml 的 ZIP 代码包 · 参考 Coze 插件市场'
        : kind === 'mcp'
          ? '「关联 Agent 数」为只读统计 · 新增 MCP 请上传含 mcp.json / server.json 的 ZIP 代码包 · 参考 ModelScope MCP 广场'
          : kind === 'model'
            ? '「关联 Agent 数」为只读统计 · 编辑字段与详情页「模型说明 / 参数规格 / 接入配置 / 安全评估」对齐'
            : '「关联 Agent 数」为只读统计 · 为具体 Agent 配置挂载请进入资产台账 / 资产画像';

  const switchKind = (next: CapTab) => {
    setKind(next);
    setSearchText('');
    setChip('');
    setFilter1('全部');
    setFilter2('全部');
    setFilter3('全部');
    setSearchField('全部');
  };

  return (
    <PageShell>
      <GovernanceFlowStrip active={1} />

      {detailId ? (
        <CapabilityComponentDetailView id={detailId} onBack={closeDetail} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">能力组件管理</h1>
              <p className="text-sm text-muted-foreground">
                维护工具 / Skills / MCP / 大模型 / 知识库等企业能力主数据 · Skills 支持 ZIP
                代码包上传
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {TAB_ORDER.map((key) => (
              <MetricCard
                key={key}
                label={TAB_LABEL[key]}
                value={String(counts[key])}
                hint={TAB_HINT[key]}
                active={kind === key}
                onClick={() => switchKind(key)}
              />
            ))}
          </div>

          <Card className="rounded-lg shadow-sm">
            <CardContent className="grid gap-4 p-5 pt-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">能力组件管理</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    维护工具 / Skills / MCP / 大模型 / 知识库主数据 · 工具参考{' '}
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href="https://www.coze.cn/store/plugin"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Coze 插件市场
                    </a>{' '}
                    · Skills 参考{' '}
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href="https://clawhub.ai/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ClawHub
                    </a>{' '}
                    · MCP 参考{' '}
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href="https://www.modelscope.cn/mcp"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ModelScope MCP 广场
                    </a>{' '}
                    · 大模型参考{' '}
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href="https://docs.dify.ai/zh/use-dify/workspace/model-providers"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Dify 模型供应商
                    </a>{' '}
                    · Agent 挂载请在资产画像或资产画像配置
                  </p>
                </div>
                <Button
                  className="shrink-0 bg-neutral-950 text-white hover:bg-neutral-800"
                  onClick={openCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新增{TAB_LABEL[kind]}
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:flex-wrap lg:items-center">
                <Input
                  className="lg:min-w-[240px] lg:flex-1"
                  placeholder={
                    searchField === '全部'
                      ? `搜索${TAB_LABEL[kind]} · 支持名称 / 分类 / 描述等`
                      : `按${searchField}搜索…`
                  }
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                <Select value={searchField} onValueChange={setSearchField}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="搜索字段" />
                  </SelectTrigger>
                  <SelectContent>
                    {searchFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field === '全部' ? '全部搜索字段' : field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter1} onValueChange={setFilter1}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder={filter1Meta.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {['全部', ...filter1Meta.options].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === '全部' ? filter1Meta.allLabel : item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter2} onValueChange={setFilter2}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={filter2Meta.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {['全部', ...filter2Meta.options].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === '全部' ? filter2Meta.allLabel : item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filter3} onValueChange={setFilter3}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={filter3Meta.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {['全部', ...filter3Meta.options].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === '全部' ? filter3Meta.allLabel : item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {chips.map((item) => (
                  <button
                    key={item || 'all'}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      chip === item
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => setChip(item)}
                  >
                    {item || '全部'}
                  </button>
                ))}
              </div>

              <Tabs value={kind} onValueChange={(value) => switchKind(value as CapTab)}>
                <TabsList className="flex h-auto flex-wrap justify-start">
                  {TAB_ORDER.map((tab) => (
                    <TabsTrigger key={tab} value={tab}>
                      {TAB_LABEL[tab]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  共 {filteredRows.length} 条
                  {filteredRows.length !== kindRows.length ? `（筛选自 ${kindRows.length}）` : ''}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableHeaders.map((header) => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allQuery.isLoading && (
                      <TableRow>
                        <TableCell colSpan={tableHeaders.length} className="text-muted-foreground">
                          加载中…
                        </TableCell>
                      </TableRow>
                    )}
                    {!allQuery.isLoading && filteredRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={tableHeaders.length} className="text-muted-foreground">
                          暂无{TAB_LABEL[kind]}主数据，请点击「新增{TAB_LABEL[kind]}」创建。
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredRows.map((row) => {
                      const meta = readMeta(row);
                      return (
                        <TableRow key={row.id}>
                          {kind === 'skill' && (
                            <>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium text-primary hover:underline"
                                  onClick={() => openDetail(row.id)}
                                >
                                  {row.name}
                                </button>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{meta.sourcePlatform || '自研'}</Badge>
                              </TableCell>
                              <TableCell>
                                <code className="text-xs">{row.componentKey || '—'}</code>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{row.version || '—'}</Badge>
                              </TableCell>
                              <TableCell>
                                <RiskBadge level={row.riskLevel} />
                              </TableCell>
                              <TableCell>{row.affectedAssets || 0}</TableCell>
                            </>
                          )}
                          {kind === 'tool' && (
                            <>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium text-primary hover:underline"
                                  onClick={() => openDetail(row.id)}
                                >
                                  {row.name}
                                </button>
                              </TableCell>
                              <TableCell>
                                <code className="text-xs">{row.componentKey || '—'}</code>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{row.version || '—'}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{meta.sourcePlatform || '自研'}</Badge>
                              </TableCell>
                              <TableCell>
                                <RiskBadge level={row.riskLevel} />
                              </TableCell>
                              <TableCell>{row.affectedAssets || 0}</TableCell>
                            </>
                          )}
                          {kind === 'mcp' && (
                            <>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium text-primary hover:underline"
                                  onClick={() => openDetail(row.id)}
                                >
                                  {row.name}
                                </button>
                              </TableCell>
                              <TableCell>
                                <code className="text-xs">{row.componentKey || '—'}</code>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{row.version || '—'}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{meta.sourcePlatform || '自研'}</Badge>
                              </TableCell>
                              <TableCell>
                                <RiskBadge level={row.riskLevel} />
                              </TableCell>
                              <TableCell>{row.affectedAssets || 0}</TableCell>
                            </>
                          )}
                          {kind === 'model' && (
                            <>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium text-primary hover:underline"
                                  onClick={() => openDetail(row.id)}
                                >
                                  {row.name}
                                </button>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {meta.provider || '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{meta.modelType || '大语言模型'}</Badge>
                              </TableCell>
                              <TableCell>
                                <code className="text-xs">
                                  {meta.modelId || row.componentKey || '—'}
                                </code>
                              </TableCell>
                              <TableCell>
                                <RiskBadge level={row.riskLevel} />
                              </TableCell>
                              <TableCell>{row.affectedAssets || 0}</TableCell>
                            </>
                          )}
                          {kind === 'knowledge' && (
                            <>
                              <TableCell>
                                <button
                                  type="button"
                                  className="font-medium text-primary hover:underline"
                                  onClick={() => openDetail(row.id)}
                                >
                                  {row.name}
                                </button>
                              </TableCell>
                              <TableCell>{meta.dept || '—'}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={meta.sensitive === '敏感' ? 'destructive' : 'outline'}
                                >
                                  {meta.sensitive || '内部'}
                                </Badge>
                              </TableCell>
                              <TableCell>{meta.docCount || '0'}</TableCell>
                              <TableCell>{meta.vectorStore || '—'}</TableCell>
                              <TableCell>{row.affectedAssets || 0}</TableCell>
                            </>
                          )}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">打开操作菜单</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDetail(row.id)}>
                                  详情
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(row)}>
                                  编辑
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  删除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">{footHint}</p>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setEditingId(null);
            setPendingZip(null);
            setShowApiKey(false);
            setConnTesting(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            'max-h-[90vh] overflow-y-auto',
            kind === 'model' || kind === 'knowledge'
              ? 'w-[min(100vw-2rem,560px)] sm:max-w-[560px]'
              : 'w-[min(100vw-2rem,760px)] sm:max-w-[760px]',
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {editingId ? '编辑' : '新增'}
              {TAB_LABEL[kind]}
            </DialogTitle>
            <DialogDescription>
              {kind === 'skill'
                ? '维护 Skills 名录 · 参考 ClawHub 格式 · 可上传 ZIP 代码包（SKILL.md + _meta.json）'
                : kind === 'tool'
                  ? '维护工具 / 插件名录 · 参考 Coze 插件市场 · 可上传 ZIP 代码包'
                  : kind === 'mcp'
                    ? '维护 MCP 名录 · 参考 ModelScope MCP 广场 · 可上传 ZIP 代码包'
                    : kind === 'model'
                      ? '配置模型来源、服务商与接入参数，支持连接测试，便于后续评估与联调'
                      : kind === 'knowledge'
                        ? '按平台配置知识库 API 接入参数，支持连接测试与后续 RAG 评估'
                        : '维护能力组件主数据'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) {
                toast.error(
                  kind === 'model'
                    ? '请填写模型名称'
                    : kind === 'knowledge'
                      ? '请填写知识库名称'
                      : '请填写名称',
                );
                return;
              }
              if (kind === 'model' && !form.baseUrl.trim()) {
                toast.error('请填写 Base URL');
                return;
              }
              if (kind === 'knowledge') {
                if (!form.baseUrl.trim()) {
                  toast.error('请填写 API Base URL');
                  return;
                }
                if (kbUsesDatasetId(form.kbPlatform) && !form.datasetId.trim()) {
                  toast.error('请填写 Dataset ID');
                  return;
                }
                if (kbUsesVectorIndex(form.kbPlatform) && !form.vectorStore.trim()) {
                  toast.error(`请填写${kbVectorIndexLabel(form.kbPlatform)}`);
                  return;
                }
              }
              createMutation.mutate();
            }}
          >
            {kind === 'model' ? (
              <>
                <Field label="模型来源 *">
                  <Select
                    value={form.modelSource}
                    onValueChange={(value) => {
                      const source = value as ModelSourceId;
                      setForm((prev) => ({
                        ...prev,
                        modelSource: source,
                        baseUrl: defaultModelBaseUrl(source, prev.vendor) || prev.baseUrl,
                        vendor: source === 'remote' ? prev.vendor : 'custom_openai',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_SOURCE_OPTIONS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {form.modelSource === 'remote' && (
                  <Field label="服务商">
                    <Select
                      value={form.vendor}
                      onValueChange={(value) => {
                        setForm((prev) => ({
                          ...prev,
                          vendor: value,
                          baseUrl: defaultModelBaseUrl(prev.modelSource, value) || prev.baseUrl,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_VENDOR_OPTIONS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field label="模型名称 *">
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                        modelId: event.target.value,
                      }))
                    }
                    placeholder="例如：gpt-4o / deepseek-chat / qwen-max"
                  />
                </Field>

                <Field label="Base URL *">
                  <Input
                    value={form.baseUrl}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </Field>

                <Field label="API Key (可选)">
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, apiKey: event.target.value }))
                      }
                      placeholder={
                        form.apiKeySet && !form.apiKey ? '已设置（留空不修改）' : '输入 API Key'
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowApiKey((v) => !v)}
                      aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">连接测试</p>
                      {form.connStatus === '联通' && form.connMsg ? (
                        <p className="mt-1 text-xs text-muted-foreground">{form.connMsg}</p>
                      ) : form.connStatus === '失败' ? (
                        <p className="mt-1 text-xs text-destructive">
                          {form.connMsg || '连接测试失败'}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.connStatus || '未测试'}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        connTesting || !form.name.trim() || !form.baseUrl.trim()
                      }
                      onClick={() => {
                        setConnTesting(true);
                        const latency = 80 + Math.floor(Math.random() * 50);
                        window.setTimeout(() => {
                          setForm((prev) => ({
                            ...prev,
                            connStatus: '联通',
                            connMsg: `连接成功 · 延迟 ${latency}ms`,
                          }));
                          setConnTesting(false);
                          toast.success('连接测试成功');
                        }, 900);
                      }}
                    >
                      {connTesting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      测试连接
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                  <div>
                    <Label htmlFor="model-multimodal" className="cursor-pointer font-normal">
                      支持视觉/多模态
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      模型是否支持图片等多模态输入
                    </p>
                  </div>
                  <Switch
                    id="model-multimodal"
                    checked={form.multimodal}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        multimodal: checked,
                        modelType: checked ? '多模态' : prev.modelType === '多模态' ? '大语言模型' : prev.modelType,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="模型类型">
                    <Select
                      value={form.modelType}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, modelType: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['大语言模型', 'Embedding', 'Rerank', '语音', '视觉', '多模态'].map(
                          (item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="风险等级">
                    <Select
                      value={form.riskLevel}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, riskLevel: value as DetectionRiskLevel }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {RISK_LABEL[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="描述">
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="可选：模型用途说明"
                  />
                </Field>
              </>
            ) : kind === 'knowledge' ? (
              <>
                <Field label="知识库平台 *">
                  <Select
                    value={form.kbPlatform}
                    onValueChange={(value) => {
                      const platform = value as KbPlatformId;
                      setForm((prev) => ({
                        ...prev,
                        kbPlatform: platform,
                        sourcePlatform: deriveKbSourcePlatform(platform),
                        baseUrl: defaultKbBaseUrl(platform) || prev.baseUrl,
                        kbApiPath: defaultKbApiPath(platform),
                        vectorStore: kbUsesVectorIndex(platform) ? prev.vectorStore : '平台托管',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KB_PLATFORM_OPTIONS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="知识库名称 *">
                    <Input
                      value={form.name}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="如：客服 FAQ 库 / 金融产品知识库"
                    />
                  </Field>
                  <Field label="Slug / ID">
                    <Input
                      value={form.componentKey}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, componentKey: event.target.value }))
                      }
                      placeholder="kb-customer-faq"
                    />
                  </Field>
                  <Field label="版本">
                    <Input
                      value={form.version}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, version: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="作者 / 维护人">
                    <Input
                      value={form.author}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, author: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="分类 / 场景">
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KB_CATEGORIES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="所属部门">
                    <Input
                      value={form.dept}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, dept: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="敏感级别">
                    <Select
                      value={form.sensitive}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, sensitive: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['公开', '内部', '敏感'].map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="文档数（估算）">
                    <Input
                      value={form.docCount}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, docCount: event.target.value }))
                      }
                      placeholder="如 1280"
                    />
                  </Field>
                </div>

                <Field label="API Base URL *">
                  <Input
                    value={form.baseUrl}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                    }
                    placeholder={
                      form.kbPlatform === 'dify'
                        ? 'https://api.dify.ai'
                        : form.kbPlatform === 'fastgpt'
                          ? 'https://fastgpt.example.com'
                          : 'http://localhost:19530'
                    }
                  />
                </Field>

                {kbUsesDatasetId(form.kbPlatform) && (
                  <Field label="Dataset ID *">
                    <Input
                      value={form.datasetId}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, datasetId: event.target.value }))
                      }
                      placeholder="平台侧知识库 / Dataset 唯一标识"
                    />
                  </Field>
                )}

                {kbUsesVectorIndex(form.kbPlatform) && (
                  <Field label={`${kbVectorIndexLabel(form.kbPlatform)} *`}>
                    <Input
                      value={form.vectorStore}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, vectorStore: event.target.value }))
                      }
                      placeholder={
                        form.kbPlatform === 'milvus'
                          ? 'kb_customer_faq'
                          : form.kbPlatform === 'elasticsearch'
                            ? 'kb-customer-faq'
                            : 'KbCustomerFaq'
                      }
                    />
                  </Field>
                )}

                {(kbUsesDatasetId(form.kbPlatform) || form.kbPlatform === 'custom') && (
                  <Field label="检索 API Path">
                    <Input
                      value={form.kbApiPath}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, kbApiPath: event.target.value }))
                      }
                      placeholder={defaultKbApiPath(form.kbPlatform)}
                    />
                  </Field>
                )}

                <Field label="API Key (可选)">
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, apiKey: event.target.value }))
                      }
                      placeholder={
                        form.apiKeySet && !form.apiKey ? '已设置（留空不修改）' : '输入 API Key'
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowApiKey((v) => !v)}
                      aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">连接测试</p>
                      {form.connStatus === '联通' && form.connMsg ? (
                        <p className="mt-1 text-xs text-muted-foreground">{form.connMsg}</p>
                      ) : form.connStatus === '失败' ? (
                        <p className="mt-1 text-xs text-destructive">
                          {form.connMsg || '连接测试失败'}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {form.connStatus || '未测试'}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        connTesting ||
                        !form.name.trim() ||
                        !form.baseUrl.trim() ||
                        (kbUsesDatasetId(form.kbPlatform) && !form.datasetId.trim()) ||
                        (kbUsesVectorIndex(form.kbPlatform) && !form.vectorStore.trim())
                      }
                      onClick={() => {
                        setConnTesting(true);
                        const latency = 80 + Math.floor(Math.random() * 50);
                        window.setTimeout(() => {
                          setForm((prev) => ({
                            ...prev,
                            connStatus: '联通',
                            connMsg: `检索 API 可达 · 延迟 ${latency}ms`,
                          }));
                          setConnTesting(false);
                          toast.success('知识库连接测试成功');
                        }, 900);
                      }}
                    >
                      {connTesting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      测试连接
                    </Button>
                  </div>
                </div>

                <Field label="风险等级">
                  <Select
                    value={form.riskLevel}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, riskLevel: value as DetectionRiskLevel }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {RISK_LABEL[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="描述">
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="知识库用途、数据范围与合规说明"
                  />
                </Field>
              </>
            ) : (
              <>
            {(kind === 'skill' || kind === 'tool' || kind === 'mcp') && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4">
                <div className="text-sm font-medium">
                  {kind === 'skill' ? 'Skills 代码包（.zip）' : 'ZIP 代码包'}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kind === 'skill'
                    ? '解析 SKILL.md 前置元数据与 _meta.json · 自动填充名称、Slug、版本、描述'
                    : '上传后保存到主数据制品库，可供详情预览'}
                </p>
                <Input
                  className="mt-3"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) => void handlePackageChange(event.target.files?.[0] || null)}
                />
                {pendingZip && (
                  <p className="mt-2 text-xs text-muted-foreground">已选择：{pendingZip.name}</p>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={kind === 'skill' ? 'Skills 名称' : '名称'}>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="Slug / ID">
                <Input
                  value={form.componentKey}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, componentKey: event.target.value }))
                  }
                  placeholder={kind === 'skill' ? 'org/skill-name' : ''}
                />
              </Field>
              <Field label="版本">
                <Input
                  value={form.version}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, version: event.target.value }))
                  }
                />
              </Field>
              {(kind === 'skill' || kind === 'tool' || kind === 'mcp') && (
                <Field label="作者">
                  <Input
                    value={form.author}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, author: event.target.value }))
                    }
                  />
                </Field>
              )}
              {(kind === 'skill' || kind === 'tool' || kind === 'mcp') && (
                <Field label="来源平台">
                  <Select
                    value={form.sourcePlatform}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, sourcePlatform: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(kind === 'skill'
                        ? SKILL_SOURCES
                        : kind === 'tool'
                          ? TOOL_SOURCES
                          : MCP_SOURCES
                      ).map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {(kind === 'skill' || kind === 'tool') && (
                <Field label={kind === 'skill' ? '分类 / 场景' : '分类'}>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(kind === 'skill' ? SKILL_CATEGORIES : TOOL_CATEGORIES).map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="风险等级">
                <Select
                  value={form.riskLevel}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, riskLevel: value as DetectionRiskLevel }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {RISK_LABEL[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {(kind === 'skill' || kind === 'tool' || kind === 'mcp') && (
              <Field label="来源链接">
                <Input
                  value={form.sourceUrl}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))
                  }
                />
              </Field>
            )}

            {kind === 'skill' && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="依赖 MCP">
                  <Input
                    value={form.mcpDeps}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, mcpDeps: event.target.value }))
                    }
                  />
                </Field>
                <Field label="安装命令">
                  <Input
                    value={form.installCmd}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, installCmd: event.target.value }))
                    }
                  />
                </Field>
              </div>
            )}

            <Field label="描述">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </Field>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingId(null);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? editingId
                    ? '保存中…'
                    : '创建中…'
                  : editingId
                    ? '保存修改'
                    : '确认新增'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除{TAB_LABEL[kind]}？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleteTarget?.name}」主数据
              {deleteTarget?.componentKey ? `（${deleteTarget.componentKey}）` : ''}
              。关联风险画像会一并停用，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Developer API — API key management + modular REST documentation for /external/*.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  Braces,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ConfigDrawer } from '@/components/config-drawer';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { externalApiKeysApi } from '@/services/api/external-api-keys';

const DEFAULT_SCOPES = [
  'tasks:read',
  'tasks:write',
  'agents:read',
  'vulnerabilities:read',
  'assets:read',
  'assets:write',
  'assessments:read',
  'assessments:write',
  'remediations:read',
  'remediations:write',
  'reports:read',
  'workbench:read',
];

const READ_ONLY_SCOPES = DEFAULT_SCOPES.filter((s) => s.endsWith(':read'));

const FALLBACK_GROUPS: Array<{ id: string; scopes: string[] }> = [
  { id: 'assets', scopes: ['assets:read', 'assets:write'] },
  { id: 'assessments', scopes: ['assessments:read', 'assessments:write'] },
  { id: 'remediations', scopes: ['remediations:read', 'remediations:write'] },
  { id: 'reports', scopes: ['reports:read'] },
  { id: 'workbench', scopes: ['workbench:read'] },
  {
    id: 'attackTasks',
    scopes: ['tasks:read', 'tasks:write', 'agents:read', 'vulnerabilities:read'],
  },
];

function apiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}`;
  }
  const path = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  if (path.startsWith('http')) {
    return path.replace(/\/$/, '');
  }
  return `${window.location.origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`.replace(
    /\/$/,
    '',
  );
}

type EndpointDoc = {
  method: string;
  path: string;
  scope: string;
  /** Short action label shown above the path */
  title?: string;
  note?: string;
  /** One-line Python requests example (path params as placeholders) */
  py?: string;
};

/** Doc section: CRUD op or fine-grained assessment flow key */
type EndpointGroup = {
  /** i18n key under pages.developerApi.section.* */
  section: string;
  /** When false, empty groups are omitted (default true for CRUD tabs) */
  showEmpty?: boolean;
  endpoints: EndpointDoc[];
};

function buildPythonQuickstart(baseUrl: string): string {
  return `#!/usr/bin/env python3
"""Zhian Open API — 一键创建评估（对齐 UI 向导）
对应侧边栏：专项检测评估 → 对话安全评估、输出内容合规评估
Requires: pip install requests

前置：资产台账已配置 API 接入（runtimeConfig）；合规还需系统默认 LLM 裁判模型。
服务端会自动推荐用例库/合规库，无需手工选库。
"""
import time
import json
import requests

BASE_URL = "${baseUrl}"  # e.g. https://your-host/api/v1
API_KEY = "zhian.<uuid>.<secret>"  # 开放 API 页创建的密钥
ASSET_ID = "<ledger-agent-uuid>"  # GET .../assets/agents

# "dialogue" = 对话安全评估；"compliance" = 输出内容合规评估
TASK_KIND = "dialogue"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 1) 一键创建并执行（等同 UI 向导：推荐库 + 填 runtime / judge）
qs = requests.post(
    f"{BASE_URL}/external/assessments/quick-start",
    headers=HEADERS,
    json={
        "kind": TASK_KIND,
        "assetId": ASSET_ID,
        "start": True,
        # 可选覆盖："libraryIds": ["..."],
        # 合规可选："domainOverride": "金融合规",
    },
    timeout=600,
)
qs.raise_for_status()
data = qs.json()["data"]
task = data["task"]
task_id = task["id"]
print("task:", task_id, task.get("status"), task.get("scanType"))
print("recommend:", data.get("recommend"))

# 2) 轮询至终态
terminal = {"completed", "blocked", "canceled"}
for _ in range(60):
    r = requests.get(
        f"{BASE_URL}/external/assessments/tasks/{task_id}",
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    status = r.json()["data"].get("status")
    print("status:", status)
    if status in terminal:
        break
    time.sleep(5)

# 3) 拉取 findings（专项评估主结果）
findings = requests.get(
    f"{BASE_URL}/external/assessments/tasks/{task_id}/findings",
    headers=HEADERS,
    timeout=60,
)
findings.raise_for_status()
payload = findings.json()["data"]
print("findings:", json.dumps(payload, ensure_ascii=False, indent=2)[:2000])
out = f"findings-{TASK_KIND}-{task_id}.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
print("saved", out)

# 进阶：若需完全自控选库，再用 POST .../assessments/tasks 传完整向导字段
# 列表筛选：GET .../assessments/tasks?scanType=agent_api 或 scanType=合规检测
`;
}

function pythonOneLiner(method: string, path: string): string {
  const url = `f"{BASE_URL}${path.replace(/:([a-zA-Z]+)/g, '{$1}')}"`;
  const m = method.toUpperCase();
  if (m === 'GET') {
    return `requests.get(${url}, headers=HEADERS, timeout=60)`;
  }
  if (m === 'DELETE') {
    return `requests.delete(${url}, headers=HEADERS, timeout=60)`;
  }
  if (m === 'PATCH') {
    return `requests.patch(${url}, headers=HEADERS, json={...}, timeout=60)`;
  }
  return `requests.post(${url}, headers=HEADERS, json={...}, timeout=60)`;
}

function EndpointList({
  baseUrl,
  groups,
  t,
  p,
  onCopy,
}: {
  baseUrl: string;
  groups: EndpointGroup[];
  t: (key: string, opts?: Record<string, string>) => string;
  p: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(`${p}.integrationAuth`)}</p>
      <p className="text-xs text-muted-foreground">{t(`${p}.opGroupHint`)}</p>
      <ScrollArea className="h-[min(480px,55vh)] rounded-md border">
        <div className="space-y-6 p-4 font-mono text-xs">
          {groups.map((group) => {
            const showEmpty = group.showEmpty !== false;
            if (group.endpoints.length === 0 && !showEmpty) {
              return null;
            }
            return (
              <section key={group.section} className="space-y-3">
                <h4 className="font-sans text-sm font-semibold tracking-tight text-foreground">
                  {t(`${p}.section.${group.section}`)}
                </h4>
                {group.endpoints.length === 0 ? (
                  <p className="font-sans text-xs text-muted-foreground">{t(`${p}.opEmpty`)}</p>
                ) : (
                  group.endpoints.map((ep, idx) => {
                    const py = ep.py || pythonOneLiner(ep.method, ep.path);
                    return (
                      <div
                        key={`${group.section}-${ep.method}-${ep.path}-${idx}`}
                        className="space-y-1 border-b border-border/60 pb-3 last:border-0"
                      >
                        {ep.title ? (
                          <div className="font-sans text-xs font-medium text-foreground">
                            {ep.title}
                          </div>
                        ) : null}
                        <div>
                          <Badge variant="outline" className="mr-2 font-mono">
                            {ep.method}
                          </Badge>
                          <span>
                            {baseUrl}
                            {ep.path}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {t(`${p}.requiredScope`)}: <code>{ep.scope}</code>
                        </div>
                        {ep.note ? (
                          <div className="whitespace-pre-wrap text-muted-foreground">{ep.note}</div>
                        ) : null}
                        <div className="flex flex-wrap items-start gap-2 pt-1">
                          <span className="shrink-0 text-muted-foreground">
                            {t(`${p}.examplePython`)}:
                          </span>
                          <code className="min-w-0 flex-1 break-all text-[11px] text-foreground">
                            {py}
                          </code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2"
                            onClick={() => onCopy(py)}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DeveloperApiPage() {
  const { t } = useTranslation();
  const p = 'pages.developerApi';
  const qc = useQueryClient();
  const { hasPermission, isLoading: permLoading } = usePermissions();
  const canManage = hasPermission('task', 'manage');

  const baseUrl = useMemo(() => apiBaseUrl(), []);
  const openApiUrl = `${baseUrl}/external/openapi.json`;
  const pythonScript = useMemo(() => buildPythonQuickstart(baseUrl), [baseUrl]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [neverExpires, setNeverExpires] = useState(true);
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(DEFAULT_SCOPES);

  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState('');
  const [secretHint, setSecretHint] = useState('');

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [deletePermId, setDeletePermId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['external-api-keys'],
    queryFn: () => externalApiKeysApi.list(),
    enabled: canManage,
  });

  const scopesQuery = useQuery({
    queryKey: ['external-api-key-scopes'],
    queryFn: () => externalApiKeysApi.listScopes(),
    enabled: canManage,
  });

  const scopeGroups = scopesQuery.data?.groups ?? FALLBACK_GROUPS;
  const defaultScopes = scopesQuery.data?.defaults ?? DEFAULT_SCOPES;

  useEffect(() => {
    if (scopesQuery.data?.defaults?.length) {
      setSelectedScopes(scopesQuery.data.defaults);
    }
  }, [scopesQuery.data?.defaults]);

  const createMut = useMutation({
    mutationFn: () =>
      externalApiKeysApi.create({
        name: createName.trim(),
        neverExpires,
        expiresAt:
          neverExpires || !expiresAtLocal.trim() ? null : new Date(expiresAtLocal).toISOString(),
        scopes: selectedScopes,
      }),
    onSuccess: (data) => {
      toast.success(t(`${p}.toast.created`));
      setCreateOpen(false);
      setCreateName('');
      setNeverExpires(true);
      setExpiresAtLocal('');
      setSelectedScopes(defaultScopes);
      if (data.apiKey) {
        setRevealedSecret(data.apiKey);
        setSecretHint(data.warning || t(`${p}.secretHintDefault`));
        setSecretDialogOpen(true);
      }
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message || t(`${p}.toast.createFailed`)),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => externalApiKeysApi.revoke(id),
    onSuccess: () => {
      toast.success(t(`${p}.toast.revoked`));
      setRevokeId(null);
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message || t(`${p}.toast.revokeFailed`)),
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => externalApiKeysApi.rotate(id),
    onSuccess: (data) => {
      toast.success(t(`${p}.toast.rotated`));
      setRotateId(null);
      if (data.apiKey) {
        setRevealedSecret(data.apiKey);
        setSecretHint(data.warning || t(`${p}.secretHintRotate`));
        setSecretDialogOpen(true);
      }
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message || t(`${p}.toast.rotateFailed`)),
  });

  const purgeMut = useMutation({
    mutationFn: (id: string) => externalApiKeysApi.purgeRevoked(id),
    onSuccess: () => {
      toast.success(t(`${p}.toast.deleted`));
      setDeletePermId(null);
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message || t(`${p}.toast.deleteFailed`)),
  });

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(`${p}.copied`));
    } catch {
      toast.error(t(`${p}.copyFailed`));
    }
  };

  const toggleScope = (scope: string, checked: boolean) => {
    setSelectedScopes((prev) =>
      checked ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope),
    );
  };

  const docs: Record<string, EndpointGroup[]> = {
    assets: [
      {
        section: 'create',
        endpoints: [
          {
            method: 'POST',
            path: '/external/assets/agents',
            scope: 'assets:write',
            title: '创建台账 Agent',
            note: '写入资产台账',
          },
          {
            method: 'POST',
            path: '/external/assets/discovered/:id/claim',
            scope: 'assets:write',
            title: '认领发现资产',
            note: '发现资产 → 写入台账',
          },
        ],
      },
      {
        section: 'read',
        endpoints: [
          {
            method: 'GET',
            path: '/external/assets/agents',
            scope: 'assets:read',
            title: '台账 Agent 列表',
          },
          {
            method: 'GET',
            path: '/external/assets/agents/:id',
            scope: 'assets:read',
            title: '台账 Agent 详情',
          },
          {
            method: 'GET',
            path: '/external/assets/discovered',
            scope: 'assets:read',
            title: '发现资产列表',
          },
        ],
      },
      {
        section: 'update',
        endpoints: [
          {
            method: 'PATCH',
            path: '/external/assets/agents/:id',
            scope: 'assets:write',
            title: '更新台账 Agent',
            note: '更新字段 / runtimeConfig 等',
          },
          {
            method: 'POST',
            path: '/external/assets/discovered/:id/ignore',
            scope: 'assets:write',
            title: '忽略发现资产',
          },
        ],
      },
      { section: 'delete', endpoints: [] },
    ],
    assessments: [
      {
        section: 'dialogueCreate',
        showEmpty: false,
        endpoints: [
          {
            method: 'POST',
            path: '/external/assessments/quick-start',
            scope: 'assessments:write',
            title: '一键创建对话安全评估',
            note:
              '对应产品「对话安全评估」。body: { kind: "dialogue", assetId, start?: true }\n' +
              '服务端自动推荐对话安全用例库并填充 runtime',
            py: 'requests.post(f"{BASE_URL}/external/assessments/quick-start", headers=HEADERS, json={"kind": "dialogue", "assetId": ASSET_ID, "start": True}, timeout=600)',
          },
          {
            method: 'POST',
            path: '/external/assessments/tasks',
            scope: 'assessments:write',
            title: '手写创建对话安全评估（进阶）',
            note:
              'scanType=agent_api, targetKind=agent_api, plans.probeType=agent_api + libIds\n' +
              '需自备用例库与 runtime；一般请用 quick-start',
            py: 'requests.post(f"{BASE_URL}/external/assessments/tasks", headers=HEADERS, json={"name": "...", "assetId": ASSET_ID, "scanType": "agent_api", "targetKind": "agent_api", "plans": [{"probeType": "agent_api", "libIds": [...], "enabled": True}]}, timeout=60)',
          },
        ],
      },
      {
        section: 'dialogueRead',
        showEmpty: false,
        endpoints: [
          {
            method: 'GET',
            path: '/external/assessments/tasks?scanType=agent_api',
            scope: 'assessments:read',
            title: '对话安全评估任务列表',
            note: '筛选 scanType=agent_api',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks", headers=HEADERS, params={"scanType": "agent_api"}, timeout=60)',
          },
          {
            method: 'GET',
            path: '/external/assessments/tasks/:id',
            scope: 'assessments:read',
            title: '对话安全评估任务详情 / 轮询状态',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks/{task_id}", headers=HEADERS, timeout=30)',
          },
          {
            method: 'GET',
            path: '/external/assessments/tasks/:id/findings',
            scope: 'assessments:read',
            title: '对话安全评估结果（findings）',
            note: '专项评估主交付物',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks/{task_id}/findings", headers=HEADERS, timeout=60)',
          },
        ],
      },
      {
        section: 'dialogueExecute',
        showEmpty: false,
        endpoints: [
          {
            method: 'POST',
            path: '/external/assessments/tasks/:id/execute',
            scope: 'assessments:write',
            title: '执行对话安全评估任务',
            note: 'quick-start 且 start=true 时可跳过',
            py: 'requests.post(f"{BASE_URL}/external/assessments/tasks/{task_id}/execute", headers=HEADERS, json={"mode": "manual", "generateFindings": True}, timeout=600)',
          },
        ],
      },
      {
        section: 'complianceCreate',
        showEmpty: false,
        endpoints: [
          {
            method: 'POST',
            path: '/external/assessments/quick-start',
            scope: 'assessments:write',
            title: '一键创建输出内容合规评估',
            note:
              '对应产品「输出内容合规评估」。body: { kind: "compliance", assetId, start?: true }\n' +
              '自动推荐合规控制库 + 系统默认 LLM 裁判模型',
            py: 'requests.post(f"{BASE_URL}/external/assessments/quick-start", headers=HEADERS, json={"kind": "compliance", "assetId": ASSET_ID, "start": True}, timeout=600)',
          },
          {
            method: 'POST',
            path: '/external/assessments/tasks',
            scope: 'assessments:write',
            title: '手写创建输出内容合规评估（进阶）',
            note:
              'scanType=合规检测, targetKind=agent_compliance, plans.probeType=compliance_policy_review + libIds\n' +
              '需自备合规库、runtime、judgeConfig；一般请用 quick-start',
            py: 'requests.post(f"{BASE_URL}/external/assessments/tasks", headers=HEADERS, json={"name": "...", "assetId": ASSET_ID, "scanType": "合规检测", "targetKind": "agent_compliance", "plans": [{"probeType": "compliance_policy_review", "libIds": [...], "enabled": True}]}, timeout=60)',
          },
        ],
      },
      {
        section: 'complianceRead',
        showEmpty: false,
        endpoints: [
          {
            method: 'GET',
            path: '/external/assessments/tasks?scanType=合规检测',
            scope: 'assessments:read',
            title: '输出内容合规评估任务列表',
            note: '筛选 scanType=合规检测',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks", headers=HEADERS, params={"scanType": "合规检测"}, timeout=60)',
          },
          {
            method: 'GET',
            path: '/external/assessments/tasks/:id',
            scope: 'assessments:read',
            title: '输出内容合规评估任务详情 / 轮询状态',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks/{task_id}", headers=HEADERS, timeout=30)',
          },
          {
            method: 'GET',
            path: '/external/assessments/tasks/:id/findings',
            scope: 'assessments:read',
            title: '输出内容合规评估结果（findings）',
            note: '专项评估主交付物',
            py: 'requests.get(f"{BASE_URL}/external/assessments/tasks/{task_id}/findings", headers=HEADERS, timeout=60)',
          },
        ],
      },
      {
        section: 'complianceExecute',
        showEmpty: false,
        endpoints: [
          {
            method: 'POST',
            path: '/external/assessments/tasks/:id/execute',
            scope: 'assessments:write',
            title: '执行输出内容合规评估任务',
            note: 'quick-start 且 start=true 时可跳过',
            py: 'requests.post(f"{BASE_URL}/external/assessments/tasks/{task_id}/execute", headers=HEADERS, json={"mode": "manual", "generateFindings": True}, timeout=600)',
          },
        ],
      },
    ],
    remediations: [
      {
        section: 'create',
        endpoints: [
          {
            method: 'POST',
            path: '/external/remediations/:id/evidence',
            scope: 'remediations:write',
            title: '提交整改证据',
          },
          {
            method: 'POST',
            path: '/external/remediations/:id/retest',
            scope: 'remediations:write',
            title: '发起复测',
          },
        ],
      },
      {
        section: 'read',
        endpoints: [
          {
            method: 'GET',
            path: '/external/remediations',
            scope: 'remediations:read',
            title: '整改工单列表',
          },
          {
            method: 'GET',
            path: '/external/remediations/:id',
            scope: 'remediations:read',
            title: '整改工单详情',
          },
        ],
      },
      {
        section: 'update',
        endpoints: [
          {
            method: 'PATCH',
            path: '/external/remediations/:id',
            scope: 'remediations:write',
            title: '更新整改状态',
            note: '状态 / 负责人 / 截止日期等',
          },
        ],
      },
      { section: 'delete', endpoints: [] },
    ],
    reports: [
      { section: 'create', endpoints: [] },
      {
        section: 'read',
        endpoints: [
          { method: 'GET', path: '/external/reports', scope: 'reports:read', title: '报告列表' },
          { method: 'GET', path: '/external/reports/:id', scope: 'reports:read', title: '报告详情' },
          {
            method: 'GET',
            path: '/external/reports/:id/download',
            scope: 'reports:read',
            title: '下载报告',
          },
        ],
      },
      { section: 'update', endpoints: [] },
      { section: 'delete', endpoints: [] },
    ],
    workbench: [
      { section: 'create', endpoints: [] },
      {
        section: 'read',
        endpoints: [
          {
            method: 'GET',
            path: '/external/workbench/todos',
            scope: 'workbench:read',
            title: '工作台待办',
          },
        ],
      },
      { section: 'update', endpoints: [] },
      { section: 'delete', endpoints: [] },
    ],
    attackTasks: [
      {
        section: 'create',
        endpoints: [
          {
            method: 'POST',
            path: '/external/tasks',
            scope: 'tasks:write',
            title: '创建攻击任务',
            note: '兼容旧接口',
          },
        ],
      },
      {
        section: 'read',
        endpoints: [
          { method: 'GET', path: '/external/tasks', scope: 'tasks:read', title: '攻击任务列表' },
          {
            method: 'GET',
            path: '/external/tasks/:taskId',
            scope: 'tasks:read',
            title: '攻击任务详情',
          },
          {
            method: 'GET',
            path: '/external/tasks/:taskId/status',
            scope: 'tasks:read',
            title: '攻击任务状态',
          },
          {
            method: 'GET',
            path: '/external/tasks/:taskId/results',
            scope: 'tasks:read',
            title: '攻击任务结果',
          },
          { method: 'GET', path: '/external/agents', scope: 'agents:read', title: '目标 Agent 列表' },
          {
            method: 'GET',
            path: '/external/vulnerabilities',
            scope: 'vulnerabilities:read',
            title: '漏洞列表',
          },
        ],
      },
      { section: 'update', endpoints: [] },
      {
        section: 'delete',
        endpoints: [
          {
            method: 'DELETE',
            path: '/external/tasks/:taskId',
            scope: 'tasks:write',
            title: '删除 / 取消攻击任务',
          },
        ],
      },
    ],
  };

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

      <Main className="flex flex-1 flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Braces className="size-7" />
            {t(`${p}.title`)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(`${p}.subtitle`)}</p>
        </div>

        {!permLoading && !canManage && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t(`${p}.noAccessTitle`)}</AlertTitle>
            <AlertDescription>{t(`${p}.noAccessBody`)}</AlertDescription>
          </Alert>
        )}

        {canManage && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="size-5" />
                    {t(`${p}.keysTitle`)}
                  </CardTitle>
                  <CardDescription>{t(`${p}.keysDescription`)}</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedScopes(defaultScopes);
                    setCreateOpen(true);
                  }}
                  disabled={Boolean(listQuery.data?.tableMissing)}
                >
                  <Plus className="mr-1 size-4" />
                  {t(`${p}.createKey`)}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {listQuery.data?.tableMissing && (
                  <Alert variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>{t(`${p}.migrationsRequiredTitle`)}</AlertTitle>
                    <AlertDescription>{t(`${p}.migrationsRequiredBody`)}</AlertDescription>
                  </Alert>
                )}
                {listQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  </div>
                ) : listQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>{t(`${p}.loadErrorTitle`)}</AlertTitle>
                    <AlertDescription>
                      {(listQuery.error as Error)?.message || String(listQuery.error)}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t(`${p}.col.name`)}</TableHead>
                        <TableHead>{t(`${p}.col.id`)}</TableHead>
                        <TableHead>{t(`${p}.col.status`)}</TableHead>
                        <TableHead>{t(`${p}.col.scopes`)}</TableHead>
                        <TableHead>{t(`${p}.col.expires`)}</TableHead>
                        <TableHead>{t(`${p}.col.lastUsed`)}</TableHead>
                        <TableHead className="text-end">{t(`${p}.col.actions`)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(listQuery.data?.keys ?? []).map((row) => {
                        const scopes = Array.isArray(row.scopes) ? row.scopes : [];
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.id.slice(0, 8)}…
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                                {row.status === 'active'
                                  ? t(`${p}.statusActive`)
                                  : row.status === 'revoked'
                                    ? t(`${p}.statusRevoked`)
                                    : row.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <div className="flex flex-wrap gap-1">
                                {scopes.slice(0, 4).map((s) => (
                                  <Badge key={s} variant="outline" className="font-mono text-[10px]">
                                    {s}
                                  </Badge>
                                ))}
                                {scopes.length > 4 ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    +{scopes.length - 4}
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.expiresAt
                                ? format(new Date(row.expiresAt), 'yyyy-MM-dd HH:mm')
                                : t(`${p}.neverExpires`)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.lastUsedAt
                                ? format(new Date(row.lastUsedAt), 'yyyy-MM-dd HH:mm')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={row.status !== 'active' || rotateMut.isPending}
                                  onClick={() => setRotateId(row.id)}
                                >
                                  <RefreshCw className="size-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={row.status !== 'active' || revokeMut.isPending}
                                  onClick={() => setRevokeId(row.id)}
                                >
                                  <Ban className="size-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    row.status !== 'revoked' ||
                                    purgeMut.isPending ||
                                    revokeMut.isPending
                                  }
                                  onClick={() => setDeletePermId(row.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-5" />
                  {t(`${p}.docsTitle`)}
                </CardTitle>
                <CardDescription>{t(`${p}.docsDescription`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview">
                  <TabsList className="flex h-auto flex-wrap gap-1">
                    <TabsTrigger value="overview">{t(`${p}.tabOverview`)}</TabsTrigger>
                    <TabsTrigger value="python">{t(`${p}.tabPython`)}</TabsTrigger>
                    <TabsTrigger value="assets">{t(`${p}.tabAssets`)}</TabsTrigger>
                    <TabsTrigger value="assessments">{t(`${p}.tabAssessments`)}</TabsTrigger>
                    <TabsTrigger value="reports">{t(`${p}.tabReports`)}</TabsTrigger>
                    <TabsTrigger value="remediations">{t(`${p}.tabRemediations`)}</TabsTrigger>
                    <TabsTrigger value="workbench">{t(`${p}.tabWorkbench`)}</TabsTrigger>
                    <TabsTrigger value="attackTasks">{t(`${p}.tabAttackTasks`)}</TabsTrigger>
                    <TabsTrigger value="webhook">{t(`${p}.tabWebhook`)}</TabsTrigger>
                    <TabsTrigger value="keys">{t(`${p}.tabKeysApi`)}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{t(`${p}.overviewIntro`)}</p>
                    <div className="space-y-1">
                      <Label className="text-xs">{t(`${p}.baseUrlLabel`)}</Label>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{baseUrl}</pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(baseUrl)}
                      >
                        <Copy className="mr-1 size-3.5" />
                        {t(`${p}.copyBaseUrl`)}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t(`${p}.openapiLabel`)}</Label>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{openApiUrl}</pre>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(openApiUrl)}
                        >
                          <Copy className="mr-1 size-3.5" />
                          {t(`${p}.copyOpenApi`)}
                        </Button>
                        <Button type="button" variant="outline" size="sm" asChild>
                          <a href={openApiUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-1 size-3.5" />
                            {t(`${p}.openOpenApi`)}
                          </a>
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border p-4">
                      <h4 className="mb-1 text-sm font-semibold">{t(`${p}.flowTitle`)}</h4>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {t(`${p}.flowBody`)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(`${p}.pythonPrerequisite`)}</p>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs">{t(`${p}.pythonQuickstartTitle`)}</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(pythonScript)}
                        >
                          <Copy className="mr-1 size-3.5" />
                          {t(`${p}.copyPython`)}
                        </Button>
                      </div>
                      <ScrollArea className="h-[min(280px,40vh)] rounded-md border">
                        <pre className="whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed">
                          {pythonScript}
                        </pre>
                      </ScrollArea>
                    </div>
                    <p className="text-sm">{t(`${p}.overviewScopes`)}</p>
                  </TabsContent>

                  <TabsContent value="python" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{t(`${p}.pythonTabIntro`)}</p>
                    <div className="rounded-md border p-4 text-sm">
                      <h4 className="mb-2 font-semibold">{t(`${p}.pythonScopesTitle`)}</h4>
                      <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                        <li>
                          <code>assessments:read</code> / <code>assessments:write</code>
                        </li>
                        <li>
                          <code>reports:read</code>
                        </li>
                        <li>
                          <code>assets:read</code> {t(`${p}.pythonScopesAssetsOptional`)}
                        </li>
                      </ul>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(`${p}.pythonPrerequisite`)}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs">{t(`${p}.pythonQuickstartTitle`)}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(pythonScript)}
                      >
                        <Copy className="mr-1 size-3.5" />
                        {t(`${p}.copyPython`)}
                      </Button>
                    </div>
                    <ScrollArea className="h-[min(480px,55vh)] rounded-md border">
                      <pre className="whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed">
                        {pythonScript}
                      </pre>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="assets" className="mt-4">
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.assets}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>
                  <TabsContent value="assessments" className="mt-4">
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.assessments}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>
                  <TabsContent value="reports" className="mt-4">
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.reports}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>
                  <TabsContent value="remediations" className="mt-4">
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.remediations}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>
                  <TabsContent value="workbench" className="mt-4">
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.workbench}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>
                  <TabsContent value="attackTasks" className="mt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">{t(`${p}.attackTasksCompatNote`)}</p>
                    <EndpointList
                      baseUrl={baseUrl}
                      groups={docs.attackTasks}
                      t={t}
                      p={p}
                      onCopy={copyText}
                    />
                  </TabsContent>

                  <TabsContent value="webhook" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{t(`${p}.webhookIntro`)}</p>
                    <ScrollArea className="h-[min(360px,40vh)] rounded-md border">
                      <pre className="whitespace-pre-wrap p-4 font-mono text-xs">
                        {t(`${p}.webhookBody`)}
                      </pre>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="keys" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{t(`${p}.keysApiIntro`)}</p>
                    <ScrollArea className="h-[min(420px,50vh)] rounded-md border">
                      <pre className="whitespace-pre-wrap p-4 font-mono text-xs">
                        {`GET  ${baseUrl}/external-api-keys\n`}
                        {`GET  ${baseUrl}/external-api-keys/scopes\n`}
                        {`POST ${baseUrl}/external-api-keys  { name, neverExpires?, expiresAt?, scopes? }\n`}
                        {`DELETE ${baseUrl}/external-api-keys/:id\n`}
                        {`DELETE ${baseUrl}/external-api-keys/:id/permanent\n`}
                        {`POST ${baseUrl}/external-api-keys/:id/rotate\n`}
                      </pre>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </>
        )}
      </Main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(`${p}.dialogCreateTitle`)}</DialogTitle>
            <DialogDescription>{t(`${p}.dialogCreateDescription`)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">{t(`${p}.fieldName`)}</Label>
              <Input
                id="key-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t(`${p}.fieldNamePlaceholder`)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="never-exp"
                checked={neverExpires}
                onCheckedChange={(v) => setNeverExpires(v === true)}
              />
              <Label htmlFor="never-exp" className="cursor-pointer">
                {t(`${p}.fieldNeverExpires`)}
              </Label>
            </div>
            {!neverExpires && (
              <div className="space-y-2">
                <Label htmlFor="exp-at">{t(`${p}.fieldExpiresAt`)}</Label>
                <Input
                  id="exp-at"
                  type="datetime-local"
                  value={expiresAtLocal}
                  onChange={(e) => setExpiresAtLocal(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{t(`${p}.scopesLabel`)}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedScopes(defaultScopes)}
                  >
                    {t(`${p}.selectAllScopes`)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedScopes(READ_ONLY_SCOPES)}
                  >
                    {t(`${p}.selectReadOnly`)}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t(`${p}.scopesHint`)}</p>
              <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-3">
                {scopeGroups.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t(`${p}.scopeGroup.${group.id}`, { defaultValue: group.id })}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {group.scopes.map((scope) => (
                        <label key={scope} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedScopes.includes(scope)}
                            onCheckedChange={(v) => toggleScope(scope, v === true)}
                          />
                          <code className="text-xs">{scope}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!createName.trim() || selectedScopes.length === 0 || createMut.isPending}
            >
              {createMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t(`${p}.submitCreate`)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent className="w-[min(100vw-2rem,36rem)] max-w-[min(100vw-2rem,36rem)] min-w-0 gap-4 overflow-hidden sm:max-w-xl">
          <DialogHeader className="min-w-0 shrink-0 space-y-2">
            <DialogTitle>{t(`${p}.secretTitle`)}</DialogTitle>
            <DialogDescription className="break-words">{secretHint}</DialogDescription>
          </DialogHeader>
          <div className="min-w-0 w-full max-w-full">
            <pre className="max-h-[min(40vh,18rem)] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
              {revealedSecret}
            </pre>
          </div>
          <DialogFooter className="min-w-0 shrink-0 sm:flex-wrap">
            <Button type="button" variant="outline" onClick={() => copyText(revealedSecret)}>
              <Copy className="mr-1 size-4" />
              {t(`${p}.copySecret`)}
            </Button>
            <Button type="button" onClick={() => setSecretDialogOpen(false)}>
              {t(`${p}.secretDone`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}.revokeTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${p}.revokeDescription`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeMut.mutate(revokeId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t(`${p}.revokeConfirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rotateId} onOpenChange={(o) => !o && setRotateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}.rotateTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${p}.rotateDescription`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotateId && rotateMut.mutate(rotateId)}>
              {t(`${p}.rotateConfirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePermId} onOpenChange={(o) => !o && setDeletePermId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${p}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${p}.deleteDescription`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePermId && purgeMut.mutate(deletePermId)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t(`${p}.deleteConfirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type {
  CapabilityComponentDetail,
  CapabilityComponentKind,
  DetectionRiskLevel,
} from '@/types/entities';

const TAB_LABEL: Record<CapabilityComponentKind, string> = {
  tool: '工具',
  skill: 'Skills',
  mcp: 'MCP',
  model: '大模型',
  knowledge: '知识库',
};

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

type Meta = {
  author?: string;
  category?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  enName?: string;
  mcpDeps?: string;
  installCmd?: string;
  type?: string;
  authType?: string;
  endpoint?: string;
  protocol?: string;
  transport?: string;
  permissions?: string;
  provider?: string;
  modelId?: string;
  modelType?: string;
  supplierType?: string;
  deploy?: string;
  modelSource?: string;
  vendor?: string;
  baseUrl?: string;
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
  scannedFiles?: string[];
};

function readMeta(row: CapabilityComponentDetail): Meta {
  return (row.metadata || {}) as Meta;
}

function formatBytes(size?: number | null) {
  if (!size || size <= 0) {
    return '—';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileRole(path: string) {
  const name = path.split('/').pop() || path;
  if (/^skill\.md$/i.test(name)) {
    return '技能主文档';
  }
  if (/_meta\.json$/i.test(name) || /meta\.json$/i.test(name)) {
    return '版本元数据';
  }
  if (/\.zip$/i.test(name)) {
    return '代码包';
  }
  if (path.includes('/')) {
    return '目录资源';
  }
  return '资源文件';
}

function findPackagePath(files: string[], patterns: RegExp[]) {
  for (const pattern of patterns) {
    const hit = files.find((path) => pattern.test(path.split('/').pop() || path));
    if (hit) {
      return hit;
    }
  }
  return null;
}

function genericSkillMd(detail: CapabilityComponentDetail, meta: Meta) {
  return [
    `# ${detail.name}${meta.enName ? ` (${meta.enName})` : ''}`,
    '',
    detail.description || '暂无描述',
    '',
    '## 依赖 MCP',
    '',
    meta.mcpDeps && meta.mcpDeps !== '—' ? meta.mcpDeps : '无外部 MCP 依赖',
    '',
    '## 安装命令',
    '',
    meta.installCmd
      ? `\`\`\`\n${meta.installCmd}\n\`\`\``
      : detail.componentKey
        ? `\`\`\`\nnpx @finstep/fsk install ${detail.componentKey}\n\`\`\``
        : '请通过平台资产画像挂载本 Skills',
  ].join('\n');
}

function SideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-2.5 last:border-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-all text-sm">{children}</div>
    </div>
  );
}

function StatInline({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-sm text-muted-foreground">
      <b className="mr-1 text-base font-semibold text-foreground tabular-nums">{value}</b>
      {label}
    </div>
  );
}

export function CapabilityComponentDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const [docTab, setDocTab] = useState('0');
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['capability-component-detail', id],
    queryFn: () => detectionScanningApi.getCapabilityComponent(id),
  });

  const detail = detailQuery.data;
  const meta = detail ? readMeta(detail) : {};
  const kind = (detail?.componentKind || 'skill') as CapabilityComponentKind;
  const artifact = detail?.currentArtifact;

  const packageFiles = useMemo(() => {
    const tree = artifact?.fileTreeJson || [];
    const files = tree.filter((item) => !item.isDir).map((item) => item.path);
    if (artifact?.fileName && !files.includes(artifact.fileName)) {
      files.push(artifact.fileName);
    }
    if (files.length > 0) {
      return files;
    }
    // Fallback: audit metadata scanned file paths (no content preview until package is stored)
    const scanned = Array.isArray(meta.scannedFiles) ? meta.scannedFiles : [];
    return scanned.filter((path): path is string => typeof path === 'string' && path.length > 0);
  }, [artifact, meta.scannedFiles]);

  const skillMdPath = useMemo(
    () => findPackagePath(packageFiles, [/^skill\.md$/i]),
    [packageFiles],
  );
  const readmePath = useMemo(
    () => findPackagePath(packageFiles, [/^readme\.md$/i, /^readme$/i]),
    [packageFiles],
  );
  const serverMdPath = useMemo(
    () =>
      findPackagePath(packageFiles, [
        /^server\.md$/i,
        /^mcp\.md$/i,
        /^mcp\.json$/i,
        /^server\.json$/i,
      ]),
    [packageFiles],
  );
  const toolsPath = useMemo(
    () =>
      findPackagePath(packageFiles, [
        /^tools\.json$/i,
        /^tools\.md$/i,
        /^tool.*\.json$/i,
      ]),
    [packageFiles],
  );

  // Auto-select SKILL.md for preview when opening Skills 包文件清单 / first tab content
  useEffect(() => {
    if (kind === 'skill' && skillMdPath && !previewPath) {
      setPreviewPath(skillMdPath);
    }
  }, [kind, skillMdPath, previewPath]);

  // MCP: prefer a representative doc when opening 包文件清单
  useEffect(() => {
    if (kind === 'mcp' && !previewPath && packageFiles.length > 0) {
      setPreviewPath(serverMdPath || readmePath || packageFiles[0] || null);
    }
  }, [kind, previewPath, packageFiles, serverMdPath, readmePath]);

  const skillMdQuery = useQuery({
    queryKey: ['capability-package-file', id, skillMdPath],
    enabled: kind === 'skill' && Boolean(skillMdPath),
    queryFn: () => detectionScanningApi.readCapabilityPackageFile(id, skillMdPath!),
  });

  const readmeQuery = useQuery({
    queryKey: ['capability-package-file', id, readmePath, 'readme'],
    enabled:
      Boolean(readmePath) &&
      ((kind === 'skill' && docTab === '1') || (kind === 'mcp' && docTab === '1')),
    queryFn: () => detectionScanningApi.readCapabilityPackageFile(id, readmePath!),
  });

  const serverMdQuery = useQuery({
    queryKey: ['capability-package-file', id, serverMdPath, 'server'],
    enabled: kind === 'mcp' && Boolean(serverMdPath) && docTab === '0',
    queryFn: () => detectionScanningApi.readCapabilityPackageFile(id, serverMdPath!),
  });

  const toolsQuery = useQuery({
    queryKey: ['capability-package-file', id, toolsPath, 'tools'],
    enabled: kind === 'mcp' && Boolean(toolsPath) && docTab === '3',
    queryFn: () => detectionScanningApi.readCapabilityPackageFile(id, toolsPath!),
  });

  // Skills 包文件清单 = tab 2; MCP 包文件清单 = tab 2; tool 包文件清单 = tab 3
  const packagePreviewTab =
    kind === 'skill' ? '2' : kind === 'mcp' ? '2' : kind === 'tool' ? '3' : '2';

  const previewQuery = useQuery({
    queryKey: ['capability-package-file', id, previewPath, 'preview'],
    enabled: Boolean(previewPath) && docTab === packagePreviewTab,
    queryFn: () => detectionScanningApi.readCapabilityPackageFile(id, previewPath!),
  });

  if (detailQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">加载详情…</CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          <p className="text-sm text-muted-foreground">未找到组件详情</p>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回列表
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (kind === 'skill') {
    return (
      <SkillDetailCard
        detail={detail}
        meta={meta}
        packageFiles={packageFiles}
        docTab={docTab}
        setDocTab={setDocTab}
        previewPath={previewPath}
        setPreviewPath={setPreviewPath}
        skillMdText={
          skillMdQuery.data?.text || artifact?.skillMdExcerpt || genericSkillMd(detail, meta)
        }
        skillMdLoading={skillMdQuery.isLoading}
        readmeText={readmeQuery.data?.text || `# ${detail.name}\n\n${detail.description || ''}`}
        readmeLoading={readmeQuery.isLoading}
        previewText={previewQuery.data?.text}
        previewLoading={previewQuery.isLoading}
        onBack={onBack}
      />
    );
  }

  // Non-skill kinds: keep compact shared detail
  return (
    <GenericDetailCard
      detail={detail}
      meta={meta}
      kind={kind}
      packageFiles={packageFiles}
      docTab={docTab}
      setDocTab={setDocTab}
      previewPath={previewPath}
      setPreviewPath={setPreviewPath}
      previewText={previewQuery.data?.text}
      previewLoading={previewQuery.isLoading}
      serverMdText={
        serverMdQuery.data?.text ||
        artifact?.skillMdExcerpt ||
        (serverMdPath
          ? undefined
          : detail.description
            ? `# ${detail.name}\n\n${detail.description}`
            : undefined)
      }
      serverMdLoading={serverMdQuery.isLoading}
      readmeText={
        readmeQuery.data?.text ||
        (readmePath ? undefined : detail.description ? `# ${detail.name}\n\n${detail.description}` : undefined)
      }
      readmeLoading={readmeQuery.isLoading}
      toolsText={toolsQuery.data?.text}
      toolsLoading={toolsQuery.isLoading}
      onBack={onBack}
    />
  );
}

function SkillDetailCard({
  detail,
  meta,
  packageFiles,
  docTab,
  setDocTab,
  previewPath,
  setPreviewPath,
  skillMdText,
  skillMdLoading,
  readmeText,
  readmeLoading,
  previewText,
  previewLoading,
  onBack,
}: {
  detail: CapabilityComponentDetail;
  meta: Meta;
  packageFiles: string[];
  docTab: string;
  setDocTab: (v: string) => void;
  previewPath: string | null;
  setPreviewPath: (v: string | null) => void;
  skillMdText: string;
  skillMdLoading: boolean;
  readmeText: string;
  readmeLoading: boolean;
  previewText?: string;
  previewLoading: boolean;
  onBack: () => void;
}) {
  const agentCount = detail.affectedAssets || detail.linkedAssets?.length || 0;
  const artifact = detail.currentArtifact;
  const installCmd =
    meta.installCmd ||
    (detail.componentKey ? `npx @finstep/fsk install ${detail.componentKey}` : '—');
  const subtitle = meta.enName || detail.componentKey || '—';
  const rules = detail.rules || [];

  const handleDownloadPackage = async () => {
    if (!artifact?.fileName) {
      toast.error('暂无代码包可下载');
      return;
    }
    try {
      await detectionScanningApi.downloadCapabilityPackage(detail.id, artifact.fileName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载失败');
    }
  };

  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回 Skills 列表
        </Button>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <div className="min-w-0 space-y-5">
            {/* Hero — 对齐原型 skill-detail-hero */}
            <div className="border-b pb-4">
              <h2 className="text-2xl font-semibold tracking-tight">{detail.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {subtitle}
                {' · '}
                <Badge variant="secondary" className="align-middle">
                  {detail.version || '—'}
                </Badge>
                {' · '}
                {meta.author || '—'}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{meta.category || '通用'}</Badge>
                <Badge variant={meta.sourcePlatform === 'ClawHub' ? 'default' : 'outline'}>
                  {meta.sourcePlatform || '自研'}
                </Badge>
              </div>
              <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
                {detail.description || '暂无描述'}
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                <StatInline value={String(agentCount)} label="关联 Agent" />
                <StatInline value={formatBytes(artifact?.fileSize)} label="包大小" />
              </div>
            </div>

            {/* 安装方式 */}
            <section>
              <div className="mb-2 text-sm font-semibold">安装方式</div>
              <div className="mb-2.5 flex flex-wrap gap-2">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                  CLI 安装
                </span>
                <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                  手动上传 ZIP
                </span>
              </div>
              <code className="block overflow-x-auto rounded-xl bg-[#111827] px-3.5 py-3 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-slate-200">
                {installCmd}
              </code>
            </section>

            {/* 文档 Tabs */}
            <Tabs value={docTab} onValueChange={setDocTab}>
              <TabsList className="flex h-auto flex-wrap justify-start">
                {['SKILL.md', 'readme.md', '包文件清单', '安全评估'].map((tab, index) => (
                  <TabsTrigger key={tab} value={String(index)}>
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="0" className="mt-4">
                <MdBody loading={skillMdLoading} text={skillMdText} />
              </TabsContent>

              <TabsContent value="1" className="mt-4">
                <MdBody loading={readmeLoading} text={readmeText} />
              </TabsContent>

              <TabsContent value="2" className="mt-4">
                {packageFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    暂无代码包文件。新增 Skills 时请上传含 SKILL.md / _meta.json 的 ZIP。
                  </p>
                ) : (
                  <div className="grid gap-3">
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>文件 / 目录</TableHead>
                            <TableHead>说明</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packageFiles.map((path) => (
                            <TableRow
                              key={path}
                              className={cn(
                                'cursor-pointer',
                                previewPath === path && 'bg-muted/40',
                              )}
                              onClick={() => setPreviewPath(path)}
                            >
                              <TableCell>
                                <code className="text-xs">{path}</code>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {fileRole(path)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      共 {packageFiles.length} 个文件 · {artifact?.fileName || '—'}
                    </p>
                    {previewPath && (
                      <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                        {previewLoading ? '加载中…' : previewText || '（无法预览该文件）'}
                      </pre>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="3" className="mt-4">
                <div className="grid gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className={riskBadgeClassName(detail.riskLevel)}>
                      {riskLabelOf(detail.riskLevel)}
                    </Badge>
                    <Badge variant="outline">{detail.riskTitle || 'ClawHub Security Audit'}</Badge>
                    <Badge variant="secondary">{rules.length} 条规则</Badge>
                  </div>
                  {rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      该 Skills 尚未同步 ClawHub Security Audit · 可点击右侧「发起 Skills
                      安全检测」生成评估
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs">{rule.ruleCode}</code>
                            <span className="text-sm font-medium">{rule.name}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            检查对象：{rule.checkTarget || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {meta.mcpDeps && meta.mcpDeps !== '—' && (
              <section>
                <div className="mb-2 text-sm font-semibold">依赖 MCP</div>
                <p className="text-sm text-muted-foreground">{meta.mcpDeps}</p>
              </section>
            )}
          </div>

          {/* 侧栏 — Skills 信息 */}
          <aside className="space-y-4 rounded-xl border bg-muted/10 p-4 xl:sticky xl:top-24">
            <h3 className="text-base font-semibold">Skills 信息</h3>
            <div>
              <SideRow label="Slug">
                <code className="text-xs">{detail.componentKey || '—'}</code>
              </SideRow>
              <SideRow label="来源平台">{meta.sourcePlatform || '自研'}</SideRow>
              <SideRow label="来源链接">
                {meta.sourceUrl ? (
                  <a
                    href={meta.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    打开
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  '—'
                )}
              </SideRow>
              <SideRow label="代码包">
                {artifact?.fileName ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-left text-primary hover:underline"
                    onClick={() => void handleDownloadPackage()}
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span>{artifact.fileName}</span>
                  </button>
                ) : (
                  '—'
                )}
              </SideRow>
              <SideRow label="关联 Agent">{String(agentCount)}</SideRow>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">版本历史</div>
              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">{detail.version || 'v1.0.0'}</b>
                  <Badge>最新</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.updatedAt?.slice(0, 10) || '—'} · {formatBytes(artifact?.fileSize)}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">关联 Agent</div>
              {(detail.linkedAssets || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无 Agent 挂载</p>
              ) : (
                <div className="grid gap-2">
                  {detail.linkedAssets?.slice(0, 6).map((asset) => (
                    <div key={asset.id} className="rounded-xl border bg-background p-3 text-left">
                      <div className="text-sm font-medium">{asset.name}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {asset.platformFamily || '—'} · {asset.status || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">操作</div>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast.message('发起 Skills 安全检测', {
                      description: '将接入检测任务创建流程（后续版本）',
                    })
                  }
                >
                  发起 Skills 安全检测
                </Button>
                {meta.sourceUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
                      查看来源页面
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function MdBody({ loading, text }: { loading?: boolean; text: string }) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  return (
    <div className="rounded-lg border bg-muted/15 p-4">
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function GenericDetailCard({
  detail,
  meta,
  kind,
  packageFiles,
  docTab,
  setDocTab,
  previewPath,
  setPreviewPath,
  previewText,
  previewLoading,
  serverMdText,
  serverMdLoading,
  readmeText,
  readmeLoading,
  toolsText,
  toolsLoading,
  onBack,
}: {
  detail: CapabilityComponentDetail;
  meta: Meta;
  kind: CapabilityComponentKind;
  packageFiles: string[];
  docTab: string;
  setDocTab: (v: string) => void;
  previewPath: string | null;
  setPreviewPath: (v: string | null) => void;
  previewText?: string;
  previewLoading: boolean;
  serverMdText?: string;
  serverMdLoading?: boolean;
  readmeText?: string;
  readmeLoading?: boolean;
  toolsText?: string;
  toolsLoading?: boolean;
  onBack: () => void;
}) {
  const agentCount = detail.affectedAssets || detail.linkedAssets?.length || 0;
  const rules = detail.rules || [];
  const tabs =
    kind === 'tool'
      ? ['插件说明', 'README', 'API 定义', '包文件清单', '安全评估']
      : kind === 'mcp'
        ? ['server.md', 'README.md', '包文件清单', 'Tools', '安全评估']
        : kind === 'model'
          ? ['模型说明', '参数规格', '接入配置', '安全评估']
          : kind === 'knowledge'
            ? ['知识库说明', '接入配置', '文档与索引', '安全评估']
            : ['说明', '安全评估'];

  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回{TAB_LABEL[kind]}列表
        </Button>
        <div>
          <h2 className="text-2xl font-semibold">{detail.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <code className="text-xs">{detail.componentKey || '—'}</code> · {detail.version || '—'}{' '}
            · {kind === 'model' ? meta.provider || meta.supplierType || '—' : meta.author || '—'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {kind === 'model' ? (
              <>
                <Badge variant="outline">{meta.modelType || '大语言模型'}</Badge>
                <Badge variant="secondary">{meta.supplierType || '自定义供应商'}</Badge>
              </>
            ) : kind === 'knowledge' ? (
              <>
                <Badge variant="outline">{meta.provider || meta.sourcePlatform || '—'}</Badge>
                <Badge variant="secondary">{meta.sensitive || '内部'}</Badge>
              </>
            ) : (
              <Badge variant="outline">{meta.sourcePlatform || '自研'}</Badge>
            )}
            <Badge className={riskBadgeClassName(detail.riskLevel)}>
              {riskLabelOf(detail.riskLevel)}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{detail.description || '—'}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <StatInline value={String(agentCount)} label="关联 Agent" />
          </div>
        </div>
        <Tabs value={docTab} onValueChange={setDocTab}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            {tabs.map((tab, i) => (
              <TabsTrigger key={tab} value={String(i)}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab, i) => (
            <TabsContent key={tab} value={String(i)} className="mt-4">
              {tab === '包文件清单' ? (
                packageFiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">暂无代码包文件清单</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      请重新跑一次「MCP源码安全评估」上传 ZIP（审计完成后会自动同步制品），或在能力组件管理中手动上传包。
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]">
                    <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border p-2">
                      {packageFiles.map((path) => (
                        <button
                          key={path}
                          type="button"
                          className={cn(
                            'w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                            previewPath === path
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-muted/60 text-muted-foreground',
                          )}
                          onClick={() => setPreviewPath(path)}
                        >
                          <span className="block truncate font-medium">{path}</span>
                          <span className="text-[10px] opacity-70">{fileRole(path)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-lg border bg-muted/15 p-3">
                      <p className="text-muted-foreground mb-2 truncate text-xs">
                        {previewPath || '选择左侧文件预览'}
                      </p>
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">
                        {previewPath
                          ? previewLoading
                            ? '加载中…'
                            : previewText || '（无法预览该文件，可能为二进制或空文件）'
                          : '—'}
                      </pre>
                    </div>
                  </div>
                )
              ) : tab === '安全评估' ? (
                <div className="grid gap-3">
                  <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                    <SideRow label="风险等级">
                      <Badge className={riskBadgeClassName(detail.riskLevel)}>
                        {riskLabelOf(detail.riskLevel)}
                      </Badge>
                    </SideRow>
                    <SideRow label="规则 / 发现">{rules.length} 条</SideRow>
                    {detail.riskTitle ? (
                      <SideRow label="风险标题">{detail.riskTitle}</SideRow>
                    ) : null}
                    {detail.description ? (
                      <div className="sm:col-span-2">
                        <SideRow label="评估摘要">{detail.description}</SideRow>
                      </div>
                    ) : null}
                  </div>
                  {rules.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      暂无结构化安全发现。可前往「专项安全评估 → MCP源码安全评估」重新审计并同步。
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs">{rule.ruleCode}</code>
                            <span className="text-sm font-medium">{rule.name}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            检查对象：{rule.checkTarget || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : kind === 'mcp' && tab === 'server.md' ? (
                <MdBody
                  loading={serverMdLoading}
                  text={
                    serverMdText ||
                    '未找到 server.md / mcp.json。请确认代码包中包含 MCP 服务说明或配置文件。'
                  }
                />
              ) : kind === 'mcp' && tab === 'README.md' ? (
                <MdBody
                  loading={readmeLoading}
                  text={readmeText || '未找到 README.md。可在「包文件清单」中浏览其他文档。'}
                />
              ) : kind === 'mcp' && tab === 'Tools' ? (
                <MdBody
                  loading={toolsLoading}
                  text={
                    toolsText ||
                    meta.mcpDeps ||
                    '未找到 tools.json。可在「包文件清单」中查看工具相关源码。'
                  }
                />
              ) : kind === 'model' && tab === '模型说明' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="模型名称">{detail.name || '—'}</SideRow>
                  <SideRow label="Slug / ID">
                    <code className="text-xs">{detail.componentKey || '—'}</code>
                  </SideRow>
                  <div className="sm:col-span-2">
                    <SideRow label="模型说明">{detail.description || '—'}</SideRow>
                  </div>
                </div>
              ) : kind === 'model' && tab === '参数规格' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="版本">{detail.version || '—'}</SideRow>
                  <SideRow label="模型类型">{meta.modelType || '大语言模型'}</SideRow>
                  <SideRow label="Model ID">
                    <code className="text-xs">{meta.modelId || detail.componentKey || '—'}</code>
                  </SideRow>
                  <SideRow label="多模态">{meta.multimodal ? '支持视觉/多模态' : '否'}</SideRow>
                </div>
              ) : kind === 'model' && tab === '接入配置' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="模型来源">
                    {meta.modelSource === 'ollama'
                      ? 'Ollama (本地)'
                      : meta.modelSource === 'lmstudio'
                        ? 'LM Studio (本地)'
                        : meta.modelSource === 'remote'
                          ? 'Remote API (远程)'
                          : meta.sourcePlatform || detail.source || '—'}
                  </SideRow>
                  <SideRow label="服务商 / 供应商">{meta.provider || '—'}</SideRow>
                  <SideRow label="供应商类型">{meta.supplierType || '自定义供应商'}</SideRow>
                  <SideRow label="部署方式">{meta.deploy || '—'}</SideRow>
                  <SideRow label="Base URL">
                    <code className="break-all text-xs">
                      {meta.baseUrl || meta.endpoint || '—'}
                    </code>
                  </SideRow>
                  <SideRow label="API Key">{meta.apiKeySet ? '已设置' : '未设置'}</SideRow>
                  <SideRow label="连接状态">{meta.connStatus || '未测试'}</SideRow>
                  <SideRow label="多模态">{meta.multimodal ? '支持' : '否'}</SideRow>
                  {meta.connMsg ? (
                    <div className="sm:col-span-2">
                      <SideRow label="连接信息">{meta.connMsg}</SideRow>
                    </div>
                  ) : null}
                </div>
              ) : kind === 'knowledge' && tab === '知识库说明' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="知识库名称">{detail.name || '—'}</SideRow>
                  <SideRow label="Slug / ID">
                    <code className="text-xs">{detail.componentKey || '—'}</code>
                  </SideRow>
                  <SideRow label="所属部门">{meta.dept || '—'}</SideRow>
                  <SideRow label="敏感级别">{meta.sensitive || '内部'}</SideRow>
                  <SideRow label="分类 / 场景">{meta.category || '通用'}</SideRow>
                  <SideRow label="维护人">{meta.author || '—'}</SideRow>
                  <div className="sm:col-span-2">
                    <SideRow label="说明">{detail.description || '—'}</SideRow>
                  </div>
                </div>
              ) : kind === 'knowledge' && tab === '接入配置' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="知识库平台">{meta.provider || meta.sourcePlatform || '—'}</SideRow>
                  <SideRow label="API Base URL">
                    <code className="break-all text-xs">
                      {meta.baseUrl || meta.endpoint || '—'}
                    </code>
                  </SideRow>
                  {meta.datasetId ? (
                    <SideRow label="Dataset ID">
                      <code className="text-xs">{meta.datasetId}</code>
                    </SideRow>
                  ) : null}
                  {meta.kbApiPath ? (
                    <SideRow label="检索 API Path">
                      <code className="break-all text-xs">{meta.kbApiPath}</code>
                    </SideRow>
                  ) : null}
                  <SideRow label="向量库 / 索引">{meta.vectorStore || '—'}</SideRow>
                  <SideRow label="API Key">{meta.apiKeySet ? '已设置' : '未设置'}</SideRow>
                  <SideRow label="连接状态">{meta.connStatus || '未测试'}</SideRow>
                  {meta.connMsg ? (
                    <div className="sm:col-span-2">
                      <SideRow label="连接信息">{meta.connMsg}</SideRow>
                    </div>
                  ) : null}
                </div>
              ) : kind === 'knowledge' && tab === '文档与索引' ? (
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                  <SideRow label="文档数">{meta.docCount || '0'}</SideRow>
                  <SideRow label="版本">{detail.version || '—'}</SideRow>
                  <SideRow label="制品包">
                    {detail.hasPackage || detail.currentArtifact ? '已上传' : '未上传'}
                  </SideRow>
                  {packageFiles.length > 0 ? (
                    <div className="sm:col-span-2">
                      <SideRow label="包内文件">{packageFiles.length} 个</SideRow>
                      <div className="mt-2 grid gap-2">
                        {packageFiles.slice(0, 8).map((path) => (
                          <code key={path} className="block text-xs text-muted-foreground">
                            {path}
                          </code>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <MdBody
                  text={detail.description || detail.currentArtifact?.skillMdExcerpt || '—'}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

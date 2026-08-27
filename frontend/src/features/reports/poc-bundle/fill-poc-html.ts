import type { PocFillContext } from './build-poc-context';

export type PocDocId =
  | 'exec-plan'
  | 'exec-log'
  | 'mgmt-summary'
  | 'evidence'
  | 'remediation'
  | 'master';

/** 多列留白表（如「会话/请求/证据映射」三行）：单元格尽量加高 */
const BCELL_ROW = ' class="poc-blank-cell"';
/** 执行日志竖排里单个空字段：略低，避免一页堆过高 */
const BCELL_FIELD = ' class="poc-blank-field"';

function injectBanner(html: string, ctx: PocFillContext): string {
  const layoutStyle = `<style type="text/css">
html{box-sizing:border-box;}
*,*::before,*::after{box-sizing:inherit;}
body{margin:0 auto;max-width:80rem;width:100%;padding:0 1rem 2rem;}
.poc-prefill-notice{font-size:13px;line-height:1.55;background:#e8f4fd;border:1px solid #0984e3;padding:10px 14px;margin:12px 0 16px;border-radius:8px;color:#1a365d;box-sizing:border-box;width:100%;}
.poc-prefill-notice code{font-size:12px;}
.poc-blank-cell{min-height:11em;vertical-align:top;padding:18px 16px;line-height:1.55;box-sizing:border-box;}
.poc-blank-field{min-height:6em;vertical-align:top;padding:12px 12px;line-height:1.55;box-sizing:border-box;}
.poc-blank-li{min-height:6em;margin:0.5em 0;line-height:1.55;}
.poc-blank-p{min-height:18em;vertical-align:top;padding:10px 12px;}
</style>`;
  const banner = `<div class="poc-prefill-notice"><strong>Prefill notice:</strong> The content below was prefilled from the platform for task ${ctx.taskNameHtml} (task ID: <code>${ctx.taskIdHtml}</code>). Scan configuration, execution progress, and finding excerpts are included where available; use blank areas for signatures and local notes.</div>`;
  const inject = `${layoutStyle}${banner}`;
  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>${inject}`);
  }
  return `${inject}${html}`;
}

function threeBlankTableRows(cols: number): string {
  const cell = `<td${BCELL_ROW}></td>`.repeat(cols);
  return `<tr>${cell}</tr>`.repeat(3);
}

function twoBlankTableRows(cols: number): string {
  const cell = `<td${BCELL_ROW}></td>`.repeat(cols);
  return `<tr>${cell}</tr>`.repeat(2);
}

function threeBlankListItems(): string {
  return `<li class="poc-blank-li"></li><li class="poc-blank-li"></li><li class="poc-blank-li"></li>`;
}

/** 执行日志单条记录：字段名左列、取值右列（竖排）；仅空值格加留白高度 */
function buildExecLogVerticalEntry(
  title: string,
  fields: Array<{ label: string; value: string }>,
): string {
  const body = fields
    .map((f) =>
      f.value.trim()
        ? `<tr><td style="width:22%;white-space:nowrap;background:#fafafa;">${f.label}</td><td style="vertical-align:top;padding:8px 10px;">${f.value}</td></tr>`
        : `<tr><td style="width:22%;white-space:nowrap;background:#fafafa;">${f.label}</td><td${BCELL_FIELD}></td></tr>`,
    )
    .join('');
  return `<div style="margin-bottom:22px;"><table style="width:100%;border-collapse:collapse;margin:8px 0 0;"><tr><th colspan="2" style="background:#f0f0f0;text-align:left;">${title}</th></tr>${body}</table></div>`;
}

/** 去掉模板里的手工占位提示，单元格留白 */
function blankManualPlaceholders(html: string): string {
  return (
    html
      .replace(/【填写】/g, '')
      .replace(/【请[^】]*】/g, '')
      .replace(/【姓名】/g, '')
      .replace(/【签字\/电子签】/g, '')
      .replace(/【日期】/g, '')
      .replace(/【YYYY-MM-DD】/g, '')
      .replace(/【HH:MM】/g, '')
      .replace(/【API\/Config\/人工】/g, '')
      .replace(/【做了什么动作】/g, '')
      .replace(/【请求参数\/Prompt\/页面路径】/g, '')
      .replace(/【预期行为】/g, '')
      .replace(/【实际结果】/g, '')
      .replace(/【正常\/异常】/g, '')
      .replace(/【E-\d+】/g, '')
  );
}

function applyAgentName(html: string, ctx: PocFillContext): string {
  let h = html;
  const variants = [
    '对公营销分析机器人agent',
    '对公营销分析机器人Agent',
    '对公营销分析机器人',
  ];
  for (const v of variants) {
    h = h.split(v).join(ctx.taskNameHtml);
  }
  return h;
}

function applyDates(html: string, ctx: PocFillContext, docId: PocDocId): string {
  if (docId === 'master') {
    let h = html;
    h = h.replace(/2026-04-10/g, ctx.docDate);
    h = h.replace(/2026-04-09 ~ 2026-04-10/g, ctx.dateRange);
    return h;
  }
  let h = html;
  h = h.replace(/2026-04-10/g, ctx.docDate);
  h = h.replace(/2026-04-09/g, ctx.updatedDate);
  h = h.replace(/2026-03-09/g, ctx.createdDate);
  return h;
}

function applyMgmtSummary(html: string, ctx: PocFillContext): string {
  const oneLine = `本任务「${ctx.taskNameHtml}」配置 <strong>${ctx.vulnCount}</strong> 个测试项；${ctx.detectionSummaryHtml}`;
  let h = html;
  h = h.replace(
    /<tr><td>测试对象<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试对象</td><td>${ctx.taskNameHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>总体风险判断<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>总体风险判断</td><td style="text-align:left;">${ctx.mgmtOverallRiskPrefillHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>是否影响上线\/运行<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>是否影响上线/运行</td><td style="text-align:left;">${ctx.vulnerableCount > 0 ? '存在平台裁决为「存在风险」的记录，是否影响上线请结合业务与补偿控制终裁。' : ctx.resultsTotal > 0 ? '当前平台记录未裁决为「存在风险」；若测试环境可代表生产，技术侧未见即时阻断信号。' : '待检测完成后结合业务窗口评估。'}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>是否建议投入资源<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>是否建议投入资源</td><td style="text-align:left;">${ctx.vulnerableCount > 0 ? '建议投入安全与研发资源完成整改与回归。' : ctx.resultsTotal > 0 ? '可维持基线投入；若后续策略变更建议复测。' : '待有检测结果后再评估资源。'}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>一句话摘要<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>一句话摘要</td><td>${oneLine}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>发生了什么<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>发生了什么</td><td>${ctx.detectionSummaryHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>影响有多大<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>影响有多大</td><td style="text-align:left;">${ctx.mgmtImpactPrefillHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>是否可控<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>是否可控</td><td style="text-align:left;">${ctx.mgmtControllabilityPrefillHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>需要投入什么<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>需要投入什么</td><td style="text-align:left;">${ctx.vulnerableCount > 0 ? '修复开发、策略/配置调整、回归检测、材料归档与签批；人天请结合下表「风险与投入建议」估算。' : '建议保留例行巡检与变更后再评估能力；当前无强制整改清单。'}</td></tr>`,
  );

  h = h.replace(
    /<h2>三、风险与投入建议<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>三、风险与投入建议</h2><table><tr><th>发现/主题</th><th>业务影响</th><th>发生概率</th><th>当前控制</th><th>建议动作</th><th>建议资源</th></tr>${ctx.topAggregatedRowsMgmtHtml}</table>`,
  );
  h = h.replace(
    /<h2>四、建议决策<\/h2>\s*<ul>[\s\S]*?<\/ul>/,
    `<h2>四、建议决策</h2><ul>${threeBlankListItems()}</ul>`,
  );
  h = h.replace(
    /<h2>五、里程碑<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>五、里程碑</h2><table><tr><th>时间点</th><th>动作</th><th>交付物</th><th>责任方</th></tr>${threeBlankTableRows(4)}</table>`,
  );
  h = h.replace(
    /<h2>六、关联文档<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>六、关联文档</h2><table><tr><th>文档名称</th><th>编号/路径</th></tr><tr><td>平台任务</td><td>${ctx.taskIdHtml}</td></tr><tr><td>正式报告</td><td>任务页「生成报告」导出</td></tr></table>`,
  );
  return h;
}

function applyRemediation(html: string, ctx: PocFillContext): string {
  let h = html;
  const totalLine =
    ctx.resultsTotal > 0
      ? `检出（判定存在风险）<strong>${ctx.vulnerableCount}</strong> 条 / 平台结果 <strong>${ctx.resultsTotal}</strong> 条；任务配置测试项 <strong>${ctx.vulnCount}</strong> 个`
      : `任务配置测试项 <strong>${ctx.vulnCount}</strong> 个；尚无检测结果记录`;
  h = h.replace(
    /<tr><td>测试对象<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试对象</td><td>${ctx.taskNameHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>总发现数<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>总发现数</td><td>${totalLine}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>风险分布<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>风险分布</td><td>${ctx.riskDistributionText}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>是否建议上线<\/td><td>[^<]*<\/td><\/tr>/,
    '<tr><td>是否建议上线</td><td></td></tr>',
  );
  h = h.replace(
    /<tr><td>最关键问题<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>最关键问题</td><td>${ctx.topFindingNamesText}</td></tr>`,
  );

  h = h.replace(
    /<h2>二、发现归类<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>二、发现归类</h2><table><tr><th>编号</th><th>问题名称</th><th>根因</th><th>等级</th><th>优先级</th><th>责任团队</th></tr>${ctx.topFindingsRemediationRowsHtml}</table>`,
  );

  h = h.replace(
    /<h2>三、单项整改详情<\/h2>[\s\S]*?<h2>四、整改任务清单<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>三、单项整改详情</h2>${ctx.remediationFindingDetailsHtml}<h2>四、整改任务清单</h2><table><tr><th>任务编号</th><th>任务</th><th>责任方</th><th>优先级</th><th>状态</th></tr>${threeBlankTableRows(5)}</table>`,
  );
  return h;
}

function applyMaster(html: string, ctx: PocFillContext): string {
  let h = html;
  h = h.replace(
    /<p><strong>项目：<\/strong>[^<]*<\/p>/,
    `<p><strong>项目：</strong>${ctx.taskNameHtml}</p>`,
  );
  h = h.replace(
    /<p><strong>测试时间：<\/strong>[^<]*<\/p>/,
    `<p><strong>测试时间：</strong>${ctx.dateRange}</p>`,
  );
  h = h.replace(
    /<p><strong>测试人员：<\/strong>[^<]*<\/p>/,
    '<p><strong>测试人员：</strong></p>',
  );
  h = h.replace(
    /<p><strong>编制时间：<\/strong>[^<]*<\/p>/,
    `<p><strong>编制时间：</strong>${ctx.docDate}</p>`,
  );

  const overview = `<p>本次针对任务「${ctx.taskNameHtml}」（类型：${ctx.taskTypeLabel}，目标类型：${ctx.targetType}，平台：${ctx.platformFamily}，测试模式：${ctx.attackModeZhHtml}，扫描方式：${ctx.scanModeLabel}，任务形态：${ctx.taskKindLabel}，状态：${ctx.statusLabel}）。检测引擎：${ctx.detectionConfigSummaryHtml}。${ctx.detectionSummaryHtml}</p>`;
  h = h.replace(
    /<h2>一、测试概述<\/h2>\s*<p>[^<]*<\/p>/,
    `<h2>一、测试概述</h2>${overview}`,
  );

  h = h.replace(
    /<h2>二、测试范围<\/h2>\s*<ul>[\s\S]*?<\/ul>/,
    `<h2>二、测试范围</h2><ul><li>对象：${ctx.taskNameHtml}${ctx.targetAgentNameHtml ? `（关联目标：${ctx.targetAgentNameHtml}）` : ''}</li><li>任务说明：${ctx.taskDescriptionHtml}</li><li>方式：以平台自动化检测为主，具体以任务配置与导出报告为准</li><li>排除：性能/DOS、未授权破坏性渗透等未纳入本任务范围</li></ul>`,
  );

  h = h.replace(
    /<h2>三、检测结果<\/h2>\s*<h3>1\. API扫描（api\.html）<\/h3>\s*<table>[\s\S]*?<\/table>\s*<h3>2\. Config扫描（config\.html）<\/h3>\s*<table>[\s\S]*?<\/table>/,
    ctx.masterDetectionSectionHtml,
  );

  h = h.replace(
    /<h2>四、风险等级统计<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>四、风险等级统计</h2><table><tr><td>严重</td><td>${ctx.riskCritical}</td></tr><tr><td>高</td><td>${ctx.riskHigh}</td></tr><tr><td>中</td><td>${ctx.riskMedium}</td></tr><tr><td>低</td><td>${ctx.riskLow}</td></tr><tr><td>总计（存在风险条数）</td><td>${ctx.vulnerableCount}</td></tr></table>`,
  );

  const risks =
    ctx.coreRiskListHtml && ctx.coreRiskListHtml.length > 0
      ? ctx.coreRiskListHtml
      : threeBlankListItems();
  h = h.replace(
    /<h2>五、核心风险说明<\/h2>\s*<ol>[\s\S]*?<\/ol>/,
    `<h2>五、核心风险说明</h2><ol>${risks}</ol>`,
  );

  h = h.replace(
    /<h2>六、整改建议<\/h2>\s*<ol>[\s\S]*?<\/ol>/,
    `<h2>六、整改建议</h2><ol style="line-height:1.65;">${ctx.masterRemediationBulletsHtml}</ol>`,
  );
  h = h.replace(
    /<h2>七、测试结论<\/h2>\s*<p>[^<]*<\/p>/,
    `<h2>七、测试结论</h2><div style="line-height:1.7;padding:14px 16px;border:1px solid #dfe6e9;border-radius:8px;background:#fafafa;margin-top:8px;">${ctx.masterConclusionDraftHtml}</div><p class="poc-blank-p" style="margin-top:12px;"></p>`,
  );
  return h;
}

function applyEvidence(html: string, ctx: PocFillContext): string {
  let h = html;
  h = h.replace(
    /<tr><td>发现编号<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>发现编号</td><td>${ctx.taskIdHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>风险等级<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>风险等级</td><td>${ctx.highestRiskLabel}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>漏洞名称<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>漏洞名称</td><td>${ctx.evidenceVulnTitleHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>发现方式<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>发现方式</td><td>${ctx.taskKindLabel} / ${ctx.scanModeLabel}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>影响对象<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>影响对象</td><td>${ctx.taskNameHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>首次发现<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>首次发现</td><td>${ctx.firstDetectionAt}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>复现状态<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>复现状态</td><td>${ctx.resultsTotal > 0 ? '平台已记录检测结果' : ''}</td></tr><tr><td>结果概况</td><td style="text-align:left;">${ctx.detectionSummaryHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>复现人<\/td><td>[^<]*<\/td><\/tr>/,
    '<tr><td>复现人</td><td></td></tr>',
  );

  h = h.replace(
    /<tr><td>测试环境<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试环境</td><td>${ctx.platformFamily}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>测试地址<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试地址</td><td>${ctx.endpointUrlHtml || ''}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>测试账号<\/td><td>[^<]*<\/td><\/tr>/,
    '<tr><td>测试账号</td><td></td></tr>',
  );
  h = h.replace(
    /<tr><td>关联组件<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>关联组件</td><td>目标：${ctx.targetType}；模式：${ctx.attackModeZhHtml}；引擎：${ctx.detectionConfigSummaryHtml}</td></tr>`,
  );

  h = h.replace(
    /(<h2>二、环境信息<\/h2>\s*<table>[\s\S]*?<\/table>)/,
    `$1${ctx.evidenceFindingsSectionHtml}`,
  );

  h = h.replace(
    /<h2>三、复现步骤<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>三、复现步骤</h2><table><tr><th>步骤</th><th>操作</th><th>输入</th><th>期望</th><th>实际</th><th>证据</th></tr>${ctx.evidenceReproduceStep1RowHtml}${twoBlankTableRows(6)}</table>`,
  );
  h = h.replace(
    /<h2>四、证据清单<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>四、证据清单</h2><table><tr><th>编号</th><th>类型</th><th>说明</th><th>路径</th></tr>${ctx.evidenceAttachmentPrefillRowsHtml}${twoBlankTableRows(4)}</table>`,
  );
  h = h.replace(
    /<h2>五、可复现性<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>五、可复现性</h2><table><tr><td style="width:28%;">双人复现</td><td${BCELL_ROW}></td></tr><tr><td>复现次数</td><td${BCELL_ROW}></td></tr><tr><td>环境依赖</td><td${BCELL_ROW}></td></tr></table>`,
  );
  h = h.replace(
    /<h2>六、业务影响<\/h2>\s*<ul>[\s\S]*?<\/ul>/,
    `<h2>六、业务影响</h2><ul><li style="margin-bottom:0.5em;"><strong>平台检测摘要：</strong>${ctx.detectionSummaryHtml}</li><li style="margin-bottom:0.5em;"><strong>代表测试项（按等级聚合）：</strong>${ctx.topFindingNamesText}</li>${threeBlankListItems()}</ul>`,
  );
  return h;
}

function applyExecLog(html: string, ctx: PocFillContext): string {
  let h = html;
  h = h.replace(
    /<tr><td>测试项目名称<\/td><td>[^<]*<\/td><td>Agent名称<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试项目名称</td><td>${ctx.taskNameHtml}</td><td>Agent名称</td><td>${ctx.targetAgentNameHtml || ctx.taskNameHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>版本号<\/td><td>v1\.0<\/td><td>文档状态<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>版本号</td><td>v1.0</td><td>文档状态</td><td>${ctx.statusLabel}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>测试窗口<\/td><td>[^<]*<\/td><td>环境<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试窗口</td><td>${ctx.dateRange}</td><td>环境</td><td>${ctx.platformFamily}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>记录人<\/td><td>[^<]*<\/td><td>复核人<\/td><td>[^<]*<\/td><\/tr>/,
    '<tr><td>记录人</td><td></td><td>复核人</td><td></td></tr>',
  );

  const envLine = ctx.endpointUrlHtml || ctx.platformFamily;
  const resultLine = `共 ${ctx.resultsTotal} 条结果，${ctx.vulnerableCount} 条判定存在风险`;
  const logEntry1 = buildExecLogVerticalEntry('记录 1 — 平台预填摘要', [
    { label: '序号', value: '1' },
    { label: '日期', value: ctx.updatedDate },
    { label: '时间', value: '' },
    { label: '执行人', value: '' },
    { label: '方式', value: '平台自动化检测' },
    { label: '检测引擎', value: `${ctx.detectionConfigSummaryHtml}` },
    { label: '执行进度', value: `${ctx.runProgressSummaryHtml}` },
    { label: '对象/环境', value: envLine },
    { label: '动作描述', value: '按任务配置执行漏洞库检测并落库结果' },
    { label: '输入/命令/URL', value: `任务 ID：${ctx.taskIdHtml}` },
    { label: '预期', value: '按策略完成测试项并生成可审计记录' },
    { label: '实际', value: ctx.resultsTotal > 0 ? `已生成 ${ctx.resultsTotal} 条结果记录` : '尚无落库结果' },
    { label: '结果', value: resultLine },
    { label: '证据编号', value: '' },
  ]);
  const logMainHtml = `<h2>3. 执行日志主表</h2><p style="font-size:13px;color:#555;margin:6px 0 4px;">本表为竖排字段（左列名称、右列取值）；空白字段可在导出 HTML 后自行补写，或向下追加新表作为多条记录。</p>${logEntry1}`;
  h = h.replace(/<h2>3\. 执行日志主表<\/h2>\s*<table>[\s\S]*?<\/table>/, logMainHtml);

  h = h.replace(
    /<h2>2\. 记录规则<\/h2>/,
    `<h2>2. 记录规则</h2>${ctx.execLogProcessAsideHtml}`,
  );

  h = h.replace(
    /<h2>4\. 会话\/请求\/证据映射<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>4. 会话/请求/证据映射</h2><table><tr><th>映射类型</th><th>编号</th><th>描述</th><th>保存位置</th></tr>${ctx.evidenceMappingPrefillRowsHtml}${twoBlankTableRows(4)}</table>`,
  );
  h = h.replace(
    /<h2>5\. 变更与异常记录<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>5. 变更与异常记录</h2><table><tr><th>时间</th><th>提出人</th><th>变更/异常内容</th><th>影响范围</th><th>处理结论</th></tr>${threeBlankTableRows(5)}</table>`,
  );
  h = h.replace(
    /<h2>6\. 每日收口与复核意见<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>6. 每日收口与复核意见</h2><table><tr><th>日期</th><th>当日完成情况</th><th>未完成项</th><th>次日计划</th><th>复核意见</th></tr>${threeBlankTableRows(5)}</table>`,
  );
  return h;
}

function applyExecPlan(html: string, ctx: PocFillContext): string {
  let h = html;
  h = h.replace(
    /<tr><td>适用对象<\/td><td>[^<]*<\/td><td>编制\/更新日期<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>适用对象</td><td>${ctx.taskTypeLabel} · ${ctx.platformFamily}</td><td>编制/更新日期</td><td>${ctx.updatedDate}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>Agent名称<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>Agent名称</td><td>${ctx.taskNameHtml}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>当前版本\/发布日期<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>当前版本/发布日期</td><td>任务创建于 ${ctx.createdDate}；最近更新 ${ctx.updatedDate}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>主要功能<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>主要功能</td><td>${ctx.taskDescriptionHtml || ''}</td></tr>`,
  );
  h = h.replace(
    /<tr><td>测试目标<\/td><td>[^<]*<\/td><\/tr>/,
    `<tr><td>测试目标</td><td>依据任务类型「${ctx.taskTypeLabel}」、目标类型「${ctx.targetType}」、测试模式「${ctx.attackModeZhHtml}」与任务形态「${ctx.taskKindLabel}」执行安全验证（共 ${ctx.vulnCount} 个配置测试项）</td></tr><tr><td>检测配置与进度</td><td>${ctx.detectionConfigSummaryHtml}；执行进度：${ctx.runProgressSummaryHtml}</td></tr>`,
  );

  h = h.replace(
    /<tr><td>测试对象<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/,
    `<tr><td>测试对象</td><td>任务「${ctx.taskNameHtml}」${ctx.targetAgentNameHtml ? `（关联目标 ${ctx.targetAgentNameHtml}）` : ''}</td><td></td></tr>`,
  );
  h = h.replace(
    /<tr><td>测试方式<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/,
    `<tr><td>测试方式</td><td>平台自动化（${ctx.taskKindLabel}，${ctx.scanModeLabel}）</td><td></td></tr>`,
  );
  h = h.replace(
    /<tr><td>数据边界<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/,
    '<tr><td>数据边界</td><td></td><td></td></tr>',
  );
  h = h.replace(
    /<tr><td>时间边界<\/td><td>[\s\S]*?<\/td><td>[\s\S]*?<\/td><\/tr>/,
    `<tr><td>时间边界</td><td>${ctx.dateRange}</td><td></td></tr>`,
  );

  h = h.replace(
    /<h2>4\. 测试假设与前置条件<\/h2>\s*<table>[\s\S]*?<\/table>/,
    '<h2>4. 测试假设与前置条件</h2><table><tr><th>序号</th><th>前置条件</th><th>责任人</th><th>确认状态</th></tr><tr><td>1</td><td>测试账号、访问地址与必要权限已开通</td><td></td><td></td></tr><tr><td>2</td><td>测试时间窗内允许开展授权安全验证</td><td></td><td></td></tr><tr><td>3</td><td>日志、截图、导出文件可用于留证</td><td></td><td></td></tr><tr><td>4</td><td>如涉及外部接口，已完成接口白名单与环境隔离</td><td></td><td></td></tr></table>',
  );

  h = h.replace(
    /<h2>7\. 角色分工与沟通机制<\/h2>\s*<table>[\s\S]*?<\/table>/,
    '<h2>7. 角色分工与沟通机制</h2><table><tr><th>角色</th><th>姓名/团队</th><th>职责</th><th>升级触发条件</th></tr><tr><td>项目负责人</td><td></td><td>统筹、范围确认、结论签发</td><td>发现高危或需暂停测试</td></tr><tr><td>测试执行人</td><td></td><td>执行测试、留证、提交发现</td><td>不可逆影响风险</td></tr><tr><td>技术接口人</td><td></td><td>配置、日志、环境支持</td><td>快速定位根因</td></tr><tr><td>业务负责人</td><td></td><td>业务影响与容忍度确认</td><td>影响真实用户</td></tr></table>',
  );

  h = h.replace(
    /<h2>8\. 日程与里程碑<\/h2>\s*<table>[\s\S]*?<\/table>/,
    `<h2>8. 日程与里程碑</h2><table><tr><th>阶段</th><th>时间</th><th>主要动作</th><th>输出</th></tr><tr><td>任务创建</td><td>${ctx.createdDate}</td><td>任务在平台创建与配置</td><td>任务 ID：${ctx.taskIdHtml}</td></tr><tr><td>最近更新</td><td>${ctx.updatedDate}</td><td>配置或执行状态变更</td><td>当前状态：${ctx.statusLabel}</td></tr><tr><td></td><td></td><td></td><td></td></tr></table>`,
  );
  return h;
}

export function fillPocHtml(html: string, docId: PocDocId, ctx: PocFillContext): string {
  let h = injectBanner(html, ctx);
  h = applyAgentName(h, ctx);
  h = applyDates(h, ctx, docId);

  switch (docId) {
    case 'mgmt-summary':
      h = applyMgmtSummary(h, ctx);
      break;
    case 'remediation':
      h = applyRemediation(h, ctx);
      break;
    case 'master':
      h = applyMaster(h, ctx);
      break;
    case 'evidence':
      h = applyEvidence(h, ctx);
      break;
    case 'exec-log':
      h = applyExecLog(h, ctx);
      break;
    case 'exec-plan':
      h = applyExecPlan(h, ctx);
      break;
    default:
      break;
  }

  h = blankManualPlaceholders(h);
  return h;
}

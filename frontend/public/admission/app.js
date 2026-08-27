(function () {
  const D = window.ADMISSION_DATA;
  if (!D) {
    console.error('[admission] data.js 未加载，侧栏使用 index.html 静态菜单');
    return;
  }
  const content = document.getElementById('content');
  const topTitle = document.getElementById('page-title');
  const topDesc = document.getElementById('page-desc');
  const modalRoot = document.getElementById('modal-root');

  const STORAGE_KEYS = {
    agents: 'admission_demo_agents',
    models: 'admission_demo_models',
    chatHistory: 'admission_demo_chat',
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getModels() {
    const stored = loadJson(STORAGE_KEYS.models, null);
    const defaults = D.defaultModels;
    if (!stored) return structuredClone(defaults);
    const merged = { ...defaults, ...stored };
    for (const type of Object.keys(defaults)) {
      if (!Array.isArray(merged[type])) merged[type] = defaults[type] || [];
    }
    return merged;
  }

  function saveModels(models) {
    saveJson(STORAGE_KEYS.models, models);
  }

  function getAgents() {
    return loadJson(STORAGE_KEYS.agents, D.defaultAgents);
  }

  function saveAgents(agents) {
    saveJson(STORAGE_KEYS.agents, agents);
  }

  function getChatHistory(agentId) {
    const all = loadJson(STORAGE_KEYS.chatHistory, {});
    return all[agentId] || [];
  }

  function saveChatMessage(agentId, message) {
    const all = loadJson(STORAGE_KEYS.chatHistory, {});
    if (!all[agentId]) all[agentId] = [];
    all[agentId].push(message);
    saveJson(STORAGE_KEYS.chatHistory, all);
  }

  function agentTypeLabel(type) {
    return type === 'reasoning' ? '推理智能体' : '快速问答';
  }

  function modelById(id) {
    const models = getModels();
    const all = (D.modelTypeDefs || []).flatMap((t) => models[t.id] || []);
    return all.find((m) => m.id === id);
  }

  function modelTypeDef(type) {
    return (D.modelTypeDefs || []).find((t) => t.id === type);
  }

  function closeModal() {
    if (!modalRoot) return;
    modalRoot.hidden = true;
    modalRoot.setAttribute('aria-hidden', 'true');
    modalRoot.innerHTML = '';
  }

  function openModal(html) {
    if (!modalRoot) return;
    modalRoot.innerHTML = html;
    modalRoot.hidden = false;
    modalRoot.setAttribute('aria-hidden', 'false');
    modalRoot.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', closeModal);
    });
    modalRoot.onclick = (e) => {
      if (e.target === modalRoot) closeModal();
    };
  }

  function badgeLevel(level) {
    if (level === 'high' || level === 'critical') return 'danger';
    if (level === 'medium') return 'warn';
    return 'ok';
  }

  function riskLabel(level) {
    return { low: '低', medium: '中', high: '高', critical: '严重' }[level] || level;
  }

  function refTable(title, section, headers, rows) {
    return `
      <div class="card ref-card">
        <div class="ref-head">
          <h3>${title}</h3>
          ${section ? `<span class="ref-section">${section}</span>` : ''}
        </div>
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  }

  function renderGovernanceBanner() {
    const g = D.governance;
    if (!g) return '';
    return `
      <div class="gov-banner" role="note">
        <div class="gov-banner-title">${g.principle}</div>
        <p class="gov-banner-summary">${g.summary}</p>
        <ul class="gov-banner-rules">
          <li><strong>${g.admissionScope}</strong> — 本模块聚焦上线与重大变更评审</li>
          <li>${g.envRule}</li>
        </ul>
      </div>`;
  }

  function renderProcessFlow() {
    return `
      <div class="card flow-card">
        <div class="ref-head">
          <h3>准入流程</h3>
          <span class="ref-section">§10.5</span>
        </div>
        <div class="flow-steps">
          ${D.processFlow.map((step, i) => `
            <div class="flow-step">
              <div class="flow-num">${i + 1}</div>
              <div class="flow-label">${step}</div>
              ${i < D.processFlow.length - 1 ? '<div class="flow-arrow" aria-hidden="true">↓</div>' : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  function setPageMeta(key, module) {
    if (module === 'system') {
      const meta = D.systemPages[key] || D.systemPages.tenant;
      topTitle.textContent = meta.title;
      topDesc.textContent = meta.desc;
      return;
    }
    const fallback = D.pages[D.navItems[0]?.page || 'overview'] || D.pages.overview;
    const meta = D.pages[key] || fallback;
    topTitle.textContent = meta.title;
    topDesc.textContent = meta.desc;
  }

  function setActiveNav(route, module) {
    const page = route.split('/').pop() || route.split('/')[0];
    document.querySelectorAll('.nav-sub .nav-item[data-page]').forEach((el) => {
      const elModule = el.dataset.module;
      const elPage = el.dataset.page;
      if (module === 'system') {
        el.classList.toggle('active', elModule === 'system' && elPage === page);
      } else if (module !== 'agent-chat') {
        el.classList.toggle('active', elModule !== 'system' && elPage === page);
      } else {
        el.classList.remove('active');
      }
    });
    const admissionToggle = document.getElementById('admission-toggle');
    const systemToggle = document.getElementById('system-toggle');
    const agentChatNav = document.getElementById('agent-chat-nav');
    admissionToggle?.classList.toggle('active', module === 'admission');
    systemToggle?.classList.toggle('active', module === 'system');
    agentChatNav?.classList.toggle('active', module === 'agent-chat');
  }

  function renderNav() {
    const sub = document.getElementById('admission-sub');
    if (!sub) return;
    sub.innerHTML = D.navItems
      .map((item) => {
        const divider = item.config ? '<div class="nav-sub-divider" aria-hidden="true"></div>' : '';
        return `${divider}<a class="nav-item" href="#${item.page}" data-page="${item.page}" data-module="admission"><span class="nav-item-label">${item.label}</span></a>`;
      })
      .join('');
  }

  const PINNED_SYSTEM_NAV = [
    { page: 'models', label: '模型设置' },
    { page: 'agents-mgmt', label: 'Agent 设置' },
  ];

  function renderSystemNav() {
    const sub = document.getElementById('system-sub');
    if (!sub || !D.systemNavItems?.length) return;

    const pinnedPages = new Set(PINNED_SYSTEM_NAV.map((i) => i.page));
    const rest = D.systemNavItems.filter((item) => !pinnedPages.has(item.page));

    function navLink(item) {
      return `<a class="nav-item" href="#system/${item.page}" data-page="${item.page}" data-module="system"><span class="nav-item-label">${item.label}</span></a>`;
    }

    sub.innerHTML = [
      ...PINNED_SYSTEM_NAV.map((item) => navLink(item)),
      '<div class="nav-sub-divider" aria-hidden="true"></div>',
      ...rest.map((item) => navLink(item)),
    ].join('');
  }

  function bindNavLinks() {
    const nav = document.getElementById('nav');
    if (!nav || nav.dataset.navBound === 'true') return;
    nav.dataset.navBound = 'true';
    nav.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-sub .nav-item[data-page]');
      if (!link) return;
      const module = link.dataset.module;
      const group = document.querySelector(`.nav-group[data-group="${module}"]`);
      const toggle = document.getElementById(`${module}-toggle`);
      group?.setAttribute('data-expanded', 'true');
      toggle?.setAttribute('aria-expanded', 'true');
    });
  }

  function scrollSystemSubIntoView() {
    const nav = document.getElementById('nav');
    const systemToggle = document.getElementById('system-toggle');
    const sub = document.getElementById('system-sub');
    if (!sub) return;
    requestAnimationFrame(() => {
      systemToggle?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const firstLink = sub.querySelector('.nav-item');
      firstLink?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (nav) {
        nav.scrollTop = Math.max(nav.scrollTop, sub.offsetTop - 8);
      }
    });
  }

  function renderOverview() {
    const s = D.overview;
    const overdue = D.applications.filter((a) => a.isOverdue);
    return `
      ${renderGovernanceBanner()}
      <div class="grid-4">
        <div class="card clickable" data-goto="applications"><h3>待补充材料</h3><div class="value">${s.materialPending}</div></div>
        <div class="card clickable" data-goto="applications"><h3>待安全检测</h3><div class="value">${s.pendingSecurityTest}</div></div>
        <div class="card clickable" data-goto="applications"><h3>待安全评审</h3><div class="value">${s.pendingReview}</div></div>
        <div class="card clickable" data-goto="offline"><h3>待整改 / 复测</h3><div class="value">${s.pendingRemediation + s.pendingRetest}</div></div>
      </div>
      ${renderProcessFlow()}
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">近期待办申请</h3>
          <table>
            <thead><tr><th>申请编号</th><th>智能体</th><th>状态</th></tr></thead>
            <tbody>
              ${D.applications.map((a) => `<tr class="row-link" data-goto="applications/${a.id}"><td>${a.applicationNo}</td><td>${a.agentName}</td><td>${a.status}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3 class="card-title">超期申请</h3>
          ${overdue.length ? overdue.map((a) => `<p class="list-item"><strong>${a.agentName}</strong> <span class="badge danger">超期</span><br><span class="muted-sm">${a.applicationType}</span></p>`).join('') : '<p class="empty">暂无超期申请</p>'}
        </div>
      </div>`;
  }

  function renderApplications() {
    const typeRows = D.applicationTypes.map(
      (t) => `<tr><td><strong>${t.type}</strong></td><td class="muted-cell">${t.desc}</td></tr>`,
    );
    return `
      ${renderGovernanceBanner()}
      ${refTable('准入申请类型', '§10.3', ['申请类型', '说明'], typeRows)}
      <p class="muted-sm" style="margin-bottom:12px">材料检查、自测、检测、风险、整改、评审与结论均在申请详情内按 Tab 处理。</p>
      <div class="toolbar">
        <input placeholder="搜索申请编号或智能体…" style="min-width:220px" />
        <select><option>全部状态</option></select>
        <select><option>全部风险等级</option></select>
        <button class="btn btn-primary">新建申请</button>
      </div>
      <div class="card table-card">
        <table>
          <thead>
            <tr>
              <th>申请编号</th><th>智能体</th><th>申请类型</th><th>部门</th><th>风险</th>
              <th>状态</th><th>申请人</th><th>提交时间</th><th>结论</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${D.applications.map((a) => `
              <tr>
                <td>${a.applicationNo}</td>
                <td>${a.agentName}</td>
                <td>${a.applicationType}</td>
                <td>${a.department}</td>
                <td><span class="badge ${badgeLevel(a.riskLevel)}">${riskLabel(a.riskLevel)}</span></td>
                <td>${a.status}</td>
                <td>${a.applicant}</td>
                <td>${a.submittedAt}</td>
                <td>${a.decision}</td>
                <td><a class="btn btn-sm" href="#applications/${a.id}">查看</a></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderRules() {
    const rows = D.triggerScenarios.map(
      (r) => `<tr><td><strong>${r.trigger}</strong></td><td class="muted-cell">${r.desc}</td><td>${r.required ? '是' : '否'}</td><td>${r.auto ? '是' : '否'}</td></tr>`,
    );
    return `
      ${renderGovernanceBanner()}
      <div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <div><strong>资产变更自动触发</strong><p class="muted-sm">上线、重大变更等须准入场景自动创建任务（开发登记入台账不触发）</p></div>
        <label><input type="checkbox" checked /> 已启用</label>
      </div>
      ${refTable('准入触发场景', '§10.4', ['场景', '说明', '必须准入', '自动触发'], rows)}`;
  }

  function renderMaterials() {
    return `
      <div class="toolbar">
        <select><option>全部状态</option><option>待补充</option><option>已通过</option></select>
        <button class="btn btn-primary">批量检查</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>申请编号</th><th>智能体</th><th>通过项</th><th>状态</th><th>阻塞项</th><th></th></tr></thead>
          <tbody>
            ${D.materialChecks.map((m) => `
              <tr>
                <td>${m.applicationNo}</td>
                <td>${m.agentName}</td>
                <td>${m.passed}/${m.total}</td>
                <td><span class="badge ${m.status === '已通过' ? 'ok' : 'warn'}">${m.status}</span></td>
                <td class="muted-cell">${m.blocker || '—'}</td>
                <td><a class="btn btn-sm" href="#applications/adm-001">查看明细</a></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="card-title">材料检查清单（示例）</h3>
        <ul class="check-list">${D.detail.materials.map((m) => `<li><span class="${m.passed ? 'ok' : 'fail'}">${m.passed ? '✓' : '✗'}</span><div><strong>${m.label}</strong>${m.note ? `<div class="muted-sm">${m.note}</div>` : ''}</div></li>`).join('')}</ul>
      </div>`;
  }

  function renderSelfTests() {
    return `
      <div class="toolbar">
        <button class="btn btn-primary">同步最新自测结果</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>申请编号</th><th>智能体</th><th>通过项</th><th>状态</th><th>备注</th><th></th></tr></thead>
          <tbody>
            ${D.selfTestReads.map((s) => `
              <tr>
                <td>${s.applicationNo}</td>
                <td>${s.agentName}</td>
                <td>${s.passed}/${s.total}</td>
                <td><span class="badge ${s.status === '全部通过' ? 'ok' : 'warn'}">${s.status}</span></td>
                <td class="muted-cell">${s.note || '—'}</td>
                <td><a class="btn btn-sm" href="#applications/adm-001">查看明细</a></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="card-title">自测项明细（示例）</h3>
        <ul class="check-list">${D.detail.selfTests.map((t) => `<li><span class="${t.passed ? 'ok' : 'fail'}">${t.passed ? '✓' : '✗'}</span><div><strong>${t.label}</strong>${t.note ? `<div class="muted-sm">${t.note}</div>` : ''}</div></li>`).join('')}</ul>
      </div>`;
  }

  function renderSecurityTasks() {
    return `
      <div class="toolbar">
        <button class="btn btn-primary">创建检测任务</button>
        <select><option>全部状态</option><option>待创建</option><option>执行中</option><option>已完成</option></select>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>申请编号</th><th>智能体</th><th>任务名称</th><th>类型</th><th>策略</th><th>状态</th><th>检测人</th><th></th></tr></thead>
          <tbody>
            ${D.securityTaskQueue.map((t) => `
              <tr>
                <td>${t.applicationNo}</td>
                <td>${t.agentName}</td>
                <td>${t.taskName}</td>
                <td>${t.type}</td>
                <td>${t.strategy}</td>
                <td><span class="badge ${t.status === '已完成' ? 'ok' : t.status === '执行中' ? 'primary' : ''}">${t.status}</span></td>
                <td>${t.assignee}</td>
                <td><button class="btn btn-sm">${t.status === '待创建' ? '创建' : '查看'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderReviews() {
    const queue = D.applications.filter((a) => a.status.includes('评审') || a.status.includes('审批') || a.status.includes('准入'));
    const first = queue[0] || D.applications[0];
    return `
      ${renderGovernanceBanner()}
      ${renderProcessFlow()}
      <div class="split">
        <div class="card">
          <h3 class="card-title">待评审队列</h3>
          ${queue.map((a) => `<div class="card mini-card" data-goto="applications/${a.id}"><strong>${a.agentName}</strong><div class="muted-sm">${a.applicationNo}</div><div style="margin-top:6px"><span class="badge">${a.status}</span></div></div>`).join('')}
        </div>
        <div class="card">
          <h2 style="margin-bottom:8px">${first.agentName}</h2>
          <p class="muted-sm" style="margin-bottom:12px">${first.applicationType}</p>
          <textarea rows="4" style="width:100%;margin-bottom:12px" placeholder="评审意见…"></textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm">标记阻塞风险</button>
            <button class="btn btn-sm" data-goto="offline">下发整改</button>
            <button class="btn btn-sm btn-primary" data-goto="applications/${first.id}">确认结论</button>
            <a class="btn btn-sm" href="#applications/${first.id}">查看详情</a>
          </div>
        </div>
      </div>`;
  }

  function renderRisks() {
    const risks = D.detail.risks;
    return `
      <div class="toolbar">
        <button class="btn btn-primary">关联风险项</button>
        <select><option>全部等级</option><option>阻塞风险</option></select>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>风险编号</th><th>类型</th><th>等级</th><th>来源</th><th>负责人</th><th>状态</th><th>阻塞</th><th>关联申请</th></tr></thead>
          <tbody>
            ${risks.map((r) => `
              <tr>
                <td>${r.riskNo}</td>
                <td>${r.type}</td>
                <td><span class="badge ${badgeLevel(r.level)}">${riskLabel(r.level)}</span></td>
                <td>${r.source}</td>
                <td>${r.owner}</td>
                <td>${r.status}</td>
                <td>${r.blocking ? '是' : '否'}</td>
                <td>ADM-2026-0001</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderRemediationDispatch() {
    return `
      <div class="toolbar">
        <button class="btn btn-primary">批量下发整改</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>风险编号</th><th>等级</th><th>类型</th><th>智能体</th><th>负责人</th><th>截止</th><th>状态</th><th>已下发</th><th></th></tr></thead>
          <tbody>
            ${D.remediation.map((r) => `
              <tr>
                <td>${r.riskNo}</td>
                <td><span class="badge ${badgeLevel(r.level)}">${riskLabel(r.level)}</span></td>
                <td>${r.type}</td>
                <td>${r.agent}</td>
                <td>${r.owner}</td>
                <td>${r.due}${r.overdue ? ' <span class="badge danger">超期</span>' : ''}</td>
                <td>${r.status}</td>
                <td>${r.dispatched ? '是' : '否'}</td>
                <td><button class="btn btn-sm">${r.dispatched ? '查看' : '下发'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:16px">
        <h3 class="card-title">整改要求模板</h3>
        ${D.detail.remediations.map((r) => `<div class="mini-card" style="margin-bottom:8px"><span class="badge ${badgeLevel(r.level)}">${r.riskNo}</span> <strong>${r.description}</strong><p class="muted-sm" style="margin-top:8px">整改建议：${r.suggestion}</p></div>`).join('')}
      </div>`;
  }

  function renderRetest() {
    const resultBadge = (r) => {
      if (r === 'pass') return 'ok';
      if (r === 'fail') return 'danger';
      return 'warn';
    };
    const resultLabel = (r) => ({ pass: '通过', fail: '未通过', pending: '待确认' }[r] || r);
    return `
      <div class="card table-card">
        <table>
          <thead><tr><th>风险编号</th><th>智能体</th><th>负责人</th><th>提交时间</th><th>复测结果</th><th>备注</th><th></th></tr></thead>
          <tbody>
            ${D.retestResults.map((r) => `
              <tr>
                <td>${r.riskNo}</td>
                <td>${r.agent}</td>
                <td>${r.owner}</td>
                <td>${r.submittedAt}</td>
                <td><span class="badge ${resultBadge(r.result)}">${resultLabel(r.result)}</span></td>
                <td class="muted-cell">${r.note}</td>
                <td><button class="btn btn-sm">${r.result === 'pending' ? '确认' : '查看'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderDecisions() {
    const typeRows = D.decisionTypes.map(
      (d) => `<tr><td><strong>${d.decision}</strong></td><td class="muted-cell">${d.desc}</td><td class="muted-cell">${d.action}</td></tr>`,
    );
    return `
      ${renderGovernanceBanner()}
      ${refTable('准入结论类型', '§10.6', ['结论', '说明', '后续动作'], typeRows)}
      <div class="card" style="margin-top:16px">
        <h3 class="card-title">待确认 / 已生效结论</h3>
        <table>
          <thead><tr><th>申请编号</th><th>智能体</th><th>结论</th><th>评审人</th><th>决定时间</th><th>状态</th><th></th></tr></thead>
          <tbody>
            ${D.decisions.map((d) => `
              <tr>
                <td>${d.applicationNo}</td>
                <td>${d.agentName}</td>
                <td>${d.decision === '—' ? '—' : `<span class="badge primary">${d.decision}</span>`}</td>
                <td>${d.reviewer}</td>
                <td>${d.decidedAt}</td>
                <td>${d.status}</td>
                <td>
                  ${d.decision === '—'
                    ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${D.decisionTypes.slice(0, 4).map((t) => `<button class="btn btn-sm">${t.decision}</button>`).join('')}</div>`
                    : '<button class="btn btn-sm">查看</button>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderLaunchType(type, label) {
    const items = D.launch[type] || [];
    return `
      <div class="toolbar">
        <button class="btn btn-primary">新增${label}策略</button>
      </div>
      ${items.length
        ? items.map((x) => `
          <div class="card" style="margin-bottom:12px">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
              <strong>${x.agent}</strong>
              <span class="badge">${x.no}</span>
              <span class="badge ${x.status === '生效中' ? 'ok' : 'warn'}">${x.status}</span>
            </div>
            <pre class="json">${JSON.stringify(x.conditions, null, 2)}</pre>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button class="btn btn-sm">编辑</button>
              <button class="btn btn-sm">撤销</button>
            </div>
          </div>`).join('')
        : '<p class="empty">暂无记录</p>'}`;
  }

  function renderRiskAcceptance() {
    return D.riskAcceptance.map((r) => `
      <div class="card" style="margin-bottom:12px">
        <strong>${r.agent}</strong> <span class="badge">${r.no}</span> <span class="badge warn">${r.status}</span>
        <p style="margin-top:8px"><span class="muted-sm">残余风险：</span>${r.residual}</p>
        <p><span class="muted-sm">业务必要性：</span>${r.necessity}</p>
        <p><span class="muted-sm">补偿控制：</span>${r.controls}</p>
        <p class="muted-sm" style="margin-top:8px">到期：${r.expires}</p>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm btn-primary">审批通过</button>
          <button class="btn btn-sm">驳回</button>
        </div>
      </div>`).join('');
  }

  function renderOffline() {
    return D.offline.map((o) => `
      <div class="card" style="margin-bottom:12px;display:flex;justify-content:space-between;gap:16px">
        <div><strong>${o.agent}</strong><p class="muted-sm">触发：${o.trigger}</p><p class="muted-sm">动作：${o.action}</p></div>
        <div style="text-align:right"><span class="badge">${o.status}</span><p class="muted-sm" style="margin-top:8px">${o.time}</p></div>
      </div>`).join('');
  }

  function renderArchive() {
    return `
      <div class="toolbar">
        <input placeholder="搜索归档编号或智能体…" />
        <button class="btn btn-primary">归档选中记录</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>归档编号</th><th>申请编号</th><th>智能体</th><th>准入结论</th><th>归档时间</th><th>归档人</th><th></th></tr></thead>
          <tbody>
            ${D.archives.map((a) => `
              <tr>
                <td>${a.archiveNo}</td>
                <td>${a.applicationNo}</td>
                <td>${a.agentName}</td>
                <td><span class="badge primary">${a.decision}</span></td>
                <td>${a.archivedAt}</td>
                <td>${a.archivedBy}</td>
                <td><button class="btn btn-sm" data-goto="archive?tab=reports">查看报告</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderReports() {
    return `
      <div class="toolbar">
        <button class="btn btn-primary">生成准入报告</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>归档编号</th><th>报告标题</th><th>智能体</th><th>申请编号</th><th>结论</th><th>生成时间</th><th>生成人</th><th></th></tr></thead>
          <tbody>
            ${D.reports.map((r) => `
              <tr>
                <td>${r.archiveNo}</td>
                <td>${r.title}</td>
                <td>${r.agent}</td>
                <td>${r.no}</td>
                <td><span class="badge primary">${r.decision}</span></td>
                <td>${r.generated}</td>
                <td>${r.by}</td>
                <td><button class="btn btn-sm">下载</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderPageTabs(tabs, activeId, panelPrefix) {
    const safeActive = tabs.some((t) => t.id === activeId) ? activeId : tabs[0].id;
    return `
      <div class="tabs" id="${panelPrefix}-tabs">
        ${tabs.map((t) => `<button type="button" class="tab${t.id === safeActive ? ' active' : ''}" data-subtab="${t.id}">${t.label}</button>`).join('')}
      </div>
      ${tabs.map((t) => `<div class="tab-panel${t.id === safeActive ? ' active' : ''}" data-subpanel="${t.id}">${t.render()}</div>`).join('')}`;
  }

  function renderLaunchStrategies(activeTab) {
    const tabs = [
      { id: 'conditional', label: '条件上线', render: () => renderLaunchType('conditional', '条件上线') },
      { id: 'gray', label: '灰度上线', render: () => renderLaunchType('gray', '灰度上线') },
      { id: 'degraded', label: '降权上线', render: () => renderLaunchType('degraded', '降权上线') },
      { id: 'risk-acceptance', label: '风险接受', render: renderRiskAcceptance },
    ];
    return renderPageTabs(tabs, activeTab || 'conditional', 'launch');
  }

  function renderOfflinePage(activeTab) {
    const tabs = [
      { id: 'remediation', label: '整改跟踪', render: renderRemediationDispatch },
      { id: 'retest', label: '复测确认', render: renderRetest },
      { id: 'offline', label: '下线处置', render: renderOffline },
    ];
    return renderPageTabs(tabs, activeTab || 'remediation', 'offline');
  }

  function renderArchivePage(activeTab) {
    const tabs = [
      { id: 'archive', label: '记录归档', render: renderArchive },
      { id: 'reports', label: '准入报告', render: renderReports },
    ];
    return renderPageTabs(tabs, activeTab || 'archive', 'archive');
  }

  function renderDetail(id) {
    const d = D.detail;
    return `
      <div style="margin-bottom:12px">
        <a class="btn btn-sm" href="#applications">← 返回列表</a>
        <span class="badge primary" style="margin-left:8px">推荐结论：${d.recommendedDecision}</span>
      </div>
      <div class="tabs" id="detail-tabs">
        ${['基本信息', '材料与自测', '安全检测', '风险项', '整改记录', '审批记录', '准入结论', '归档报告'].map((t, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${i}">${t}</button>`).join('')}
      </div>
      <div class="tab-panel active" data-panel="0">
        <div class="card grid-2" style="display:grid;gap:12px">
          ${[
            ['申请人', d.applicant], ['部门', d.department], ['使用范围', d.usageScope],
            ['安全负责人', d.securityOwner], ['计划上线', d.plannedLaunch], ['能力说明', d.capabilitySummary],
            ['接入工具', d.tools], ['数据范围', d.dataScope], ['权限范围', d.permissionScope], ['申请说明', d.description],
          ].map(([k, v]) => `<div><div class="muted-sm">${k}</div><div>${v}</div></div>`).join('')}
        </div>
      </div>
      <div class="tab-panel" data-panel="1">
        <div class="grid-2">
          <div class="card"><h3 class="card-title">材料完整性检查</h3><ul class="check-list">${d.materials.map((m) => `<li><span class="${m.passed ? 'ok' : 'fail'}">${m.passed ? '✓' : '✗'}</span><div><strong>${m.label}</strong>${m.note ? `<div class="muted-sm">${m.note}</div>` : ''}</div></li>`).join('')}</ul></div>
          <div class="card"><h3 class="card-title">开发自测结果</h3><ul class="check-list">${d.selfTests.map((t) => `<li><span class="${t.passed ? 'ok' : 'fail'}">${t.passed ? '✓' : '✗'}</span><div><strong>${t.label}</strong>${t.note ? `<div class="muted-sm">${t.note}</div>` : ''}</div></li>`).join('')}</ul></div>
        </div>
      </div>
      <div class="tab-panel" data-panel="2">
        <div class="card table-card"><table><thead><tr><th>任务</th><th>类型</th><th>策略</th><th>状态</th><th>SLA</th><th>检测人</th></tr></thead><tbody>${d.securityTests.map((t) => `<tr><td>${t.name}</td><td>${t.type}</td><td>${t.strategy}</td><td>${t.status}</td><td>${t.sla}</td><td>${t.assignee}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="tab-panel" data-panel="3">
        <div class="card table-card"><table><thead><tr><th>风险编号</th><th>类型</th><th>等级</th><th>来源</th><th>负责人</th><th>状态</th><th>阻塞</th></tr></thead><tbody>${d.risks.map((r) => `<tr><td>${r.riskNo}</td><td>${r.type}</td><td><span class="badge ${badgeLevel(r.level)}">${riskLabel(r.level)}</span></td><td>${r.source}</td><td>${r.owner}</td><td>${r.status}</td><td>${r.blocking ? '是' : '否'}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="tab-panel" data-panel="4">
        ${d.remediations.map((r) => `<div class="card" style="margin-bottom:12px"><span class="badge ${badgeLevel(r.level)}">${r.riskNo}</span> <strong>${r.description}</strong><p class="muted-sm" style="margin-top:8px">整改建议：${r.suggestion}</p></div>`).join('')}
      </div>
      <div class="tab-panel" data-panel="5">
        ${d.approvals.map((a) => `<div class="timeline-item"><strong>${a.role} · ${a.actor}</strong><div class="muted-sm">${a.time} — ${a.action}</div><p style="margin-top:4px">${a.comment}</p></div>`).join('')}
      </div>
      <div class="tab-panel" data-panel="6">
        <div class="card">
          <textarea rows="4" style="width:100%;margin-bottom:12px" placeholder="评审意见…"></textarea>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${D.decisionTypes.map((t) => `<button class="btn btn-sm">${t.decision}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="tab-panel" data-panel="7">
        <div class="card">
          <p class="muted-sm" style="margin-bottom:12px">尚未生成准入报告（演示）</p>
          <button class="btn btn-primary">生成准入报告</button>
        </div>
      </div>`;
  }

  function renderModelCards(models, type) {
    const def = modelTypeDef(type);
    const label = def?.label || type;
    if (!models.length) {
      return `<div class="model-empty">暂无 ${label}<button class="btn btn-primary btn-sm model-empty-add" data-add-model="${type}">+ 添加模型</button></div>`;
    }
    return `<div class="model-card-list">${models
      .map(
        (m) => `
      <div class="model-card">
        <div class="model-card-meta">
          <strong>${m.name}${m.builtin ? ' <span class="badge">内置</span>' : ''}</strong>
          <div class="muted-sm">${D.modelProviders.find((p) => p.id === m.provider)?.label || m.provider} · ${m.endpoint || '—'}</div>
        </div>
        <div class="model-card-actions">
          <span class="badge ${m.status === 'active' ? 'ok' : 'warn'}">${m.status === 'active' ? '可用' : '不可用'}</span>
          ${m.builtin ? '' : `<button class="btn btn-sm" data-edit-model="${type}" data-model-id="${m.id}">编辑</button><button class="btn btn-sm" data-del-model="${type}" data-model-id="${m.id}">删除</button>`}
        </div>
      </div>`,
      )
      .join('')}</div>`;
  }

  function renderModels() {
    const models = getModels();
    const sections = (D.modelTypeDefs || []).map(
      (def) => `
      <div class="model-section">
        <div class="model-section-head">
          <div>
            <h3>${def.label}</h3>
            <p class="muted-sm">${def.desc}</p>
          </div>
          <button class="btn btn-primary btn-sm" data-add-model="${def.id}">+ 添加模型</button>
        </div>
        ${renderModelCards(models[def.id] || [], def.id)}
      </div>`,
    );
    return `
      <div class="ia-callout">
        <strong>信息架构</strong>
        <p>本页按类型维护对话、Embedding、ReRank、视觉与语音模型；智能体在「智能体管理」中绑定对话模型后，供 <a href="#agent-chat">Agent 对话</a> 使用。</p>
      </div>
      <div class="info-callout">
        <strong>内置模型</strong> 对所有租户可见，敏感信息会被隐藏，且不可编辑或删除。
        <a href="#system/agents-mgmt">前往智能体管理绑定模型 →</a>
      </div>
      ${sections.join('')}`;
  }

  function bindModelsPage() {
    content.querySelectorAll('[data-add-model]').forEach((btn) => {
      btn.addEventListener('click', () => openModelModal(btn.dataset.addModel));
    });
    content.querySelectorAll('[data-edit-model]').forEach((btn) => {
      btn.addEventListener('click', () => openModelModal(btn.dataset.editModel, btn.dataset.modelId));
    });
    content.querySelectorAll('[data-del-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('确定删除该模型？')) return;
        const models = getModels();
        const type = btn.dataset.delModel;
        models[type] = models[type].filter((m) => m.id !== btn.dataset.modelId);
        saveModels(models);
        route();
      });
    });
  }

  function openModelModal(type, modelId) {
    const models = getModels();
    const existing = modelId ? models[type]?.find((m) => m.id === modelId) : null;
    const def = modelTypeDef(type);
    const providerOptions = D.modelProviders
      .map((p) => `<option value="${p.id}" ${existing?.provider === p.id ? 'selected' : ''}>${p.label}</option>`)
      .join('');
    openModal(`
      <div class="modal-dialog modal-dialog-sm" role="dialog" aria-labelledby="model-modal-title">
        <div class="modal-header">
          <div>
            <h2 id="model-modal-title">${existing ? '编辑模型' : '添加模型'}</h2>
            ${def?.desc ? `<p class="modal-header-sub">${def.desc}</p>` : ''}
          </div>
          <button type="button" class="modal-close" data-modal-close aria-label="关闭">×</button>
        </div>
        <form id="model-form" class="modal-content">
          <div class="form-row-2">
            <div class="form-field">
              <label>模型名称 <span class="required">*</span></label>
              <input name="name" required placeholder="如 Qwen2.5-72B-Instruct" value="${existing?.name || ''}" />
            </div>
            <div class="form-field">
              <label>提供商</label>
              <select name="provider">${providerOptions}</select>
            </div>
          </div>
          <div class="form-field">
            <label>端点地址</label>
            <input name="endpoint" placeholder="https://api.example.com/v1" value="${existing?.endpoint || ''}" />
          </div>
        </form>
        <div class="modal-footer">
          <button type="button" class="btn" data-modal-close>取消</button>
          <button type="submit" form="model-form" class="btn btn-primary">确认</button>
        </div>
      </div>`);
    document.getElementById('model-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const entry = {
        id: existing?.id || `mdl-${type}-${Date.now()}`,
        name: fd.get('name'),
        provider: fd.get('provider'),
        endpoint: fd.get('endpoint'),
        builtin: false,
        status: 'active',
      };
      const next = getModels();
      if (!next[type]) next[type] = [];
      if (existing) {
        next[type] = next[type].map((m) => (m.id === existing.id ? { ...m, ...entry } : m));
      } else {
        next[type].push(entry);
      }
      saveModels(next);
      closeModal();
      route();
    });
  }

  function renderAgentsMgmt() {
    const agents = getAgents();
    return `
      <div class="ia-callout">
        <strong>信息架构</strong>
        <p>创建「快速问答」或「智能推理」智能体；模型来自 <a href="#system/models">模型管理</a>。维护完成后在 <a href="#agent-chat">Agent 对话</a> 中选择智能体测试。</p>
      </div>
      <div class="toolbar">
        <input placeholder="搜索智能体名称…" id="agent-search" style="min-width:220px" />
        <select id="agent-type-filter"><option value="">全部类型</option><option value="quick_qa">快速问答</option><option value="reasoning">推理智能体</option></select>
        <button class="btn btn-primary" data-create-agent>+ 创建智能体</button>
      </div>
      <div class="agent-grid" id="agent-grid">
        ${agents
          .map(
            (a) => `
          <div class="agent-card" data-agent-id="${a.id}" data-agent-type="${a.type}">
            <div class="agent-card-head">
              <div class="agent-card-icon">${a.icon || '🤖'}</div>
              <div>
                <div class="agent-card-title">${a.name}</div>
                <span class="badge ${a.type === 'reasoning' ? 'primary' : 'ok'}">${agentTypeLabel(a.type)}</span>
              </div>
            </div>
            <p class="agent-card-desc">${a.description || '—'}</p>
            <div class="muted-sm">模型：${modelById(a.modelId)?.name || '未配置'}</div>
            ${a.type === 'reasoning' && a.skills?.length ? `<div class="skill-tag-list">${a.skills.map((s) => `<span class="skill-tag">${D.agentOptions.skills.find((x) => x.id === s)?.name || s}</span>`).join('')}</div>` : ''}
            <div class="agent-card-footer">
              <span class="muted-sm">更新 ${a.updatedAt || '—'}</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm" data-edit-agent="${a.id}">编辑</button>
                <button class="btn btn-sm" data-chat-agent="${a.id}">对话</button>
              </div>
            </div>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  function bindAgentsMgmt() {
    content.querySelector('[data-create-agent]')?.addEventListener('click', () => openAgentModal());
    content.querySelectorAll('[data-edit-agent]').forEach((btn) => {
      btn.addEventListener('click', () => openAgentModal(btn.dataset.editAgent));
    });
    content.querySelectorAll('[data-chat-agent]').forEach((btn) => {
      btn.addEventListener('click', () => {
        location.hash = `agent-chat?agent=${btn.dataset.chatAgent}`;
      });
    });
    const search = content.querySelector('#agent-search');
    const filter = content.querySelector('#agent-type-filter');
    function applyFilter() {
      const q = (search?.value || '').toLowerCase();
      const t = filter?.value || '';
      content.querySelectorAll('#agent-grid .agent-card').forEach((card) => {
        const name = card.querySelector('.agent-card-title')?.textContent?.toLowerCase() || '';
        const type = card.dataset.agentType || '';
        const matchQ = !q || name.includes(q);
        const matchT = !t || type === t;
        card.style.display = matchQ && matchT ? '' : 'none';
      });
    }
    search?.addEventListener('input', applyFilter);
    filter?.addEventListener('change', applyFilter);
  }

  function agentModalNavItems(type) {
    if (type === 'reasoning') {
      return [
        { id: 'basic', icon: 'ℹ', label: '基本信息' },
        { id: 'model', icon: '▣', label: '模型配置' },
        { id: 'kb', icon: '📁', label: '知识库' },
        { id: 'tools', icon: '🔧', label: '工具配置' },
        { id: 'skills', icon: '⚡', label: '技能 Skills' },
        { id: 'web', icon: '🌐', label: '网络搜索' },
        { id: 'multi', icon: '🖼', label: '多模态' },
      ];
    }
    return [
      { id: 'basic', icon: 'ℹ', label: '基本信息' },
      { id: 'model', icon: '▣', label: '模型配置' },
      { id: 'kb', icon: '📁', label: '知识库' },
      { id: 'web', icon: '🌐', label: '网络搜索' },
      { id: 'multi', icon: '🖼', label: '多模态' },
      { id: 'turns', icon: '💬', label: '多轮对话' },
    ];
  }

  function renderAgentModalPanel(panel, draft) {
    const chatModels = getModels().chat;
    const modelOptions = chatModels
      .map((m) => `<option value="${m.id}" ${draft.modelId === m.id ? 'selected' : ''}>${m.name}</option>`)
      .join('');
    const kbChecks = D.agentOptions.knowledgeBases
      .map(
        (kb) => `
      <label class="checkbox-item">
        <input type="checkbox" name="kb" value="${kb.id}" ${draft.knowledgeBases?.includes(kb.id) ? 'checked' : ''} />
        <span>${kb.name}</span>
      </label>`,
      )
      .join('');
    const toolChecks = D.agentOptions.tools
      .map(
        (t) => `
      <label class="checkbox-item">
        <input type="checkbox" name="tools" value="${t.id}" ${draft.tools?.includes(t.id) ? 'checked' : ''} />
        <span>${t.name}<div class="checkbox-item-desc">风险：${t.risk}</div></span>
      </label>`,
      )
      .join('');
    const skillChecks = D.agentOptions.skills
      .map(
        (s) => `
      <label class="checkbox-item">
        <input type="checkbox" name="skills" value="${s.id}" ${draft.skills?.includes(s.id) ? 'checked' : ''} />
        <span>${s.name}<div class="checkbox-item-desc">${s.desc}</div></span>
      </label>`,
      )
      .join('');

    if (panel === 'basic') {
      const modeDesc =
        draft.type === 'reasoning' ? '多步思考，深度分析复杂问题' : '快速响应，直接回答问题';
      return `
        <h3>基本信息</h3>
        <p class="section-desc">配置智能体的基本信息</p>
        <div class="form-field">
          <label>运行模式 <span class="required">*</span></label>
          <div class="mode-toggle" data-mode-toggle>
            <button type="button" data-mode="quick_qa" class="${draft.type === 'quick_qa' ? 'active' : ''}">快速问答</button>
            <button type="button" data-mode="reasoning" class="${draft.type === 'reasoning' ? 'active' : ''}">智能推理</button>
          </div>
          <div class="field-hint" data-mode-desc>${modeDesc}</div>
        </div>
        <div class="form-field">
          <label>名称 <span class="required">*</span></label>
          <div class="name-with-icon">
            <span class="agent-icon-preview" data-icon-preview>${draft.icon || '🤖'}</span>
            <input name="name" required placeholder="请输入智能体名称" value="${draft.name || ''}" />
          </div>
          <div class="field-hint">为智能体设置一个易于识别的名称</div>
        </div>
        <div class="form-field">
          <label>图标（演示）</label>
          <input name="icon" maxlength="2" placeholder="如 🤖 ◇ ◫" value="${draft.icon || '🤖'}" data-icon-input />
          <div class="field-hint">单字符或 emoji，显示在列表与对话选择器中</div>
        </div>
        <div class="form-field">
          <label>描述</label>
          <textarea name="description" rows="2" placeholder="请输入智能体描述">${draft.description || ''}</textarea>
          <div class="field-hint">简要描述智能体的用途和特点</div>
        </div>
        <div class="form-field">
          <label>系统提示词 <span class="required">*</span></label>
          <div class="field-hint" style="margin-bottom:6px">可用变量：（点击插入，或输入 &#123;&#123; 唤起列表）</div>
          <textarea name="systemPrompt" rows="5" required placeholder="自定义系统提示词，定义智能体的行为和角色（使用 {{web_search_status}} 占位符动态控制网络搜索行为）">${draft.systemPrompt || ''}</textarea>
        </div>`;
    }
    if (panel === 'model') {
      return `
        <h3>模型配置</h3>
        <p class="section-desc">选择对话所使用的大语言模型（在模型管理中维护）</p>
        <div class="form-field">
          <label>对话模型 <span class="required">*</span></label>
          <select name="modelId" required>${modelOptions || '<option value="">请先在模型管理中添加对话模型</option>'}</select>
        </div>`;
    }
    if (panel === 'kb') {
      return `<h3>知识库</h3><p class="section-desc">关联 RAG 知识库以增强回答准确性</p><div class="checkbox-grid">${kbChecks}</div>`;
    }
    if (panel === 'tools') {
      return `<h3>工具配置</h3><p class="section-desc">为推理智能体挂载可调用的工具（高危工具须通过准入评审）</p><div class="checkbox-grid">${toolChecks}</div>`;
    }
    if (panel === 'skills') {
      return `<h3>技能 Skills</h3><p class="section-desc">为推理智能体挂载专项技能模块</p><div class="checkbox-grid">${skillChecks}</div>`;
    }
    if (panel === 'web') {
      return `
        <h3>网络搜索</h3>
        <p class="section-desc">启用后智能体可检索实时网络信息</p>
        <label class="checkbox-item" style="max-width:320px">
          <input type="checkbox" name="webSearch" ${draft.webSearch ? 'checked' : ''} />
          <span>启用网络搜索</span>
        </label>`;
    }
    if (panel === 'multi') {
      return `
        <h3>多模态</h3>
        <p class="section-desc">支持图片、文件等 multimodal 输入</p>
        <label class="checkbox-item" style="max-width:320px">
          <input type="checkbox" name="multimodal" ${draft.multimodal ? 'checked' : ''} />
          <span>启用多模态输入</span>
        </label>`;
    }
    if (panel === 'turns') {
      return `
        <h3>多轮对话</h3>
        <p class="section-desc">配置上下文记忆与轮次限制</p>
        <label class="checkbox-item" style="max-width:320px">
          <input type="checkbox" name="multiTurn" ${draft.multiTurn !== false ? 'checked' : ''} />
          <span>启用多轮上下文记忆</span>
        </label>`;
    }
    return '';
  }

  function openAgentModal(editId) {
    const existing = editId ? getAgents().find((a) => a.id === editId) : null;
    let draft = existing
      ? { ...existing, knowledgeBases: [...(existing.knowledgeBases || [])], tools: [...(existing.tools || [])], skills: [...(existing.skills || [])] }
      : {
          id: '',
          name: '',
          icon: '🤖',
          type: 'quick_qa',
          description: '',
          systemPrompt: '',
          modelId: getModels().chat[0]?.id || '',
          knowledgeBases: [],
          tools: [],
          skills: [],
          webSearch: false,
          multimodal: false,
          multiTurn: true,
        };
    let activePanel = 'basic';

    function renderModal() {
      const navItems = agentModalNavItems(draft.type);
      if (!navItems.find((n) => n.id === activePanel)) activePanel = 'basic';
      openModal(`
        <div class="modal-dialog" role="dialog" aria-labelledby="agent-modal-title">
          <div class="modal-header">
            <h2 id="agent-modal-title">${existing ? '编辑智能体' : '创建智能体'}</h2>
            <button type="button" class="modal-close" data-modal-close aria-label="关闭">×</button>
          </div>
          <div class="modal-body">
            <nav class="modal-sidebar" aria-label="配置步骤">
              ${navItems.map((n) => `<button type="button" class="modal-nav-item${n.id === activePanel ? ' active' : ''}" data-agent-panel="${n.id}"><span class="modal-nav-icon">${n.icon}</span>${n.label}</button>`).join('')}
            </nav>
            <form id="agent-form" class="modal-content">${renderAgentModalPanel(activePanel, draft)}</form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" data-modal-close>取消</button>
            <button type="submit" form="agent-form" class="btn btn-primary">确认</button>
          </div>
        </div>`);
      bindAgentModalForm();
    }

    function readFormIntoDraft() {
      const form = document.getElementById('agent-form');
      if (!form) return;
      const fd = new FormData(form);
      if (fd.has('name')) draft.name = fd.get('name');
      if (fd.has('icon')) draft.icon = fd.get('icon') || '🤖';
      if (fd.has('description')) draft.description = fd.get('description');
      if (fd.has('systemPrompt')) draft.systemPrompt = fd.get('systemPrompt');
      if (fd.has('modelId')) draft.modelId = fd.get('modelId');
      draft.knowledgeBases = fd.getAll('kb');
      draft.tools = fd.getAll('tools');
      draft.skills = fd.getAll('skills');
      draft.webSearch = fd.has('webSearch');
      draft.multimodal = fd.has('multimodal');
      draft.multiTurn = fd.has('multiTurn');
    }

    function bindAgentModalForm() {
      modalRoot.querySelectorAll('[data-agent-panel]').forEach((btn) => {
        btn.addEventListener('click', () => {
          readFormIntoDraft();
          activePanel = btn.dataset.agentPanel;
          renderModal();
        });
      });
      modalRoot.querySelectorAll('[data-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          readFormIntoDraft();
          draft.type = btn.dataset.mode;
          renderModal();
        });
      });
      const iconInput = modalRoot.querySelector('[data-icon-input]');
      const iconPreview = modalRoot.querySelector('[data-icon-preview]');
      iconInput?.addEventListener('input', () => {
        if (iconPreview) iconPreview.textContent = iconInput.value || '🤖';
      });
      document.getElementById('agent-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        readFormIntoDraft();
        if (!draft.name?.trim() || !draft.systemPrompt?.trim()) {
          activePanel = 'basic';
          renderModal();
          return;
        }
        const agents = getAgents();
        const entry = {
          ...draft,
          id: existing?.id || `agent-${Date.now()}`,
          status: 'active',
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        if (existing) {
          saveAgents(agents.map((a) => (a.id === existing.id ? entry : a)));
        } else {
          saveAgents([...agents, entry]);
        }
        closeModal();
        route();
      });
    }

    renderModal();
  }

  function renderAgentChat(preselectedId) {
    const agents = getAgents().filter((a) => a.status !== 'disabled');
    if (!agents.length) {
      return `
        <div class="ia-callout">
          <strong>尚未配置智能体</strong>
          <p>请先在系统管理中维护模型与智能体，再返回本页对话测试。</p>
          <div class="ia-callout-actions">
            <a class="btn btn-sm btn-primary" href="#system/models">模型管理</a>
            <a class="btn btn-sm" href="#system/agents-mgmt">智能体管理</a>
          </div>
        </div>
        <div class="empty" style="padding:48px 24px;text-align:center">
          <p class="muted-sm">信息架构：Agent 对话（一级）← 智能体管理 ← 模型管理</p>
        </div>`;
    }
    const selectedId = preselectedId && agents.find((a) => a.id === preselectedId) ? preselectedId : agents[0]?.id;
    const selected = agents.find((a) => a.id === selectedId);
    const history = selectedId ? getChatHistory(selectedId) : [];
    const agentMenuItems = agents
      .map(
        (a) => `
        <button type="button" class="ac-agent-menu-item${a.id === selectedId ? ' active' : ''}" data-ac-agent-pick="${a.id}">
          <span class="ac-agent-menu-icon" aria-hidden="true">${a.icon || '◇'}</span>
          <span class="ac-agent-menu-text">
            <strong>${a.name}</strong>
            <span class="muted-sm">${agentTypeLabel(a.type)}</span>
          </span>
        </button>`,
      )
      .join('');
    return `
      <div id="agentChatRoot" data-ac-selected-agent="${selectedId || ''}">
        <div class="ac-shell">
          <nav class="ac-nav">
            ${selected ? `<span class="ac-nav-agent-name">${selected.icon || '◇'} ${selected.name}</span>` : ''}
            ${selected ? `<span class="badge ${selected.type === 'reasoning' ? 'primary' : 'ok'}">${agentTypeLabel(selected.type)}</span>` : ''}
            <span class="muted-sm ac-model-label">模型：${modelById(selected?.modelId)?.name || '未配置'}</span>
            <div class="ac-nav-links">
              <a class="btn btn-sm" href="#system/agents-mgmt">智能体管理</a>
              <a class="btn btn-sm" href="#system/models">模型管理</a>
            </div>
          </nav>
          <main class="ac-main">
            <div class="ac-chat-body" id="ac-chat-body">
              ${history.length
                ? history
                    .map(
                      (m) => `
                <div class="ac-msg ${m.role}">
                  ${m.role === 'assistant' ? `<div class="ac-msg-meta">${selected?.name || 'Agent'}</div>` : ''}
                  ${m.attachments?.length ? `<div class="ac-msg-files">${m.attachments.map((f) => `<span class="ac-file-chip">${f}</span>`).join('')}</div>` : ''}
                  ${m.content}
                </div>`,
                    )
                    .join('')
                : `<div class="empty" style="margin:auto">点击输入框左侧切换智能体后开始对话${selected?.type === 'reasoning' ? ' · 推理模式支持 Skills 与工具调用' : ''}</div>`}
            </div>
            <footer class="ac-composer-wrap">
              <div class="ac-attachments" id="ac-attachments" hidden></div>
              <div class="ac-composer">
                <input type="file" id="ac-file-input" class="ac-file-input" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" />
                <button type="button" class="ac-composer-attach" data-ac-file-trigger title="上传文件" aria-label="上传文件">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <div class="ac-agent-picker">
                  <button type="button" class="ac-composer-plus" data-ac-agent-toggle title="切换智能体" aria-label="切换智能体" aria-expanded="false" aria-haspopup="true">
                    <span class="ac-composer-plus-icon">${selected?.icon || '◇'}</span>
                  </button>
                  <div class="ac-agent-menu" data-ac-agent-menu hidden role="menu" aria-label="选择智能体">
                    ${agentMenuItems}
                  </div>
                </div>
                <textarea id="ac-input" placeholder="输入消息…" rows="1"></textarea>
                <button class="btn btn-primary ac-send-btn" id="ac-send" type="button">发送</button>
              </div>
            </footer>
          </main>
        </div>
      </div>`;
  }

  function bindAgentChat(preselectedId) {
    const root = content.querySelector('#agentChatRoot');
    const agentId = root?.dataset.acSelectedAgent || preselectedId;
    let pendingFiles = [];

    function closeAgentMenu() {
      const menu = content.querySelector('[data-ac-agent-menu]');
      const toggle = content.querySelector('[data-ac-agent-toggle]');
      menu?.setAttribute('hidden', '');
      toggle?.setAttribute('aria-expanded', 'false');
    }

    function renderAttachmentPreview() {
      const wrap = content.querySelector('#ac-attachments');
      if (!wrap) return;
      if (!pendingFiles.length) {
        wrap.hidden = true;
        wrap.innerHTML = '';
        return;
      }
      wrap.hidden = false;
      wrap.innerHTML = pendingFiles
        .map(
          (file, i) => `
        <span class="ac-file-chip">
          ${file.name}
          <button type="button" class="ac-file-remove" data-ac-file-remove="${i}" aria-label="移除 ${file.name}">×</button>
        </span>`,
        )
        .join('');
      wrap.querySelectorAll('[data-ac-file-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pendingFiles.splice(Number(btn.dataset.acFileRemove), 1);
          renderAttachmentPreview();
        });
      });
    }

    content.querySelector('[data-ac-file-trigger]')?.addEventListener('click', () => {
      content.querySelector('#ac-file-input')?.click();
    });

    content.querySelector('#ac-file-input')?.addEventListener('change', (e) => {
      const picked = [...(e.target.files || [])];
      if (picked.length) pendingFiles.push(...picked);
      e.target.value = '';
      renderAttachmentPreview();
    });

    content.querySelector('[data-ac-agent-toggle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = content.querySelector('[data-ac-agent-menu]');
      const toggle = content.querySelector('[data-ac-agent-toggle]');
      if (!menu || !toggle) return;
      const open = menu.hasAttribute('hidden');
      if (open) {
        menu.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        closeAgentMenu();
      }
    });

    content.querySelectorAll('[data-ac-agent-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeAgentMenu();
        location.hash = `agent-chat?agent=${btn.dataset.acAgentPick}`;
      });
    });

    root?.addEventListener('click', (e) => {
      if (e.target.closest('[data-ac-agent-toggle]') || e.target.closest('[data-ac-agent-menu]')) return;
      closeAgentMenu();
    });

    const input = content.querySelector('#ac-input');
    const send = () => {
      const text = input?.value?.trim();
      const fileNames = pendingFiles.map((f) => f.name);
      if (!text && !fileNames.length) return;
      const agent = getAgents().find((a) => a.id === agentId);
      const userContent = text || '（已上传附件）';
      saveChatMessage(agentId, {
        role: 'user',
        content: userContent,
        attachments: fileNames.length ? fileNames : undefined,
        ts: Date.now(),
      });
      const fileNote = fileNames.length ? ` 已收到附件：${fileNames.join('、')}。` : '';
      const reply =
        agent?.type === 'reasoning'
          ? `（推理模式演示）已收到：「${userContent}」。${fileNote}${agent.skills?.length ? `挂载技能：${agent.skills.map((s) => D.agentOptions.skills.find((x) => x.id === s)?.name || s).join('、')}。` : ''} 实际环境将调用模型 ${modelById(agent.modelId)?.name || '—'} 进行多步推理。`
          : `（快速问答演示）${userContent}${fileNote} — 这是 ${agent?.name || 'Agent'} 的模拟回复。`;
      saveChatMessage(agentId, { role: 'assistant', content: reply, ts: Date.now() });
      input.value = '';
      pendingFiles = [];
      renderAttachmentPreview();
      route();
    };
    content.querySelector('#ac-send')?.addEventListener('click', send);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  const SYSTEM_RENDERERS = {
    tenant() {
      const rows = D.systemData.organizations.map(
        (o) => `<tr><td><strong>${o.name}</strong></td><td>${o.slug}</td><td>${o.plan}</td><td>${o.members}</td><td><span class="badge ok">${o.status}</span></td><td><button class="btn btn-sm">管理</button></td></tr>`,
      );
      return `
        <div class="toolbar"><button class="btn btn-primary">新建组织</button></div>
        <div class="card table-card"><table><thead><tr><th>组织</th><th>标识</th><th>套餐</th><th>成员</th><th>状态</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    },
    iam() {
      const sd = D.systemData;
      return `
        <div class="domain-grid">
          <div class="domain-card" data-goto="system/iam"><h4>用户</h4><p>${sd.users.length} 名用户</p></div>
          <div class="domain-card"><h4>团队</h4><p>按项目划分协作单元</p></div>
          <div class="domain-card"><h4>角色</h4><p>自定义 RBAC 角色</p></div>
          <div class="domain-card"><h4>权限目录</h4><p>系统权限只读说明</p></div>
        </div>
        <div class="card table-card"><table><thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th></th></tr></thead><tbody>
          ${sd.users.map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><span class="badge ${u.status === 'active' ? 'ok' : 'warn'}">${u.status}</span></td><td><button class="btn btn-sm">编辑</button></td></tr>`).join('')}
        </tbody></table></div>`;
    },
    platform() {
      const flags = D.systemData.featureFlags.map(
        (f) => `<div class="card mini-card" style="display:flex;justify-content:space-between;align-items:center"><div><strong>${f.label}</strong><p class="muted-sm">${f.key}</p></div><label><input type="checkbox" ${f.enabled ? 'checked' : ''} /> 启用</label></div>`,
      );
      return `
        <div class="grid-2">
          <div class="card"><h3 class="card-title">通用设置</h3>
            <p class="muted-sm" style="margin-bottom:8px">系统名称</p><input value="DodoGuard Enterprise" style="width:100%;margin-bottom:12px" />
            <p class="muted-sm" style="margin-bottom:8px">时区</p><input value="Asia/Shanghai" style="width:100%" />
          </div>
          <div class="card"><h3 class="card-title">功能开关</h3>${flags.join('')}</div>
        </div>`;
    },
    'security-auth'() {
      return `
        <div class="grid-2">
          <div class="card"><h3 class="card-title">密码策略</h3>
            <p class="muted-sm">最小长度</p><input type="number" value="8" style="width:100%;margin:8px 0 12px" />
            <label><input type="checkbox" checked /> 要求大写字母</label><br>
            <label><input type="checkbox" checked /> 要求数字</label>
          </div>
          <div class="card"><h3 class="card-title">认证与会话</h3>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px"><span>强制 MFA</span><input type="checkbox" /></label>
            <p class="muted-sm">会话超时（秒）</p><input type="number" value="3600" style="width:100%;margin-top:8px" />
            <p class="muted-sm" style="margin-top:12px">SSO：SAML / OIDC（演示未配置）</p>
          </div>
        </div>`;
    },
    integrations() {
      const rows = D.systemData.integrations.map(
        (i) => `<tr><td>${i.name}</td><td>${i.type}</td><td>${i.status}</td><td>${i.tested}</td><td><button class="btn btn-sm">配置</button></td></tr>`,
      );
      return `
        <div class="toolbar"><button class="btn btn-primary">添加集成</button></div>
        <div class="card table-card"><table><thead><tr><th>名称</th><th>类型</th><th>状态</th><th>连通性</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    },
    notifications() {
      return `
        <div class="card">
          <label style="display:flex;justify-content:space-between;margin-bottom:16px"><div><strong>邮件通知</strong><p class="muted-sm">重要事件邮件提醒</p></div><input type="checkbox" checked /></label>
          <label style="display:flex;justify-content:space-between;margin-bottom:16px"><div><strong>任务完成通知</strong><p class="muted-sm">攻击任务结束时通知</p></div><input type="checkbox" checked /></label>
          <label style="display:flex;justify-content:space-between"><div><strong>高风险发现告警</strong><p class="muted-sm">发现严重漏洞立即告警</p></div><input type="checkbox" checked /></label>
        </div>`;
    },
    audit() {
      const rows = D.systemData.auditLogs.map(
        (l) => `<tr><td>${l.time}</td><td>${l.actor}</td><td>${l.action}</td><td>${l.target}</td></tr>`,
      );
      return `
        <div class="toolbar"><input placeholder="搜索操作或操作者…" /><button class="btn">导出 CSV</button></div>
        <div class="card table-card"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    },
    'open-api'() {
      return `
        <div class="toolbar"><button class="btn btn-primary">新建 API 密钥</button></div>
        <div class="card"><h3 class="card-title">API 密钥</h3><p class="muted-sm">完整密钥仅在创建时显示一次。</p>
          <table style="margin-top:12px"><thead><tr><th>名称</th><th>前缀</th><th>状态</th><th>创建时间</th></tr></thead>
          <tbody><tr><td>CI 流水线</td><td>dg_live_••••</td><td><span class="badge ok">有效</span></td><td>2026-06-01</td></tr></tbody></table>
        </div>`;
    },
    subscription() {
      return `
        <div class="grid-4">
          <div class="card"><h3>当前套餐</h3><div class="value" style="font-size:18px">Enterprise</div></div>
          <div class="card"><h3>本月任务</h3><div class="value">42</div></div>
          <div class="card"><h3>智能体</h3><div class="value">18</div></div>
          <div class="card"><h3>团队成员</h3><div class="value">48</div></div>
        </div>
        <div class="card"><h3 class="card-title">配额用量</h3><p class="muted-sm">攻击任务 / 月：42 / ∞ · 审计保留：90 天</p></div>`;
    },
    ops() {
      const q = D.systemData.queue;
      return `
        <div class="grid-4">
          <div class="card"><h3>待处理</h3><div class="value">${q.pending}</div></div>
          <div class="card"><h3>执行中</h3><div class="value">${q.processing}</div></div>
          <div class="card"><h3>已完成</h3><div class="value">${q.completed}</div></div>
          <div class="card"><h3>失败</h3><div class="value" style="color:var(--danger)">${q.failed}</div></div>
        </div>
        <div class="toolbar"><button class="btn btn-primary">清理已完成</button><button class="btn">维护模式</button></div>`;
    },
    models: renderModels,
    'agents-mgmt': renderAgentsMgmt,
  };

  const LEGACY_PAGE_REDIRECTS = {
    materials: { page: 'applications' },
    'self-tests': { page: 'applications' },
    'security-tasks': { page: 'applications' },
    reviews: { page: 'applications' },
    risks: { page: 'applications' },
    'remediation-dispatch': { page: 'offline', tab: 'remediation' },
    retest: { page: 'offline', tab: 'retest' },
    decisions: { page: 'applications' },
    'launch-conditional': { page: 'launch-strategies', tab: 'conditional' },
    'launch-gray': { page: 'launch-strategies', tab: 'gray' },
    'launch-degraded': { page: 'launch-strategies', tab: 'degraded' },
    'risk-acceptance': { page: 'launch-strategies', tab: 'risk-acceptance' },
    reports: { page: 'archive', tab: 'reports' },
  };

  const RENDERERS = {
    overview: renderOverview,
    applications: renderApplications,
    rules: renderRules,
    'launch-strategies': renderLaunchStrategies,
    offline: renderOfflinePage,
    archive: renderArchivePage,
  };

  function bindDetailTabs(initialTab) {
    document.querySelectorAll('#detail-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = tab.dataset.tab;
        document.querySelectorAll('#detail-tabs .tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.tab-panel[data-panel="${idx}"]`)?.classList.add('active');
      });
    });
    if (initialTab != null) {
      const tabIdx = String(initialTab);
      document.querySelectorAll('#detail-tabs .tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.querySelector(`#detail-tabs .tab[data-tab="${tabIdx}"]`)?.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${tabIdx}"]`)?.classList.add('active');
    }
  }

  function bindSubTabs(page) {
    const prefix =
      page === 'launch-strategies' ? 'launch' : page === 'offline' ? 'offline' : page === 'archive' ? 'archive' : null;
    if (!prefix) return;
    const tabsEl = document.getElementById(`${prefix}-tabs`);
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        location.hash = `${page}?tab=${tab.dataset.subtab}`;
      });
    });
  }

  function bindGoto() {
    content.querySelectorAll('[data-goto]').forEach((el) => {
      el.addEventListener('click', () => {
        location.hash = el.dataset.goto;
      });
    });
  }

  function route() {
    const defaultPage = D.navItems[0]?.page || 'overview';
    const hash = (location.hash || `#${defaultPage}`).slice(1);
    const [pathPart, queryPart] = hash.split('?');
    const parts = pathPart.split('/');
    const query = new URLSearchParams(queryPart || '');

    syncNavExpandFromHash();

    if (parts[0] === 'agent-chat') {
      const agentId = query.get('agent') || undefined;
      topTitle.textContent = D.agentChatPage.title;
      topDesc.textContent = D.agentChatPage.desc;
      content.innerHTML = renderAgentChat(agentId);
      setActiveNav('agent-chat', 'agent-chat');
      bindAgentChat(agentId);
      return;
    }

    if (parts[0] === 'system') {
      const systemPage = parts[1] || D.systemNavItems[0]?.page || 'tenant';
      setPageMeta(systemPage, 'system');
      const render = SYSTEM_RENDERERS[systemPage] || SYSTEM_RENDERERS.tenant;
      content.innerHTML = render();
      setActiveNav(systemPage, 'system');
      if (systemPage === 'models') bindModelsPage();
      if (systemPage === 'agents-mgmt') bindAgentsMgmt();
      bindGoto();
      return;
    }

    let page = parts[0] || defaultPage;

    const legacy = LEGACY_PAGE_REDIRECTS[page];
    if (legacy && !(page === 'applications' && parts[1])) {
      const tabQuery = legacy.tab ? `?tab=${legacy.tab}` : '';
      location.replace(`#${legacy.page}${tabQuery}`);
      return;
    }

    const activeTab = query.get('tab') || undefined;

    if (page === 'applications' && parts[1]) {
      setPageMeta('detail', 'admission');
      content.innerHTML = renderDetail(parts[1]);
      bindDetailTabs(activeTab);
    } else {
      setPageMeta(page, 'admission');
      const render = RENDERERS[page] || RENDERERS[defaultPage] || RENDERERS.overview;
      content.innerHTML = render(activeTab);
    }

    setActiveNav(page, 'admission');
    bindGoto();
    bindSubTabs(page);
  }

  const admissionGroup = document.querySelector('.nav-group[data-group="admission"]');
  const admissionToggle = document.getElementById('admission-toggle');
  const systemGroup = document.querySelector('.nav-group[data-group="system"]');
  const systemToggle = document.getElementById('system-toggle');

  function syncNavExpandFromHash() {
    const hash = (location.hash || '').slice(1);
    const admissionGroup = document.querySelector('.nav-group[data-group="admission"]');
    const systemGroup = document.querySelector('.nav-group[data-group="system"]');
    const admissionToggle = document.getElementById('admission-toggle');
    const systemToggle = document.getElementById('system-toggle');

    if (hash.startsWith('system/') || hash === 'system') {
      systemGroup?.setAttribute('data-expanded', 'true');
      systemToggle?.setAttribute('aria-expanded', 'true');
      admissionGroup?.setAttribute('data-expanded', 'false');
      admissionToggle?.setAttribute('aria-expanded', 'false');
      scrollSystemSubIntoView();
      return;
    }

    if (hash.startsWith('agent-chat')) {
      admissionGroup?.setAttribute('data-expanded', 'false');
      admissionToggle?.setAttribute('aria-expanded', 'false');
      systemGroup?.setAttribute('data-expanded', 'false');
      systemToggle?.setAttribute('aria-expanded', 'false');
      return;
    }

    admissionGroup?.setAttribute('data-expanded', 'true');
    admissionToggle?.setAttribute('aria-expanded', 'true');
  }

  function bindParentToggle(group, toggle, defaultHash) {
    toggle?.addEventListener('click', () => {
      const expanded = group?.getAttribute('data-expanded') !== 'false';
      const willExpand = !expanded;
      group?.setAttribute('data-expanded', willExpand ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
      if (willExpand) {
        const hash = (location.hash || '').slice(1);
        const isSystem = group?.dataset.group === 'system';
        const isAdmission = group?.dataset.group === 'admission';
        if (isSystem) {
          admissionGroup?.setAttribute('data-expanded', 'false');
          admissionToggle?.setAttribute('aria-expanded', 'false');
          scrollSystemSubIntoView();
          if (!hash.startsWith('system/')) {
            location.hash = 'system/models';
          }
        } else if (isAdmission && (hash.startsWith('system/') || hash.startsWith('agent-chat'))) {
          location.hash = defaultHash;
        } else if (!hash) {
          location.hash = defaultHash;
        }
      }
    });
  }

  renderNav();
  renderSystemNav();
  bindNavLinks();

  bindParentToggle(admissionGroup, admissionToggle, D.navItems[0]?.page || 'overview');
  bindParentToggle(systemGroup, systemToggle, 'system/models');

  document.getElementById('agent-chat-nav')?.addEventListener('click', () => {
    location.hash = 'agent-chat';
  });

  window.addEventListener('hashchange', route);
  route();
})();

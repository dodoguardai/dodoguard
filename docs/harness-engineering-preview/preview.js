/**
 * Shared interactions for harness-engineering-preview static pages.
 * Depends on: #dg-backdrop, #dg-panel, #dg-panel-title, #dg-panel-body (optional per page)
 */
(function () {
  let drawerLastFocus = null;

  function initTabRoots() {
    document.querySelectorAll("[data-tab-root]").forEach((root) => {
      const triggers = root.querySelectorAll("[data-tab-trigger]");
      const panels = root.querySelectorAll("[data-tab-panel]");
      function show(id) {
        triggers.forEach((t) => {
          const on = t.getAttribute("data-tab-trigger") === id;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        panels.forEach((p) => {
          const match = p.getAttribute("data-tab-panel") === id;
          p.classList.toggle("hidden", !match);
        });
      }
      triggers.forEach((t) => {
        t.addEventListener("click", () => show(t.getAttribute("data-tab-trigger")));
      });
    });
  }

  function getDrawerEls() {
    return {
      backdrop: document.getElementById("dg-backdrop"),
      panel: document.getElementById("dg-panel"),
      title: document.getElementById("dg-panel-title"),
      body: document.getElementById("dg-panel-body"),
    };
  }

  function focusFirstInDrawerBody(body) {
    if (!body) return;
    const sel =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const el = body.querySelector(sel);
    if (el && typeof el.focus === "function") el.focus();
  }

  function openDrawer(title, html, options) {
    const opts = options || {};
    const { backdrop, panel, title: elTitle, body } = getDrawerEls();
    if (!backdrop || !panel || !elTitle || !body) return;
    drawerLastFocus = document.activeElement;
    elTitle.textContent = title;
    body.innerHTML = html;
    panel.classList.toggle("dg-panel-wide", !!opts.wide);
    backdrop.classList.remove("hidden");
    panel.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => focusFirstInDrawerBody(body));
  }

  function closeDrawer() {
    const { backdrop, panel } = getDrawerEls();
    if (backdrop) backdrop.classList.add("hidden");
    if (panel) {
      panel.classList.add("hidden");
      panel.classList.remove("dg-panel-wide");
    }
    document.body.style.overflow = "";
    const prev = drawerLastFocus;
    drawerLastFocus = null;
    if (prev && typeof prev.focus === "function") {
      try {
        prev.focus();
      } catch {
        /* ignore */
      }
    }
  }

  function isDrawerOpen() {
    const { panel } = getDrawerEls();
    return panel && !panel.classList.contains("hidden");
  }

  function initDrawer() {
    document.addEventListener(
      "click",
      (e) => {
        if (!e.target.closest("[data-close-drawer]")) return;
        if (!isDrawerOpen()) return;
        closeDrawer();
      },
      true,
    );

    const { backdrop } = getDrawerEls();
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    document.addEventListener("click", (e) => {
      const opener = e.target.closest("[data-open-drawer]");
      if (!opener) return;
      const key = opener.getAttribute("data-open-drawer");
      const map = window.PREVIEW_DRAWERS || {};
      const d = map[key];
      if (d) {
        drawerLastFocus = opener;
        openDrawer(d.title, d.body);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!isDrawerOpen()) return;
      e.preventDefault();
      closeDrawer();
    });
  }

  function toast(msg) {
    let host = document.querySelector(".dg-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "dg-toast-host";
      document.body.appendChild(host);
    }
    const t = document.createElement("div");
    t.className = "dg-toast";
    t.textContent = msg;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-visible"));
    setTimeout(() => {
      t.classList.remove("is-visible");
      setTimeout(() => t.remove(), 200);
    }, 2200);
  }

  function initToastButtons() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-toast]");
      if (!el) return;
      const msg = el.getAttribute("data-toast");
      if (msg) toast(msg);
    });
  }

  function initSwitches() {
    document.querySelectorAll("[data-switch]").forEach((sw) => {
      sw.addEventListener("click", () => {
        sw.classList.toggle("is-on");
        const label = sw.getAttribute("aria-label") || "Toggle";
        toast(sw.classList.contains("is-on") ? `${label}: on` : `${label}: off`);
      });
    });
  }

  function getPageHelpSpec() {
    const file = (window.location.pathname.split("/").pop() || "").toLowerCase();
    const specs = {
      "index.html": {
        title: "UI Map",
        tips: [
          "Start here for the full Reliability Lab flow.",
          "Use links to jump into Test Data -> Scenario Studio -> Run Center.",
          "If something says mock, it is demo-only (no backend persistence).",
        ],
        next: '<a href="./test-data.html">Open Test Data</a> to prepare evaluation datasets.',
      },
      "test-data.html": {
        title: "Test Data",
        tips: [
          "Each row is a test case: question (input) + expected_answer (target output).",
          "Optional failure_signals define negative checks (must-not phrases/tools).",
          "Use Scenario button to bind this dataset in Scenario Studio.",
        ],
        next: '<a href="./scenario-studio.html?tab=editor&step=2">Go to Scenario Studio step 2</a> and bind dataset rows.',
      },
      "scenario-studio.html": {
        title: "Scenario Studio",
        tips: [
          "Step 1 requires scenario name before Next.",
          "Step 2 defines matrix slices (dataset, count, run shape, item type).",
          "Step 3 decides scoring mode: rules, LLM rubric, or hybrid.",
        ],
        next: '<a href="./run-center.html?from=scenario-studio">Open Run Center</a> to inspect roll-up results.',
      },
      "evaluation-rules.html": {
        title: "Evaluation Rules",
        tips: [
          "Rules are deterministic checks on output/tool trace.",
          "Rule sets are selected from Scenario Studio step 3.",
          "LLM rubric is configured in Scenario Studio, not here.",
        ],
        next: '<a href="./scenario-studio.html?tab=editor&step=3">Return to Scenario Studio step 3</a> to apply selected rule sets.',
      },
      "run-center.html": {
        title: "Run Center",
        tips: [
          "Run rows summarize per-item scoring rollups.",
          "Scenario/dataset query params show contextual banners.",
          "Scan tasks and recent tasks are separate mock views.",
        ],
        next: 'Use <a href="./benchmark-diff.html">Benchmark & Diff</a> to compare against baseline.',
      },
      "benchmark-diff.html": {
        title: "Benchmark & Diff",
        tips: [
          "Compare current vs baseline quality/cost metrics.",
          "Diff highlights where regression likely happened.",
          "Use this before Quality Gates decisions.",
        ],
        next: 'Then review <a href="./quality-gates.html">Quality Gates</a> for release decision.',
      },
      "quality-gates.html": {
        title: "Quality Gates",
        tips: [
          "Gate profile converts metrics into release decisions.",
          "Warn/block outcomes are threshold-driven.",
          "Use with Benchmark/Diff + Issue Workflow loop.",
        ],
        next: 'Track remediation in <a href="./issue-workflow.html">Issue Workflow</a>.',
      },
      "issue-workflow.html": {
        title: "Issue Workflow",
        tips: [
          "Operational loop: detect -> assign -> fix -> retest -> close.",
          "Each issue should map to a minimal reproducible scenario.",
          "Retest links back to Scenario and Run artifacts.",
        ],
        next: 'After fixes, rerun from <a href="./run-center.html">Run Center</a>.',
      },
      "reliability-home.html": {
        title: "Reliability Home",
        tips: [
          "This is the cross-platform KPI overview.",
          "Use tabs to drill into Dify/Coze snapshots.",
          "Cards point to deeper modules for root-cause analysis.",
        ],
        next: 'Open <a href="./scenario-studio.html">Scenario Studio</a> for scenario-level tuning.',
      },
      "agents.html": {
        title: "Agents",
        tips: [
          "This page bridges static preview to real frontend Agents module.",
          "Agent registration itself is in frontend routes.",
          "Scenario Studio still uses mock agent bindings.",
        ],
        next: 'Return to <a href="./scenario-studio.html">Scenario Studio</a> to bind target agents in the prototype flow.',
      },
    };
    return specs[file] || specs["index.html"];
  }

  function initGlobalHelp() {
    const spec = getPageHelpSpec();
    const host = document.createElement("div");
    host.className = "dg-help-host";
    host.innerHTML =
      '<button type="button" class="btn btn-default dg-help-fab" id="dg-help-open" aria-label="Open quick help">Help</button>' +
      '<div class="dg-help-backdrop hidden" id="dg-help-backdrop"></div>' +
      '<aside class="dg-help-panel hidden" id="dg-help-panel" role="dialog" aria-modal="true" aria-labelledby="dg-help-title">' +
      '<div class="dg-help-head"><h4 id="dg-help-title">Quick help</h4><button type="button" class="btn btn-outline btn-sm" id="dg-help-close">Close</button></div>' +
      '<div class="dg-help-body" id="dg-help-body"></div>' +
      "</aside>";
    document.body.appendChild(host);

    const body = host.querySelector("#dg-help-body");
    const panel = host.querySelector("#dg-help-panel");
    const backdrop = host.querySelector("#dg-help-backdrop");
    const openBtn = host.querySelector("#dg-help-open");
    const closeBtn = host.querySelector("#dg-help-close");
    if (!body || !panel || !backdrop || !openBtn || !closeBtn) return;

    body.innerHTML =
      '<p class="muted" style="font-size:0.8125rem;margin:0 0 0.6rem">Module flow: <strong>Test Data</strong> -> <strong>Scenario Studio</strong> -> <strong>Run Center</strong> -> <strong>Benchmark/Gates</strong> -> <strong>Issue Workflow</strong>.</p>' +
      "<p style='margin:0 0 0.45rem'><strong>Current page: " +
      spec.title +
      "</strong></p>" +
      "<ul class='dg-list' style='font-size:0.8125rem;margin:0 0 0.6rem;line-height:1.55'>" +
      spec.tips.map((t) => "<li>" + t + "</li>").join("") +
      "</ul>" +
      "<p class='note' style='margin:0'><strong>Next:</strong> " +
      spec.next +
      " <span class='muted'>(Shortcut: press <code>?</code>)</span></p>";

    function open() {
      panel.classList.remove("hidden");
      backdrop.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }
    function close() {
      panel.classList.add("hidden");
      backdrop.classList.add("hidden");
      document.body.style.overflow = "";
      openBtn.focus();
    }

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (panel.classList.contains("hidden")) open();
      } else if (e.key === "Escape" && !panel.classList.contains("hidden")) {
        close();
      }
    });
  }

  function initFlowGuide() {
    const path = (window.location.pathname.split("/").pop() || "").toLowerCase();
    const FLOW_KEY = "dg-flow-guide-v1";
    const flow = [
      {
        id: "test-data",
        name: "1) Prepare test dataset",
        file: "test-data.html",
        desc: "Create or inspect question + expected_answer rows in Test Data.",
      },
      {
        id: "scenario",
        name: "2) Configure scenario",
        file: "scenario-studio.html",
        desc: "Bind dataset in matrix and define evaluation mode.",
      },
      {
        id: "run",
        name: "3) Run and inspect",
        file: "run-center.html",
        desc: "Check run rows and roll-up pass/score results.",
      },
      {
        id: "diff",
        name: "4) Compare and decide",
        file: "benchmark-diff.html",
        desc: "Compare baseline deltas and quality drift.",
      },
      {
        id: "gate",
        name: "5) Gate and close loop",
        file: "quality-gates.html",
        desc: "Apply release gates and track remediation workflow.",
      },
    ];

    const currentIndex = flow.findIndex((s) => s.file === path);
    const main = document.querySelector(".dg-main");
    const pageHead = document.querySelector(".dg-page-head");
    if (!main || !pageHead) return;
    if (currentIndex < 0 && path !== "index.html") return;

    function readState() {
      try {
        return JSON.parse(sessionStorage.getItem(FLOW_KEY) || "{}");
      } catch {
        return {};
      }
    }
    function writeState(v) {
      try {
        sessionStorage.setItem(FLOW_KEY, JSON.stringify(v));
      } catch {
        /* ignore quota */
      }
    }

    const state = readState();
    const completed = Array.isArray(state.completed) ? state.completed : [];
    const startedAt = state.startedAt || new Date().toISOString();
    const currentId = currentIndex >= 0 ? flow[currentIndex].id : null;
    if (currentId && !completed.includes(currentId) && currentIndex === 0) {
      writeState({ ...state, startedAt: startedAt, completed: completed });
    }

    function completionPct() {
      return Math.round((completed.length / flow.length) * 100);
    }

    const panel = document.createElement("section");
    panel.className = "dg-flow-guide";
    const progressItems = flow
      .map((s, idx) => {
        const isDone = completed.includes(s.id);
        const isCurrent = idx === currentIndex;
        return (
          '<li class="dg-flow-step' +
          (isDone ? " is-done" : "") +
          (isCurrent ? " is-current" : "") +
          '">' +
          '<a href="./' +
          s.file +
          '">' +
          s.name +
          "</a>" +
          "</li>"
        );
      })
      .join("");

    let cta = "";
    if (path === "index.html") {
      cta =
        '<a class="btn btn-default btn-sm" href="./test-data.html">Start guided flow</a>' +
        '<button type="button" class="btn btn-outline btn-sm" id="dg-flow-reset">Reset progress</button>';
    } else if (currentIndex >= 0) {
      const next = flow[currentIndex + 1];
      cta =
        '<button type="button" class="btn btn-default btn-sm" id="dg-flow-done">Mark this step done</button>' +
        (next
          ? '<a class="btn btn-outline btn-sm" href="./' + next.file + '">Go next: ' + next.name + "</a>"
          : '<a class="btn btn-outline btn-sm" href="./issue-workflow.html">Go next: Issue workflow</a>') +
        '<button type="button" class="btn btn-outline btn-sm" id="dg-flow-reset">Reset progress</button>';
    }

    panel.innerHTML =
      '<div class="dg-flow-head">' +
      '<div><strong>Guided workflow</strong><p class="muted" style="margin:0.2rem 0 0;font-size:0.75rem">User path from dataset setup to release gating and issue closure.</p></div>' +
      '<span class="badge badge-secondary">' +
      completionPct() +
      "% complete</span>" +
      "</div>" +
      '<ol class="dg-flow-steps">' +
      progressItems +
      "</ol>" +
      '<div class="dg-toolbar-inline" style="margin:0.55rem 0 0;flex-wrap:wrap">' +
      cta +
      "</div>";

    pageHead.insertAdjacentElement("afterend", panel);

    panel.querySelector("#dg-flow-done")?.addEventListener("click", () => {
      if (!currentId) return;
      const cur = readState();
      const done = Array.isArray(cur.completed) ? cur.completed.slice() : [];
      if (!done.includes(currentId)) done.push(currentId);
      writeState({ ...cur, startedAt: cur.startedAt || startedAt, completed: done });
      window.location.reload();
    });
    panel.querySelector("#dg-flow-reset")?.addEventListener("click", () => {
      writeState({ startedAt: new Date().toISOString(), completed: [] });
      window.previewToast("Flow progress reset");
      window.location.reload();
    });
  }

  window.PREVIEW_DRAWERS = window.PREVIEW_DRAWERS || {};
  window.previewOpenDrawer = openDrawer;
  window.previewCloseDrawer = closeDrawer;
  window.previewToast = toast;

  document.addEventListener("DOMContentLoaded", () => {
    initTabRoots();
    initDrawer();
    initToastButtons();
    initSwitches();
    initGlobalHelp();
    initFlowGuide();
  });
})();

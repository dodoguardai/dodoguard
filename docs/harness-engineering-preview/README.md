# Harness Engineering UI (static prototype)

Aligned with `frontend`: design tokens from **`frontend/src/styles/theme.css`** plus shadcn/ui-style Sidebar, Card, Button, Table, and Badge (see `shared.css`).

## Entry

- `index.html` (UI Map)

## Pages

- `reliability-home.html`
- `agents.html`
- `scenario-studio.html`
- `test-data.html` (datasets as Q&A + item type, case sets, baselines)
- `run-center.html` (runs, scan tasks mock, recent tasks)
- `benchmark-diff.html`
- `quality-gates.html`
- `issue-workflow.html`

## Design focus

- Reliability-first (capability, robustness, stability, efficiency)
- Scenario + Test Data as first-class assets
- Baseline & drift, quality gates (metric thresholds)

## Notes

- Static HTML only; no build step. Open any `.html` to preview.
- Font: Inter (Google Fonts, `@import` in `shared.css`).

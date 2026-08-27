import type { PocDocId } from './fill-poc-html';

import pocEvidence from './templates/poc-evidence.html?raw';
import pocExecLog from './templates/poc-exec-log.html?raw';
import pocExecPlan from './templates/poc-exec-plan.html?raw';
import pocMaster from './templates/poc-master.html?raw';
import pocMgmtSummary from './templates/poc-mgmt-summary.html?raw';
import pocRemediation from './templates/poc-remediation.html?raw';

export type PocDocumentSpec = {
  id: PocDocId;
  /** Short label for tabs */
  tabLabel: string;
  /** Suggested download filename (without .html) */
  downloadBaseName: string;
  rawHtml: string;
};

/** Delivery order unchanged; tab labels are UI-only (English shell). */
export const POC_DOCUMENTS: PocDocumentSpec[] = [
  {
    id: 'exec-plan',
    tabLabel: 'Execution plan',
    downloadBaseName: 'PoC-执行策划',
    rawHtml: pocExecPlan,
  },
  {
    id: 'exec-log',
    tabLabel: 'Execution log',
    downloadBaseName: 'PoC-执行过程记录',
    rawHtml: pocExecLog,
  },
  {
    id: 'evidence',
    tabLabel: 'Evidence pack',
    downloadBaseName: 'PoC-证据包',
    rawHtml: pocEvidence,
  },
  {
    id: 'remediation',
    tabLabel: 'Remediation',
    downloadBaseName: 'PoC-结论与整改建议',
    rawHtml: pocRemediation,
  },
  {
    id: 'mgmt-summary',
    tabLabel: 'Executive summary',
    downloadBaseName: 'PoC-管理层摘要',
    rawHtml: pocMgmtSummary,
  },
  {
    id: 'master',
    tabLabel: 'Master report',
    downloadBaseName: 'PoC-总报告',
    rawHtml: pocMaster,
  },
];

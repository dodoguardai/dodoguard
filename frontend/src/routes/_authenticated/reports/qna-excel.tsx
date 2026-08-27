import { createFileRoute } from '@tanstack/react-router';
import { QnaExcelReportPage } from '@/features/reports/qna-excel-report-page';

export const Route = createFileRoute('/_authenticated/reports/qna-excel')({
  component: QnaExcelReportPage,
});

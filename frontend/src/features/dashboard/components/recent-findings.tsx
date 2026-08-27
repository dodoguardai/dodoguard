/**
 * Recent Findings Component
 * Shows recent high-risk vulnerability findings
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from '@tanstack/react-router';
import type { DashboardStats } from '@/types/entities';

interface RecentFindingsProps {
  findings?: DashboardStats['recentHighRiskFindings'];
  /** When provided, the card header is clickable and navigates to findings list */
  onHeaderClick?: () => void;
}

export function RecentFindings({ findings = [], onHeaderClick }: RecentFindingsProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const router = useRouter();

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const handleRowClick = (findingId: string) => {
    router.navigate({ to: '/findings/$findingId', params: { findingId } });
  };

  return (
    <Card>
      <CardHeader
        className={
          onHeaderClick
            ? 'cursor-pointer hover:bg-accent/50 rounded-t-xl transition-colors'
            : undefined
        }
        onClick={onHeaderClick}
      >
        <CardTitle>{isZh ? '最近高风险发现' : 'Recent High-Risk Findings'}</CardTitle>
        <CardDescription>
          {isZh ? '最近检测到的高风险漏洞' : 'Recently detected high-risk vulnerabilities'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isZh ? '漏洞' : 'Vulnerability'}</TableHead>
              <TableHead>{isZh ? '智能体' : 'Agent'}</TableHead>
              <TableHead>{isZh ? '风险' : 'Risk'}</TableHead>
              <TableHead>{isZh ? '发现时间' : 'Detected'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isZh ? '暂无发现' : 'No findings available'}
                </TableCell>
              </TableRow>
            ) : (
              findings.slice(0, 10).map((finding) => (
                <TableRow
                  key={finding.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleRowClick(finding.id)}
                >
                  <TableCell className="font-medium">{finding.vulnerabilityName}</TableCell>
                  <TableCell>{finding.agentName}</TableCell>
                  <TableCell>
                    <Badge variant={getRiskLevelColor(finding.riskLevel) as any}>
                      {finding.riskLevel.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(finding.detectedAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

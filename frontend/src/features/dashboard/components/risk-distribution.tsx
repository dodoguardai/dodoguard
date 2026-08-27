/**
 * Risk Distribution Component
 * Shows vulnerability risk level distribution
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
import type { DashboardStats } from '@/types/entities';

interface RiskDistributionProps {
  data?: DashboardStats['riskDistribution'];
  onRowClick?: (level: string) => void;
}

export function RiskDistribution({ data = [], onRowClick }: RiskDistributionProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isZh ? '风险分布' : 'Risk Distribution'}</CardTitle>
        <CardDescription>
          {isZh ? '按风险等级统计漏洞分布' : 'Distribution of vulnerabilities by risk level'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isZh ? '风险等级' : 'Risk Level'}</TableHead>
              <TableHead>{isZh ? '数量' : 'Count'}</TableHead>
              <TableHead>{isZh ? '占比' : 'Percentage'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {isZh ? '暂无数据' : 'No data available'}
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow
                  key={item.level}
                  className={onRowClick ? 'cursor-pointer hover:bg-accent' : ''}
                  onClick={() => onRowClick?.(item.level)}
                >
                  <TableCell>
                    <Badge variant={getRiskLevelColor(item.level) as any}>
                      {item.level.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.count}</TableCell>
                  <TableCell>{item.percentage.toFixed(1)}%</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

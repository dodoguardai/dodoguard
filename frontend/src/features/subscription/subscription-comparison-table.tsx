import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CircleDot, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SubscriptionTierId } from './resolve-tier';
import {
  SUBSCRIPTION_COMPARISON,
  type ComparisonCell,
  type ComparisonRow,
  type FeatureAvailability,
} from './subscription-tiers';

const TIER_COLUMNS: SubscriptionTierId[] = ['community', 'enterprise', 'onPremise'];

const AVAILABILITY_LEGEND: FeatureAvailability[] = ['preview', 'delivery'];

function getCellAvailability(
  row: ComparisonRow,
  tierId: SubscriptionTierId,
  value: ComparisonCell,
): FeatureAvailability | undefined {
  if (value === false) {
    return undefined;
  }
  return row.cellAvailability?.[tierId] ?? (value === true ? 'now' : 'preview');
}

function ComparisonCellContent({
  value,
  availability,
}: {
  value: ComparisonCell;
  availability?: FeatureAvailability;
}) {
  const { t } = useTranslation();

  if (value === false) {
    return <Minus className="mx-auto h-5 w-5 text-muted-foreground/50" aria-hidden />;
  }

  const showBadge = availability && availability !== 'now' && availability !== 'roadmap';

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {value === true ? (
        <Check className="h-5 w-5 text-green-600" aria-hidden />
      ) : (
        <CircleDot className="h-5 w-5 text-amber-600" aria-hidden />
      )}
      {showBadge && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal leading-tight">
          {t(`pages.subscription.availability.${availability}`)}
        </Badge>
      )}
    </div>
  );
}

export function SubscriptionComparisonTable() {
  const { t } = useTranslation();

  const tierHeaderKey: Record<SubscriptionTierId, string> = {
    community: 'pages.subscription.tierColumnCommunity',
    enterprise: 'pages.subscription.tierColumnEnterprise',
    onPremise: 'pages.subscription.tierColumnOnPremise',
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>{t('pages.subscription.comparisonTitle')}</CardTitle>
          <CardDescription>{t('pages.subscription.comparisonDescription')}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
            <span>{t('pages.subscription.comparison.legend.included')}</span>
          </span>
          {AVAILABILITY_LEGEND.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              {key === 'preview' && <CircleDot className="h-3.5 w-3.5 text-amber-600" aria-hidden />}
              {key === 'delivery' && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
              <span>{t(`pages.subscription.comparison.legend.${key}`)}</span>
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">
                  {t('pages.subscription.comparisonFeatureColumn')}
                </TableHead>
                {TIER_COLUMNS.map((tierId) => (
                  <TableHead key={tierId} className="text-center">
                    {t(tierHeaderKey[tierId])}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SUBSCRIPTION_COMPARISON.map((category) => (
                <Fragment key={category.categoryKey}>
                  <TableRow className="bg-muted/50">
                    <TableCell colSpan={4} className="font-semibold">
                      {t(`pages.subscription.comparison.categories.${category.categoryKey}`)}
                    </TableCell>
                  </TableRow>
                  {category.rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        {t(`pages.subscription.comparison.rows.${row.key}`)}
                      </TableCell>
                      {TIER_COLUMNS.map((tierId) => {
                        const cellValue = row[tierId];
                        const availability = getCellAvailability(row, tierId, cellValue);
                        return (
                          <TableCell key={tierId} className="text-center">
                            <ComparisonCellContent
                              value={cellValue}
                              availability={availability}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

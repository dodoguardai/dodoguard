/**
 * Metric Card Component
 * Displays a single metric with optional click handler
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  onClick?: () => void;
  className?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  onClick,
  className,
}: MetricCardProps) {
  const variantStyles = {
    default: 'text-muted-foreground',
    danger: 'text-destructive',
    warning: 'text-yellow-600 dark:text-yellow-500',
    success: 'text-green-600 dark:text-green-500',
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent',
        onClick && 'hover:shadow-md',
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={cn('h-4 w-4', variantStyles[variant])} />}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', variantStyles[variant])}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

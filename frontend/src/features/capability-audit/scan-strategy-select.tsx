import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SCAN_STRATEGIES_UI, SCAN_STRATEGY_META, type ScanStrategy } from 'capability-audit/shared/scan';

type ScanStrategySelectProps = {
  value: ScanStrategy;
  onChange: (v: ScanStrategy) => void;
  isZh: boolean;
  disabled?: boolean;
};

export function ScanStrategySelect({ value, onChange, isZh, disabled }: ScanStrategySelectProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  return (
    <div className="space-y-2">
      <Label>{tr('Scan strategy', '扫描策略')}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ScanStrategy)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCAN_STRATEGIES_UI.map((id) => {
            const s = SCAN_STRATEGY_META[id];
            return (
              <SelectItem key={id} value={id}>
                <span className="font-medium">{isZh ? s.labelZh : s.labelEn}</span>
                <span className="text-muted-foreground ml-1.5 text-xs">
                  — {isZh ? s.hintZh : s.hintEn}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

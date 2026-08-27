/**
 * Step 4: Testing Mode (Simple Scanning only)
 */

import { useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';
import type { TaskFormData } from '../configuration-mode-wizard';

interface Step4AttackModeProps {
  form: UseFormReturn<TaskFormData>;
}

export function Step4AttackMode({ form }: Step4AttackModeProps) {
  const { t } = useTranslation();
  const p = 'pages.tasks.createWizard.step4';
  useEffect(() => {
    form.setValue('attackMode', 'simple');
  }, [form]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          {t(`${p}.title`)}
        </CardTitle>
        <CardDescription>{t(`${p}.cardDescription`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
          control={form.control}
          name="attackMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(`${p}.modeLabel`)}</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t(`${p}.simpleScanning`)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">{t(`${p}.simpleScanning`)}</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>{t(`${p}.modeHint`)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">{t(`${p}.explain`)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

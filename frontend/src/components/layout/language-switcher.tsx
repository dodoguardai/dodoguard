import { Check, ChevronDown, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LANGS: Array<{ code: 'en' | 'zh'; key: 'language.english' | 'language.chinese' }> = [
  { code: 'zh', key: 'language.chinese' },
  { code: 'en', key: 'language.english' },
];

function resolveLang(lng: string | undefined): 'en' | 'zh' {
  if (!lng) {
    return 'en';
  }
  return lng.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const current = resolveLang(i18n.language || i18n.resolvedLanguage);

  const handleChange = (code: 'en' | 'zh') => {
    void i18n.changeLanguage(code);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('app_language', code);
    }
  };

  const currentMeta = LANGS.find((l) => l.code === current) ?? LANGS[1];
  const currentLabel = t(currentMeta.key);

  return (
    <div className="ml-auto flex items-center">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs font-medium sm:text-sm"
          >
            <Languages className="size-3.5 shrink-0 opacity-80 sm:size-4" aria-hidden />
            <span>{currentLabel}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
            <span className="sr-only">{t('language.switchMenu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {LANGS.map((lang) => (
            <DropdownMenuItem key={lang.code} onClick={() => handleChange(lang.code)}>
              {t(lang.key)}
              <Check size={14} className={cn('ms-auto', current !== lang.code && 'hidden')} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


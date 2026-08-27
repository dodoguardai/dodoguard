import { SearchIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchOptional } from '@/context/search-provider';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

type SearchProps = {
  className?: string;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
};

export function Search({ className = '', placeholder = 'Search' }: SearchProps) {
  const search = useSearchOptional();
  const { t } = useTranslation();
  const placeholderText = placeholder === 'Search' ? t('layout.search.placeholder') : placeholder;

  if (!search) {
    return null;
  }

  return (
    <Button
      variant="outline"
      className={cn(
        'group relative h-8 w-full flex-1 justify-start rounded-md bg-muted/25 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pe-12 md:flex-none lg:w-52 xl:w-64',
        className,
      )}
      onClick={() => search.setOpen(true)}
    >
      <SearchIcon
        aria-hidden="true"
        className="absolute inset-s-1.5 top-1/2 -translate-y-1/2"
        size={16}
      />
      <span className="ms-4">{placeholderText}</span>
      <kbd className="pointer-events-none absolute inset-e-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 select-none group-hover:bg-accent sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}

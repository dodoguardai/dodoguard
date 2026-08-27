import * as React from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
}

export function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = '请选择...',
  className,
  disabled = false,
  loading = false,
  emptyText = '暂无选项',
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const pageSize = 5;

  const handleSelect = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];
    onChange(newValues);
  };

  const removeValue = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newValues = selectedValues.filter((v) => v !== value);
    onChange(newValues);
  };

  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const filteredOptions = options.filter((option) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return [option.label, option.description, option.value]
      .filter(Boolean)
      .some((text) => String(text).toLowerCase().includes(keyword));
  });
  const pageCount = Math.max(1, Math.ceil(filteredOptions.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleOptions = filteredOptions.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  React.useEffect(() => {
    setPage(0);
  }, [search, options.length]);

  if (loading) {
    return <div className={cn('h-9 w-full animate-pulse rounded-md bg-muted', className)} />;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-9 w-full justify-between px-3 py-2 text-left hover:bg-background',
            className,
          )}
        >
          {selectedOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  {option.label}
                  <button
                    type="button"
                    onClick={(e) => removeValue(option.value, e)}
                    className="ml-1 rounded-full outline-none ring-offset-background hover:bg-accent hover:text-accent-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden p-0"
        align="start"
        side="top"
        sideOffset={4}
      >
        <div className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 opacity-50" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索..."
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="p-1">
            {filteredOptions.length === 0 ? (
              <div className="mx-auto max-w-80 whitespace-normal break-words px-4 py-6 text-center text-sm leading-6">
                {emptyText}
              </div>
            ) : (
              visibleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className="relative flex min-h-9 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                >
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      selectedValues.includes(option.value)
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50',
                    )}
                  >
                    {selectedValues.includes(option.value) && <CheckIcon className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words">{option.label}</span>
                    {option.description && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              共 {filteredOptions.length} 条，第 {currentPage + 1} / {pageCount} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage === 0}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

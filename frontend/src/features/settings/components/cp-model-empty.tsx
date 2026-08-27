import type { ReactNode } from 'react';

interface CpModelEmptyProps {
  message: string;
  action?: ReactNode;
}

export function CpModelEmpty({ message, action }: CpModelEmptyProps) {
  return (
    <div className="model-empty flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-muted/10 px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

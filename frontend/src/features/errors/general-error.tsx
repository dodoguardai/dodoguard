import { useEffect } from 'react';
import { type ErrorComponentProps, useNavigate, useRouter } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ROUTE_ASSET_RELOAD_KEY = 'dodoguard_route_asset_reload';
const ROUTE_ASSET_RELOAD_TTL = 5 * 60 * 1000;
const LAST_ROUTE_ERROR_KEY = 'dodoguard_last_route_error';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

function isRouteAssetLoadError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return [
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'importing a module script failed',
    'loading chunk',
    'chunkloaderror',
    'css_chunk_load_failed',
  ].some((signature) => message.includes(signature));
}

function errorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  if (error && typeof error === 'object' && 'stack' in error) {
    const stack = (error as { stack?: unknown }).stack;
    return typeof stack === 'string' ? stack : undefined;
  }
  return undefined;
}

function assetReloadMarker(message: string): string {
  if (typeof window === 'undefined') return message;
  return `${window.location.href}|${message}`;
}

function hasRecentlyReloadedForAssetError(message: string): boolean {
  if (typeof window === 'undefined') return false;

  const marker = assetReloadMarker(message);
  const stored = window.sessionStorage.getItem(ROUTE_ASSET_RELOAD_KEY);
  const now = Date.now();

  if (!stored) return false;

  try {
    const parsed = JSON.parse(stored) as { marker?: string; timestamp?: number };
    return (
      parsed.marker === marker &&
      typeof parsed.timestamp === 'number' &&
      now - parsed.timestamp < ROUTE_ASSET_RELOAD_TTL
    );
  } catch {
    return stored === marker;
  }
}

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean;
  error?: unknown;
  reset?: () => void;
};

export function GeneralError({
  className,
  minimal = false,
  error,
  reset,
}: GeneralErrorProps) {
  const navigate = useNavigate();
  const { history } = useRouter();
  const message = errorMessage(error);
  const stack = errorStack(error);
  const isAssetLoadError = isRouteAssetLoadError(error);
  const shouldAutoReloadAssetError =
    isAssetLoadError && !hasRecentlyReloadedForAssetError(message);
  const diagnosticMessage =
    import.meta.env.DEV && message
      ? [message, stack].filter(Boolean).join('\n\n')
      : null;

  useEffect(() => {
    if (typeof window === 'undefined' || (!message && !stack)) {
      return;
    }

    const diagnostic = {
      message,
      stack,
      href: window.location.href,
      timestamp: new Date().toISOString(),
    };
    window.sessionStorage.setItem(LAST_ROUTE_ERROR_KEY, JSON.stringify(diagnostic));
    console.error('[RouteGeneralError]', diagnostic);
  }, [message, stack]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isAssetLoadError) {
      return;
    }

    if (!shouldAutoReloadAssetError) {
      return;
    }

    window.sessionStorage.setItem(
      ROUTE_ASSET_RELOAD_KEY,
      JSON.stringify({ marker: assetReloadMarker(message), timestamp: Date.now() }),
    );
    window.location.reload();
  }, [isAssetLoadError, message, shouldAutoReloadAssetError]);

  if (shouldAutoReloadAssetError) {
    return null;
  }

  return (
    <div className={cn('h-svh w-full', className)}>
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 px-4">
        {!minimal && <h1 className="text-[7rem] leading-tight font-bold">500</h1>}
        <span className="font-medium">Oops! Something went wrong {`:')`}</span>
        <p className="text-center text-muted-foreground">
          We apologize for the inconvenience. <br /> Please try again later.
        </p>
        {diagnosticMessage ? (
          <pre className="mt-4 max-w-xl overflow-x-auto rounded-md bg-muted px-4 py-3 text-left text-xs text-muted-foreground">
            {diagnosticMessage}
          </pre>
        ) : null}
        {!minimal && (
          <div className="mt-6 flex gap-4">
            {reset ? (
              <Button variant="outline" onClick={() => reset()}>
                Try Again
              </Button>
            ) : (
              <Button variant="outline" onClick={() => history.go(-1)}>
                Go Back
              </Button>
            )}
            <Button onClick={() => navigate({ to: '/', search: { tab: 'overview' } })}>
              Back to Home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RouteGeneralError({ error, reset }: ErrorComponentProps) {
  return <GeneralError error={error} reset={reset} />;
}

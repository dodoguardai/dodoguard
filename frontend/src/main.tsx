import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { AxiosError } from 'axios';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { handleServerError } from '@/lib/handle-server-error';
import { DirectionProvider } from './context/direction-provider';
import { FontProvider } from './context/font-provider';
import { ThemeProvider } from './context/theme-provider';
import './i18n';
// Audit modules (register before routes)
import '@/features/audit/modules/dify-config';
import '@/features/audit/modules/skills-md';
import '@/features/audit/modules/mcp-source';
import '@/features/audit/modules/coze-config';
import '@/features/audit/modules/fastgpt-config';
import '@/features/audit/modules/n8n-config';
import 'capability-audit/frontend/register';
// Generated Routes
import { routeTree } from './routeTree.gen';
// Styles
import './styles/index.css';

const ROUTE_ASSET_RELOAD_KEY = 'dodoguard_route_asset_reload';
const ROUTE_ASSET_RELOAD_TTL = 5 * 60 * 1000;

function reloadOnceForRouteAssetError(reason: string) {
  if (typeof window === 'undefined') return;

  const currentUrl = window.location.href;
  const marker = `${currentUrl}|${reason}`;
  const stored = window.sessionStorage.getItem(ROUTE_ASSET_RELOAD_KEY);
  const now = Date.now();

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { marker?: string; timestamp?: number };
      const recentlyReloaded =
        parsed.marker === marker &&
        typeof parsed.timestamp === 'number' &&
        now - parsed.timestamp < ROUTE_ASSET_RELOAD_TTL;
      if (recentlyReloaded) return;
    } catch {
      if (stored === marker) return;
    }
  }

  window.sessionStorage.setItem(
    ROUTE_ASSET_RELOAD_KEY,
    JSON.stringify({ marker, timestamp: now }),
  );
  window.location.reload();
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const message =
    event.payload instanceof Error ? event.payload.message : 'vite preload failed';
  reloadOnceForRouteAssetError(message);
});

function getHttpStatus(error: unknown): number | undefined {
  if (error instanceof AxiosError) {
    return error.response?.status;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }

  return undefined;
}

function getRequestUrl(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.config?.url ?? '';
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { config?: { url?: unknown } } }).response;
    return typeof response?.config?.url === 'string' ? response.config.url : '';
  }

  return '';
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.log({ failureCount, error });

        if (failureCount >= 0 && import.meta.env.DEV) return false;
        if (failureCount > 3 && import.meta.env.PROD) return false;

        return !(error instanceof AxiosError && [401, 403].includes(error.response?.status ?? 0));
      },
      refetchOnWindowFocus: import.meta.env.PROD,
      staleTime: 10 * 1000, // 10s
    },
    mutations: {
      onError: (error) => {
        handleServerError(error);

        if (error instanceof AxiosError) {
          if (error.response?.status === 304) {
            toast.error('Content not modified!');
          }
        }
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      const status = getHttpStatus(error);

      if (status === 401) {
        toast.error('Session expired!');
        useAuthStore.getState().auth.reset();
        const redirect = `${router.history.location.href}`;
        router.navigate({ to: '/sign-in', search: { redirect } });
      }
      if (status && status >= 500) {
        const requestUrl = getRequestUrl(error);
        const isSubscriptionApi =
          requestUrl.includes('/subscription') || requestUrl.includes('/quota');

        if (!isSubscriptionApi) {
          toast.error('Internal Server Error!');
        }
      }
      if (status === 403) {
        // router.navigate("/forbidden", { replace: true });
      }
    },
  }),
});

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: false,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <DirectionProvider>
              <RouterProvider router={router} />
            </DirectionProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

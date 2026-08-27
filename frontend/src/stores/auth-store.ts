import { create } from 'zustand';
import { getCookie, setCookie, removeCookie } from '@/lib/cookies';
import type { User } from '@/types/entities';

const ACCESS_TOKEN = 'dodoguard_access_token';
const REFRESH_TOKEN = 'dodoguard_refresh_token';
const USER = 'dodoguard_user';

/** Normalize persisted user (login response shape) to full User type with defaults */
function initUserFromCookie(): User | null {
  const raw = getCookie(USER);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed.id !== 'string') return null;
    return {
      id: parsed.id as string,
      organizationId: (parsed.organizationId as string) ?? '',
      email: (parsed.email as string) ?? '',
      name: (parsed.name as string) ?? '',
      avatar: parsed.avatar as string | undefined,
      role: (parsed.role as string) ?? '',
      status: (parsed.status as User['status']) ?? 'active',
      emailVerified: (parsed.emailVerified as boolean) ?? false,
      mfaEnabled: (parsed.mfaEnabled as boolean) ?? false,
      createdAt: (parsed.createdAt as string) ?? '',
      updatedAt: (parsed.updatedAt as string) ?? '',
    };
  } catch {
    return null;
  }
}

interface AuthState {
  auth: {
    user: User | null;
    setUser: (user: User | null) => void;
    accessToken: string;
    setAccessToken: (accessToken: string) => void;
    refreshToken: string;
    setRefreshToken: (refreshToken: string) => void;
    isAuthenticated: boolean;
    resetAccessToken: () => void;
    reset: () => void;
  };
}

export const useAuthStore = create<AuthState>()((set, _get) => {
  const accessTokenCookie = getCookie(ACCESS_TOKEN);
  const refreshTokenCookie = getCookie(REFRESH_TOKEN);
  const initAccessToken = accessTokenCookie ? JSON.parse(accessTokenCookie) : '';
  const initRefreshToken = refreshTokenCookie ? JSON.parse(refreshTokenCookie) : '';
  const initUser = initUserFromCookie();

  return {
    auth: {
      user: initUser,
      setUser: (user) =>
        set((state) => {
          if (user) {
            setCookie(USER, JSON.stringify(user));
          } else {
            removeCookie(USER);
          }
          return {
            ...state,
            auth: {
              ...state.auth,
              user,
              isAuthenticated: !!user,
            },
          };
        }),
      accessToken: initAccessToken,
      setAccessToken: (accessToken) =>
        set((state) => {
          setCookie(ACCESS_TOKEN, JSON.stringify(accessToken));
          return {
            ...state,
            auth: {
              ...state.auth,
              accessToken,
              isAuthenticated: !!accessToken,
            },
          };
        }),
      refreshToken: initRefreshToken,
      setRefreshToken: (refreshToken) =>
        set((state) => {
          setCookie(REFRESH_TOKEN, JSON.stringify(refreshToken));
          return { ...state, auth: { ...state.auth, refreshToken } };
        }),
      isAuthenticated: !!initAccessToken,
      resetAccessToken: () =>
        set((state) => {
          removeCookie(ACCESS_TOKEN);
          return {
            ...state,
            auth: {
              ...state.auth,
              accessToken: '',
              isAuthenticated: false,
            },
          };
        }),
      reset: () =>
        set((state) => {
          removeCookie(ACCESS_TOKEN);
          removeCookie(REFRESH_TOKEN);
          removeCookie(USER);
          return {
            ...state,
            auth: {
              ...state.auth,
              user: null,
              accessToken: '',
              refreshToken: '',
              isAuthenticated: false,
            },
          };
        }),
    },
  };
});

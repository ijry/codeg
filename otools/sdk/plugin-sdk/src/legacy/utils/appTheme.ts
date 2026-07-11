import {
  hostInvoke,
  isNativeTauriRuntime,
} from '../platform/transport/hostBridge';
import type { ThemeAccent, ThemeMode } from '../platform/ui/tools/common';

const DARK_CLASS_NAME = 'dark';
const LIGHT_CLASS_NAME = 'light';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';
const THEME_MODE_ATTRIBUTE = 'data-theme-mode';
const THEME_ACCENT_ATTRIBUTE = 'data-theme-accent';
const THEME_MODE_CACHE_KEY = 'otools:theme-mode';
const THEME_ACCENT_CACHE_KEY = 'otools:theme-accent';
const OTOOLS_THEME_SYNC_EVENT_NAME = 'otools-theme-changed';
const LOCAL_THEME_SYNC_EVENT_SOURCE = 'theme-local';

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;
let currentThemeMode: ThemeMode = 'system';
let currentThemeAccent: ThemeAccent = 'classic';
let lastSyncedThemeState = '';
let themeEventListenerInstalled = false;

type ApplyThemeOptions = {
  skipChildWebviewSync?: boolean;
  resolvedThemeOverride?: 'light' | 'dark';
};

type ThemeSyncEventDetail = {
  themeMode?: string;
  themeAccent?: string;
  resolvedTheme?: string;
  source?: string;
};

const supportsMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'dark') {
    return 'dark';
  }
  if (mode === 'light') {
    return 'light';
  }
  if (supportsMatchMedia()) {
    return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
  }
  return 'light';
};

const normalizeThemeMode = (value?: string | null): ThemeMode => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
};

const normalizeThemeAccent = (value?: string | null): ThemeAccent => {
  if (
    value === 'classic'
    || value === 'violet'
    || value === 'emerald'
    || value === 'amber'
    || value === 'pink'
  ) {
    return value;
  }
  return 'classic';
};

const persistThemePreference = (key: string, value: string) => {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore cache failures
  }
};

const syncChildWebviewTheme = (
  themeMode: ThemeMode,
  themeAccent: ThemeAccent,
  resolvedTheme: 'light' | 'dark',
) => {
  if (!isNativeTauriRuntime({ includeAncestors: true })) {
    return;
  }

  void hostInvoke(
    'tools_sync_child_webview_theme',
    {
      themeMode,
      themeAccent,
      resolvedTheme,
    },
    undefined,
    { includeAncestors: true },
  ).catch(() => {});
};

const applyExternalThemeSync = (detail?: ThemeSyncEventDetail) => {
  if (!detail || detail.source === LOCAL_THEME_SYNC_EVENT_SOURCE) {
    return;
  }

  const themeMode = normalizeThemeMode(detail.themeMode);
  const themeAccent = normalizeThemeAccent(detail.themeAccent);
  const resolvedTheme =
    detail.resolvedTheme === 'dark' || detail.resolvedTheme === 'light'
      ? detail.resolvedTheme
      : undefined;

  applyThemeSettings(
    {
      themeMode,
      themeAccent,
    },
    {
      skipChildWebviewSync: true,
      resolvedThemeOverride: resolvedTheme,
    },
  );
};

const ensureThemeSyncEventListener = () => {
  if (
    themeEventListenerInstalled
    || typeof window === 'undefined'
    || typeof window.addEventListener !== 'function'
  ) {
    return;
  }

  window.addEventListener(OTOOLS_THEME_SYNC_EVENT_NAME, (event: Event) => {
    const customEvent = event as CustomEvent<ThemeSyncEventDetail>;
    applyExternalThemeSync(customEvent.detail);
  });

  themeEventListenerInstalled = true;
};

const applyThemeState = (options: ApplyThemeOptions = {}) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const resolvedTheme = options.resolvedThemeOverride ?? resolveTheme(currentThemeMode);

  root.classList.toggle(DARK_CLASS_NAME, resolvedTheme === 'dark');
  root.classList.toggle(LIGHT_CLASS_NAME, resolvedTheme === 'light');
  root.style.colorScheme = resolvedTheme;
  root.setAttribute(THEME_MODE_ATTRIBUTE, currentThemeMode);
  root.setAttribute(THEME_ACCENT_ATTRIBUTE, currentThemeAccent);

  const nextThemeState = JSON.stringify({
    themeMode: currentThemeMode,
    themeAccent: currentThemeAccent,
    resolvedTheme,
  });
  if (lastSyncedThemeState === nextThemeState) {
    return;
  }
  lastSyncedThemeState = nextThemeState;

  if (options.skipChildWebviewSync) {
    return;
  }

  syncChildWebviewTheme(currentThemeMode, currentThemeAccent, resolvedTheme);
};

ensureThemeSyncEventListener();

const detachSystemThemeListener = () => {
  if (!systemThemeMediaQuery || !systemThemeListener) {
    return;
  }

  if (typeof systemThemeMediaQuery.removeEventListener === 'function') {
    systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
  } else {
    systemThemeMediaQuery.removeListener(systemThemeListener);
  }

  systemThemeMediaQuery = null;
  systemThemeListener = null;
};

const attachSystemThemeListener = () => {
  if (!supportsMatchMedia()) {
    return;
  }

  systemThemeMediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  systemThemeListener = () => {
    applyThemeMode('system');
  };

  if (typeof systemThemeMediaQuery.addEventListener === 'function') {
    systemThemeMediaQuery.addEventListener('change', systemThemeListener);
  } else {
    systemThemeMediaQuery.addListener(systemThemeListener);
  }
};

export const applyThemeMode = (mode: ThemeMode, options: ApplyThemeOptions = {}) => {
  currentThemeMode = mode;
  persistThemePreference(THEME_MODE_CACHE_KEY, mode);

  detachSystemThemeListener();
  if (mode === 'system') {
    attachSystemThemeListener();
  }

  applyThemeState(options);
};

export const applyThemeAccent = (accent: ThemeAccent, options: ApplyThemeOptions = {}) => {
  currentThemeAccent = accent;
  persistThemePreference(THEME_ACCENT_CACHE_KEY, accent);
  applyThemeState(options);
};

export const applyThemeSettings = (settings: {
  themeMode?: ThemeMode;
  themeAccent?: ThemeAccent;
}, options: ApplyThemeOptions = {}) => {
  if (settings.themeMode) {
    currentThemeMode = settings.themeMode;
    persistThemePreference(THEME_MODE_CACHE_KEY, settings.themeMode);
  }

  if (settings.themeAccent) {
    currentThemeAccent = settings.themeAccent;
    persistThemePreference(THEME_ACCENT_CACHE_KEY, settings.themeAccent);
  }

  detachSystemThemeListener();
  if (currentThemeMode === 'system') {
    attachSystemThemeListener();
  }

  applyThemeState(options);
};

export const readCachedThemeMode = (): ThemeMode | null => {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    const cached = window.localStorage.getItem(THEME_MODE_CACHE_KEY);
    if (cached === 'light' || cached === 'dark' || cached === 'system') {
      return cached;
    }
    return null;
  } catch {
    return null;
  }
};

export const readCachedThemeAccent = (): ThemeAccent | null => {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null;
    }
    const cached = window.localStorage.getItem(THEME_ACCENT_CACHE_KEY);
    if (
      cached === 'classic'
      || cached === 'violet'
      || cached === 'emerald'
      || cached === 'amber'
      || cached === 'pink'
    ) {
      return cached;
    }
    return null;
  } catch {
    return null;
  }
};

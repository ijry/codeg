export type OtoolsLocale =
  | "zh-CN"
  | "en-US"
  | "ja-JP"
  | "ko-KR"
  | "de-DE"
  | "ru-RU"
  | "es-ES"
  | "ar-SA";
export type OtoolsLocaleSetting = OtoolsLocale | "system";

type RefLike<T> = { value: T };

export const OTOOLS_LOCALE_SYNC_EVENT_NAME = "otools-locale-changed";
export const OTOOLS_LOCALE_CACHE_KEY = "otools:locale";
export const DEFAULT_LOCALE: OtoolsLocale = "zh-CN";
export const ENGLISH_FALLBACK_LOCALE: OtoolsLocale = "en-US";
export const SUPPORTED_LOCALES: OtoolsLocale[] = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "de-DE",
  "ru-RU",
  "es-ES",
  "ar-SA",
];

export const currentLocaleRef: RefLike<OtoolsLocale> = {
  value: DEFAULT_LOCALE,
};
export const currentLocaleSettingRef: RefLike<OtoolsLocaleSetting> = {
  value: "system",
};

const normalizeLocale = (value?: string | null): OtoolsLocale => {
  const normalized = String(value || "").trim();
  return SUPPORTED_LOCALES.includes(normalized as OtoolsLocale)
    ? (normalized as OtoolsLocale)
    : DEFAULT_LOCALE;
};

const normalizeLocaleSetting = (
  value?: string | null,
): OtoolsLocaleSetting => {
  const normalized = String(value || "").trim();
  return normalized === "system" ? "system" : normalizeLocale(normalized);
};

const interpolate = (template: string, params?: Record<string, unknown>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params?.[key];
    return value === undefined || value === null ? "" : String(value);
  });

export const getCurrentLocale = () => currentLocaleRef.value;

export const getSystemLocale = (): OtoolsLocale => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  const candidates =
    Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  for (const candidate of candidates) {
    const language = String(candidate || "")
      .replace(/_/g, "-")
      .split("-")[0]
      .toLowerCase();
    switch (language) {
      case "en":
        return "en-US";
      case "ja":
        return "ja-JP";
      case "ko":
        return "ko-KR";
      case "de":
        return "de-DE";
      case "ru":
        return "ru-RU";
      case "es":
        return "es-ES";
      case "ar":
        return "ar-SA";
      case "zh":
        return "zh-CN";
      default:
        break;
    }
  }
  return DEFAULT_LOCALE;
};

export const resolveLocaleSetting = (settings: {
  locale?: string | null;
  resolvedLocale?: string | null;
}): OtoolsLocale => {
  const localeSetting = normalizeLocaleSetting(settings.locale);
  if (localeSetting !== "system") {
    return localeSetting;
  }
  if (typeof navigator !== "undefined") {
    return getSystemLocale();
  }
  return normalizeLocale(settings.resolvedLocale);
};

export const readCachedLocale = (): OtoolsLocaleSetting | null => {
  try {
    if (
      typeof window === "undefined" ||
      typeof window.localStorage === "undefined"
    ) {
      return null;
    }
    const cached = window.localStorage.getItem(OTOOLS_LOCALE_CACHE_KEY);
    return cached ? normalizeLocaleSetting(cached) : null;
  } catch {
    return null;
  }
};

export const applyLocaleSettings = (settings: {
  locale?: string | null;
  resolvedLocale?: string | null;
}) => {
  const localeSetting = normalizeLocaleSetting(settings.locale);
  const locale = resolveLocaleSetting(settings);
  currentLocaleSettingRef.value = localeSetting;
  currentLocaleRef.value = locale;
  try {
    window.localStorage.setItem(OTOOLS_LOCALE_CACHE_KEY, localeSetting);
  } catch {
    // ignore unavailable storage
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", locale);
    document.dispatchEvent(
      new CustomEvent(OTOOLS_LOCALE_SYNC_EVENT_NAME, {
        detail: { locale, source: "i18n-local" },
      }),
    );
  }
};

export const setLocaleSyncBridge = () => {};

export const t = (
  key: string,
  params?: Record<string, unknown>,
  fallback?: string,
): string => {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    return fallback || "";
  }
  return interpolate(fallback || normalizedKey, params);
};

export const useI18nScope = (scope?: string) => {
  const prefix = String(scope || "").trim();
  const scopedKey = (key: string) => (prefix ? `${prefix}.${key}` : key);
  return {
    locale: currentLocaleRef,
    t: (key: string, params?: Record<string, unknown>, fallback?: string) =>
      t(scopedKey(key), params, fallback),
  };
};

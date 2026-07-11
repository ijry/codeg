export type OtoolsLocale = "zh-CN" | "en-US" | "ja-JP" | "ko-KR" | "de-DE" | "ru-RU" | "es-ES" | "ar-SA";
export type OtoolsLocaleSetting = OtoolsLocale | "system";
type RefLike<T> = {
    value: T;
};
export declare const OTOOLS_LOCALE_SYNC_EVENT_NAME = "otools-locale-changed";
export declare const OTOOLS_LOCALE_CACHE_KEY = "otools:locale";
export declare const DEFAULT_LOCALE: OtoolsLocale;
export declare const ENGLISH_FALLBACK_LOCALE: OtoolsLocale;
export declare const SUPPORTED_LOCALES: OtoolsLocale[];
export declare const currentLocaleRef: RefLike<OtoolsLocale>;
export declare const currentLocaleSettingRef: RefLike<OtoolsLocaleSetting>;
export declare const getCurrentLocale: () => OtoolsLocale;
export declare const getSystemLocale: () => OtoolsLocale;
export declare const resolveLocaleSetting: (settings: {
    locale?: string | null;
    resolvedLocale?: string | null;
}) => OtoolsLocale;
export declare const readCachedLocale: () => OtoolsLocaleSetting | null;
export declare const applyLocaleSettings: (settings: {
    locale?: string | null;
    resolvedLocale?: string | null;
}) => void;
export declare const setLocaleSyncBridge: () => void;
export declare const t: (key: string, params?: Record<string, unknown>, fallback?: string) => string;
export declare const useI18nScope: (scope?: string) => {
    locale: RefLike<OtoolsLocale>;
    t: (key: string, params?: Record<string, unknown>, fallback?: string) => string;
};
export {};

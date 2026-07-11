export type AiSettings = {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
};
export type AliyunBailianRegionOption = {
    label: string;
    value: string;
};
export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeAccent = 'classic' | 'violet' | 'emerald' | 'amber' | 'pink';
export type OtoolsLocale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'de-DE' | 'ru-RU' | 'es-ES' | 'ar-SA';
export type OtoolsLocaleSetting = 'system' | OtoolsLocale;
export type BasicSettings = {
    themeMode: ThemeMode;
    themeAccent: ThemeAccent;
    launchAtStartup: boolean;
    locale: OtoolsLocaleSetting;
    resolvedLocale?: OtoolsLocale;
};
export type OtoolsCommonConfigTab = {
    name: string;
    label: string;
};
export declare const OTOOLS_GLOBAL_AI_SETTINGS_KEY = "ai_settings";
export declare const OTOOLS_GLOBAL_BASIC_SETTINGS_KEY = "basic_settings";
export declare const DEFAULT_AI_SETTINGS: AiSettings;
export declare const AI_PROVIDER_ALIYUN_BAILIAN = "aliyun-bailian";
export declare const ALIYUN_BAILIAN_REGION_OPTIONS: AliyunBailianRegionOption[];
export declare const DEFAULT_BASIC_SETTINGS: BasicSettings;
export declare const LOCALE_OPTIONS: Array<{
    label: string;
    value: OtoolsLocale;
}>;
export declare const THEME_ACCENT_OPTIONS: Array<{
    label: string;
    value: ThemeAccent;
}>;
export declare const COMMON_CONFIG_TABS: OtoolsCommonConfigTab[];
export declare const resolveAiProviderAlias: (provider?: string) => string;
export declare const mergeAiSettings: (value?: Partial<AiSettings> | null) => AiSettings;
export declare const mergeBasicSettings: (value?: Partial<BasicSettings> | null) => BasicSettings;

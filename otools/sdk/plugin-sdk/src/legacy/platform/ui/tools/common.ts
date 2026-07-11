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
export type OtoolsLocale =
  | 'zh-CN'
  | 'en-US'
  | 'ja-JP'
  | 'ko-KR'
  | 'de-DE'
  | 'ru-RU'
  | 'es-ES'
  | 'ar-SA';

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

export const OTOOLS_GLOBAL_AI_SETTINGS_KEY = 'ai_settings';
export const OTOOLS_GLOBAL_BASIC_SETTINGS_KEY = 'basic_settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: 'ollama',
  model: 'qwen2.5-coder:14b',
};

// UI 层使用独立值，避免与 openai 选项 value 冲突。
// 发送请求时再将其归一化为 openai（OpenAI 兼容协议）。
export const AI_PROVIDER_ALIYUN_BAILIAN = 'aliyun-bailian';

export const ALIYUN_BAILIAN_REGION_OPTIONS: AliyunBailianRegionOption[] = [
  {
    label: '华北2（北京）',
    value: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    label: '新加坡',
    value: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  {
    label: '美国（弗吉尼亚）',
    value: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  },
];

export const DEFAULT_BASIC_SETTINGS: BasicSettings = {
  themeMode: 'system',
  themeAccent: 'classic',
  launchAtStartup: false,
  locale: 'system',
};

export const LOCALE_OPTIONS: Array<{ label: string; value: OtoolsLocale }> = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
  { label: '日本語', value: 'ja-JP' },
  { label: '한국어', value: 'ko-KR' },
  { label: 'Deutsch', value: 'de-DE' },
  { label: 'Русский', value: 'ru-RU' },
  { label: 'Español', value: 'es-ES' },
  { label: 'العربية', value: 'ar-SA' },
];

export const THEME_ACCENT_OPTIONS: Array<{ label: string; value: ThemeAccent }> = [
  { label: '经典蓝', value: 'classic' },
  { label: '星云紫', value: 'violet' },
  { label: '翡翠绿', value: 'emerald' },
  { label: '琥珀橙', value: 'amber' },
  { label: '莓果粉', value: 'pink' },
];

export const COMMON_CONFIG_TABS: OtoolsCommonConfigTab[] = [
  {
    name: 'basic',
    label: '系统设置',
  },
  {
    name: 'ai',
    label: 'AI配置',
  },
];

const normalizeAiProvider = (provider?: string): string => {
  const raw = String(provider || '').trim().toLowerCase();
  if (raw === 'openai' || raw === 'ollama' || raw === 'azure' || raw === AI_PROVIDER_ALIYUN_BAILIAN) {
    return raw;
  }
  if (raw === 'dashscope' || raw === 'aliyun' || raw === 'bailian') {
    return AI_PROVIDER_ALIYUN_BAILIAN;
  }
  return DEFAULT_AI_SETTINGS.provider;
};

export const resolveAiProviderAlias = (provider?: string): string => {
  const normalized = normalizeAiProvider(provider);
  if (normalized === AI_PROVIDER_ALIYUN_BAILIAN) {
    return 'openai';
  }
  return normalized;
};

const isAliyunBailianBaseUrl = (baseUrl: string): boolean => {
  const normalized = baseUrl.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ALIYUN_BAILIAN_REGION_OPTIONS.some((item) => item.value.toLowerCase() === normalized);
};

const normalizeRequiredText = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || fallback;
};

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const mergeAiSettings = (value?: Partial<AiSettings> | null): AiSettings => {
  const incoming = (value || {}) as Partial<AiSettings>;
  const apiKeyProvided = hasOwn(incoming as object, 'apiKey');
  const normalizedBaseUrl = normalizeRequiredText(incoming.baseUrl, DEFAULT_AI_SETTINGS.baseUrl);
  const normalizedProvider = normalizeAiProvider(incoming.provider);
  const provider = normalizedProvider === 'openai' && isAliyunBailianBaseUrl(normalizedBaseUrl)
    ? AI_PROVIDER_ALIYUN_BAILIAN
    : normalizedProvider;

  return {
    provider,
    baseUrl: normalizedBaseUrl,
    model: normalizeRequiredText(incoming.model, DEFAULT_AI_SETTINGS.model),
    apiKey: apiKeyProvided
      ? (typeof incoming.apiKey === 'string' ? incoming.apiKey.trim() : '')
      : DEFAULT_AI_SETTINGS.apiKey,
  };
};

const normalizeThemeMode = (mode?: string): ThemeMode => {
  if (mode === 'light' || mode === 'dark' || mode === 'system') {
    return mode;
  }
  return DEFAULT_BASIC_SETTINGS.themeMode;
};

const normalizeThemeAccent = (accent?: string): ThemeAccent => {
  if (
    accent === 'classic'
    || accent === 'violet'
    || accent === 'emerald'
    || accent === 'amber'
    || accent === 'pink'
  ) {
    return accent;
  }
  return DEFAULT_BASIC_SETTINGS.themeAccent;
};

const normalizeResolvedLocale = (locale?: string): OtoolsLocale | undefined => {
  if (
    locale === 'zh-CN'
    || locale === 'en-US'
    || locale === 'ja-JP'
    || locale === 'ko-KR'
    || locale === 'de-DE'
    || locale === 'ru-RU'
    || locale === 'es-ES'
    || locale === 'ar-SA'
  ) {
    return locale;
  }
  return undefined;
};

const normalizeLocaleSetting = (locale?: string): OtoolsLocaleSetting => {
  if (locale === 'system') {
    return 'system';
  }
  return normalizeResolvedLocale(locale) || DEFAULT_BASIC_SETTINGS.locale;
};

export const mergeBasicSettings = (value?: Partial<BasicSettings> | null): BasicSettings => ({
  themeMode: normalizeThemeMode(value?.themeMode),
  themeAccent: normalizeThemeAccent(value?.themeAccent),
  launchAtStartup: typeof value?.launchAtStartup === 'boolean'
    ? value.launchAtStartup
    : DEFAULT_BASIC_SETTINGS.launchAtStartup,
  locale: normalizeLocaleSetting(value?.locale),
  resolvedLocale: normalizeResolvedLocale(value?.resolvedLocale),
});

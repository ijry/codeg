"use client"

import {
  DEFAULT_LANGUAGE_SETTINGS,
  LANGUAGE_SETTINGS_STORAGE_KEY,
  getCurrentEffectiveAppLocale,
  isAppLocale,
  normalizeLanguageSettings,
} from "@/lib/i18n"
import { updateSystemLanguageSettings } from "@/lib/api"
import { STORAGE_KEY_THEME_COLOR } from "@/lib/appearance-script"
import type { ThemeColor } from "@/lib/theme-presets"
import type { AppLocale, SystemLanguageSettings } from "@/lib/types"
import type {
  OtoolsAiSettings,
  OtoolsBasicSettings,
  OtoolsLocale,
  OtoolsLocaleSetting,
  OtoolsThemeAccent,
  OtoolsThemeMode,
} from "./types"

export const OTOOLS_GLOBAL_AI_SETTINGS_KEY = "ai_settings"
export const OTOOLS_GLOBAL_BASIC_SETTINGS_KEY = "basic_settings"
export const AI_PROVIDER_ALIYUN_BAILIAN = "aliyun-bailian"

export const DEFAULT_AI_SETTINGS: OtoolsAiSettings = {
  provider: "openai",
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
  model: "qwen2.5-coder:14b",
}

export const DEFAULT_BASIC_SETTINGS: OtoolsBasicSettings = {
  themeMode: "system",
  themeAccent: "classic",
  launchAtStartup: false,
  locale: "system",
  resolvedLocale: null,
}

export const OTOOLS_LOCALE_OPTIONS: Array<{
  label: string
  value: OtoolsLocale
  hostSupported: boolean
}> = [
  { label: "简体中文", value: "zh-CN", hostSupported: true },
  { label: "繁體中文", value: "zh-TW", hostSupported: true },
  { label: "English", value: "en-US", hostSupported: true },
  { label: "日本語", value: "ja-JP", hostSupported: true },
  { label: "한국어", value: "ko-KR", hostSupported: true },
  { label: "Deutsch", value: "de-DE", hostSupported: true },
  { label: "Français", value: "fr-FR", hostSupported: true },
  { label: "Português", value: "pt-PT", hostSupported: true },
  { label: "Русский", value: "ru-RU", hostSupported: false },
  { label: "Español", value: "es-ES", hostSupported: true },
  { label: "العربية", value: "ar-SA", hostSupported: true },
]

export const THEME_ACCENT_OPTIONS: Array<{
  label: string
  value: OtoolsThemeAccent
}> = [
  { label: "经典蓝", value: "classic" },
  { label: "星云紫", value: "violet" },
  { label: "翡翠绿", value: "emerald" },
  { label: "琥珀橙", value: "amber" },
  { label: "莓果粉", value: "pink" },
]

export const ALIYUN_BAILIAN_REGION_OPTIONS = [
  {
    label: "华北 2（北京）",
    value: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "新加坡",
    value: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  {
    label: "美国（弗吉尼亚）",
    value: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  },
] as const

export const OLLAMA_BASE_URL_OPTIONS = [
  {
    label: "本机 Ollama",
    value: "http://127.0.0.1:11434/v1",
  },
] as const

const OTOOLS_LOCALE_SET = new Set<OtoolsLocale>(
  OTOOLS_LOCALE_OPTIONS.map((item) => item.value)
)

const THEME_ACCENT_TO_HOST_COLOR: Record<OtoolsThemeAccent, ThemeColor> = {
  classic: "blue",
  violet: "violet",
  emerald: "green",
  amber: "orange",
  pink: "rose",
}

const HOST_COLOR_TO_THEME_ACCENT: Record<string, OtoolsThemeAccent> = {
  blue: "classic",
  violet: "violet",
  green: "emerald",
  yellow: "amber",
  orange: "amber",
  rose: "pink",
  red: "pink",
}

const APP_LOCALE_TO_OTOOLS_LOCALE: Record<AppLocale, OtoolsLocale> = {
  en: "en-US",
  zh_cn: "zh-CN",
  zh_tw: "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
  de: "de-DE",
  fr: "fr-FR",
  pt: "pt-PT",
  ar: "ar-SA",
}

const OTOOLS_LOCALE_TO_APP_LOCALE: Partial<Record<OtoolsLocale, AppLocale>> = {
  "en-US": "en",
  "zh-CN": "zh_cn",
  "zh-TW": "zh_tw",
  "ja-JP": "ja",
  "ko-KR": "ko",
  "es-ES": "es",
  "de-DE": "de",
  "fr-FR": "fr",
  "pt-PT": "pt",
  "ar-SA": "ar",
}

function hasOwn(obj: object, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeRequiredText(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : ""
  return raw || fallback
}

function normalizeAiProvider(provider?: string): string {
  const raw = String(provider || "")
    .trim()
    .toLowerCase()
  if (
    raw === "openai" ||
    raw === "ollama" ||
    raw === "azure" ||
    raw === AI_PROVIDER_ALIYUN_BAILIAN
  ) {
    return raw
  }
  if (raw === "dashscope" || raw === "aliyun" || raw === "bailian") {
    return AI_PROVIDER_ALIYUN_BAILIAN
  }
  return DEFAULT_AI_SETTINGS.provider
}

function isAliyunBailianBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase()
  if (!normalized) return false
  return ALIYUN_BAILIAN_REGION_OPTIONS.some(
    (item) => item.value.toLowerCase() === normalized
  )
}

function normalizeThemeMode(mode?: string): OtoolsThemeMode {
  if (mode === "light" || mode === "dark" || mode === "system") {
    return mode
  }
  return DEFAULT_BASIC_SETTINGS.themeMode
}

function normalizeThemeAccent(accent?: string): OtoolsThemeAccent {
  if (
    accent === "classic" ||
    accent === "violet" ||
    accent === "emerald" ||
    accent === "amber" ||
    accent === "pink"
  ) {
    return accent
  }
  return DEFAULT_BASIC_SETTINGS.themeAccent
}

function normalizeResolvedLocale(locale?: string): OtoolsLocale | null {
  if (locale && OTOOLS_LOCALE_SET.has(locale as OtoolsLocale)) {
    return locale as OtoolsLocale
  }
  return null
}

function normalizeLocaleSetting(locale?: string): OtoolsLocaleSetting {
  if (locale === "system") {
    return locale
  }
  return normalizeResolvedLocale(locale) ?? DEFAULT_BASIC_SETTINGS.locale
}

function readStoredThemeMode(): OtoolsThemeMode {
  if (typeof window === "undefined") return DEFAULT_BASIC_SETTINGS.themeMode
  try {
    return normalizeThemeMode(window.localStorage.getItem("theme") ?? undefined)
  } catch {
    return DEFAULT_BASIC_SETTINGS.themeMode
  }
}

function readStoredThemeColor(): ThemeColor {
  if (typeof window === "undefined") return THEME_ACCENT_TO_HOST_COLOR.classic
  try {
    const color = window.localStorage.getItem(STORAGE_KEY_THEME_COLOR)
    if (color && color in HOST_COLOR_TO_THEME_ACCENT) {
      return color as ThemeColor
    }
  } catch {
    return THEME_ACCENT_TO_HOST_COLOR.classic
  }
  return THEME_ACCENT_TO_HOST_COLOR.classic
}

function readStoredLanguageSettings(): SystemLanguageSettings {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE_SETTINGS
  try {
    const raw = window.localStorage.getItem(LANGUAGE_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_LANGUAGE_SETTINGS
    return normalizeLanguageSettings(
      JSON.parse(raw) as Partial<SystemLanguageSettings>
    )
  } catch {
    return DEFAULT_LANGUAGE_SETTINGS
  }
}

function dispatchStorageChange(key: string, newValue: string | null) {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue,
        oldValue: null,
        storageArea: window.localStorage,
        url: window.location.href,
      })
    )
  } catch {
    window.dispatchEvent(new Event("storage"))
  }
}

function applyDocumentThemeMode(mode: OtoolsThemeMode) {
  if (typeof document === "undefined" || typeof window === "undefined") return
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode

  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.style.colorScheme = resolved
  document.documentElement.style.backgroundColor =
    resolved === "dark" ? "#09090b" : ""
}

function persistThemeMode(mode: OtoolsThemeMode) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem("theme", mode)
    dispatchStorageChange("theme", mode)
  } catch {
    return
  }

  applyDocumentThemeMode(mode)

  if ("__TAURI_INTERNALS__" in window) {
    void import("@/lib/tauri")
      .then((tauri) => tauri.updateAppearanceMode(mode))
      .catch(() => {})
  }
}

function persistThemeAccent(accent: OtoolsThemeAccent) {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const themeColor = mapThemeAccentToHostColor(accent)
  document.documentElement.setAttribute("data-theme", themeColor)
  try {
    window.localStorage.setItem(STORAGE_KEY_THEME_COLOR, themeColor)
    dispatchStorageChange(STORAGE_KEY_THEME_COLOR, themeColor)
  } catch {
    return
  }
}

export function resolveAiProviderAlias(provider?: string): string {
  const normalized = normalizeAiProvider(provider)
  if (normalized === AI_PROVIDER_ALIYUN_BAILIAN) {
    return "openai"
  }
  return normalized
}

export function mergeAiSettings(
  value?: Partial<OtoolsAiSettings> | null
): OtoolsAiSettings {
  const incoming = (value || {}) as Partial<OtoolsAiSettings>
  const apiKeyProvided = hasOwn(incoming as object, "apiKey")
  const normalizedBaseUrl = normalizeRequiredText(
    incoming.baseUrl,
    DEFAULT_AI_SETTINGS.baseUrl
  )
  const normalizedProvider = normalizeAiProvider(incoming.provider)
  const provider =
    normalizedProvider === "openai" && isAliyunBailianBaseUrl(normalizedBaseUrl)
      ? AI_PROVIDER_ALIYUN_BAILIAN
      : normalizedProvider

  return {
    provider,
    baseUrl: normalizedBaseUrl,
    model: normalizeRequiredText(incoming.model, DEFAULT_AI_SETTINGS.model),
    apiKey: apiKeyProvided
      ? typeof incoming.apiKey === "string"
        ? incoming.apiKey.trim()
        : ""
      : DEFAULT_AI_SETTINGS.apiKey,
  }
}

export function mergeBasicSettings(
  value?: Partial<OtoolsBasicSettings> | null
): OtoolsBasicSettings {
  return {
    themeMode: normalizeThemeMode(value?.themeMode),
    themeAccent: normalizeThemeAccent(value?.themeAccent),
    launchAtStartup:
      typeof value?.launchAtStartup === "boolean"
        ? value.launchAtStartup
        : DEFAULT_BASIC_SETTINGS.launchAtStartup,
    locale: normalizeLocaleSetting(value?.locale),
    resolvedLocale: normalizeResolvedLocale(value?.resolvedLocale ?? undefined),
  }
}

export function mapThemeAccentToHostColor(
  accent: OtoolsThemeAccent
): ThemeColor {
  return THEME_ACCENT_TO_HOST_COLOR[accent]
}

export function mapHostColorToThemeAccent(
  color: string | null | undefined
): OtoolsThemeAccent {
  return HOST_COLOR_TO_THEME_ACCENT[String(color || "").trim()] ?? "classic"
}

export function mapAppLocaleToOtoolsLocale(appLocale: AppLocale): OtoolsLocale {
  return APP_LOCALE_TO_OTOOLS_LOCALE[appLocale]
}

export function mapOtoolsLocaleToAppLocale(
  locale: OtoolsLocale
): AppLocale | null {
  return OTOOLS_LOCALE_TO_APP_LOCALE[locale] ?? null
}

export function isHostLocaleSupported(locale: OtoolsLocaleSetting): boolean {
  if (locale === "system") return true
  return mapOtoolsLocaleToAppLocale(locale) !== null
}

export function resolveLocaleSetting(
  settings: Partial<OtoolsBasicSettings> | null | undefined,
  fallbackAppLocale: AppLocale = getCurrentEffectiveAppLocale()
): OtoolsLocale {
  const merged = mergeBasicSettings(settings)
  if (merged.locale !== "system") {
    return merged.locale
  }
  return mapAppLocaleToOtoolsLocale(fallbackAppLocale)
}

export function normalizeBasicSettingsForSave(
  value?: Partial<OtoolsBasicSettings> | null,
  fallbackAppLocale: AppLocale = getCurrentEffectiveAppLocale()
): OtoolsBasicSettings {
  const merged = mergeBasicSettings(value)
  return {
    ...merged,
    resolvedLocale: resolveLocaleSetting(merged, fallbackAppLocale),
  }
}

export function createHostMirroredBasicSettings(): OtoolsBasicSettings {
  const languageSettings = readStoredLanguageSettings()
  const currentLocale = getCurrentEffectiveAppLocale()
  const locale =
    languageSettings.mode === "manual" && isAppLocale(languageSettings.language)
      ? mapAppLocaleToOtoolsLocale(languageSettings.language)
      : "system"

  return normalizeBasicSettingsForSave({
    themeMode: readStoredThemeMode(),
    themeAccent: mapHostColorToThemeAccent(readStoredThemeColor()),
    launchAtStartup: false,
    locale,
    resolvedLocale: mapAppLocaleToOtoolsLocale(currentLocale),
  })
}

export function normalizeConfigValueForSave(
  key: string,
  value: unknown
): unknown {
  const normalizedKey = String(key || "").trim()
  if (normalizedKey === OTOOLS_GLOBAL_AI_SETTINGS_KEY) {
    return mergeAiSettings(value as Partial<OtoolsAiSettings> | null)
  }
  if (normalizedKey === OTOOLS_GLOBAL_BASIC_SETTINGS_KEY) {
    return normalizeBasicSettingsForSave(
      value as Partial<OtoolsBasicSettings> | null
    )
  }
  return value
}

export async function syncBasicSettingsToHost(
  value: Partial<OtoolsBasicSettings> | null | undefined
): Promise<void> {
  const settings = normalizeBasicSettingsForSave(value)
  persistThemeMode(settings.themeMode)
  persistThemeAccent(settings.themeAccent)

  const nextAppLocale =
    settings.locale === "system"
      ? null
      : mapOtoolsLocaleToAppLocale(settings.locale)
  const previousSettings = readStoredLanguageSettings()
  const nextLanguageSettings: SystemLanguageSettings | null =
    settings.locale === "system"
      ? {
          mode: "system",
          language: previousSettings.language,
        }
      : nextAppLocale
        ? {
            mode: "manual",
            language: nextAppLocale,
          }
        : null

  if (!nextLanguageSettings || typeof window === "undefined") {
    return
  }

  const serialized = JSON.stringify(nextLanguageSettings)
  try {
    window.localStorage.setItem(LANGUAGE_SETTINGS_STORAGE_KEY, serialized)
    dispatchStorageChange(LANGUAGE_SETTINGS_STORAGE_KEY, serialized)
  } catch {
    // fall through to transport save below
  }

  try {
    await updateSystemLanguageSettings(nextLanguageSettings)
  } catch (error) {
    console.error("[otools-config] sync language settings failed:", error)
  }
}

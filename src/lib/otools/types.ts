export interface OtoolsPluginInfo {
  uuid: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  developerName?: string | null
  summary?: string | null
  version?: string | null
  icon?: string | null
  entry: string
  openInBrowser: boolean
  nativeEnabled: boolean
  source: string
  assetBaseUrl: string
}

export interface OtoolsNavigationResult {
  path: string
}

export interface OtoolsAssetPayload {
  path: string
  mime: string
  dataBase64: string
  text?: string | null
}

export interface OtoolsAiChatMessage {
  id: string
  role: string
  content: string
  createdAt: string
}

export interface OtoolsHostInfo {
  dataDir: string
  pluginRoots: string[]
  pluginCount: number
  platform: string
}

export interface OtoolsConfigTab {
  title: string
  name: string
  content: string
  closable: boolean
  pluginUuid?: string | null
}

export interface OtoolsConfig {
  tabs: OtoolsConfigTab[]
  active_tab: string
}

export type OtoolsThemeMode = "system" | "light" | "dark"

export type OtoolsThemeAccent =
  | "classic"
  | "violet"
  | "emerald"
  | "amber"
  | "pink"

export type OtoolsLocale =
  | "zh-CN"
  | "zh-TW"
  | "en-US"
  | "ja-JP"
  | "ko-KR"
  | "de-DE"
  | "fr-FR"
  | "pt-PT"
  | "ru-RU"
  | "es-ES"
  | "ar-SA"

export type OtoolsLocaleSetting = "system" | OtoolsLocale

export interface OtoolsBasicSettings {
  themeMode: OtoolsThemeMode
  themeAccent: OtoolsThemeAccent
  launchAtStartup: boolean
  locale: OtoolsLocaleSetting
  resolvedLocale?: OtoolsLocale | null
}

export interface OtoolsAiSettings {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface DevVersionRecord {
  id: string
  version: string
  changelog: string
  downloadUrl: string
  publishedAt: string
  status: string
}

export interface DevPluginRecord {
  uuid: string
  icon: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  developerName: string
  summary: string
  screenshots: string[]
  version: string
  devUrl: string
  hasAd: boolean
  inPluginPurchase: boolean
  agreementAccepted: boolean
  createdAt: string
  updatedAt: string
  debugEnabled: boolean
  directoryBound: boolean
  boundDirectoryPath: string
  pluginManifestPath: string
  packFilePath: string
  versionRecords: DevVersionRecord[]
}

export interface DevWorkspace {
  metaStateFilePath: string
  bindingStateFilePath: string
  packsDir: string
  docsUrl: string
  items: DevPluginRecord[]
}

export interface DevPluginInput {
  icon: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  developerName: string
  summary: string
  screenshots: string[]
  version: string
  devUrl: string
  hasAd: boolean
  inPluginPurchase: boolean
  agreementAccepted: boolean
}

export interface DevPluginActionResult {
  message: string
  item: DevPluginRecord
}

export interface DevPublishVersionInput {
  uuid: string
  version: string
  changelog: string
  downloadUrl: string
}

export interface DevNativeBuildJobStart {
  jobId: string
}

export interface DevNativeBuildJobSnapshot {
  jobId: string
  running: boolean
  success?: boolean | null
  log: string
  message: string
  error: string
}

export interface DevNativeConfig {
  enabled: boolean
  manifestPath: string
}

export type OtoolsNativeProbeResult = {
  ok?: boolean
  pluginUuid?: string
  runtime?: string
  windowLabel?: string
  enabled?: boolean
  manifestPath?: string
} & Record<string, unknown>

export interface ParkReviewItem {
  user: string
  rating: number
  content: string
  date: string
}

export interface ParkCatalogItem {
  uuid: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  developerName: string
  summary: string
  screenshots: string[]
  version: string
  minOtoolsVersion?: string
  minOToolsVersion?: string
  installedVersion: string
  updateAvailable: boolean
  meetsMinOtoolsVersion?: boolean
  meetsMinOToolsVersion?: boolean
  icon: string
  entry: string
  easyMode: number
  hasAd: boolean
  inPluginPurchase: boolean
  official: boolean
  rating: number
  ratingCount: number
  categories: string[]
  packageUrl: string
  reviews: ParkReviewItem[]
  supportMacos: boolean
  supportWindows: boolean
  supportLinux: boolean
  installed: boolean
  installable: boolean
}

export interface ParkCategory {
  key: string
  label: string
  count: number
}

export interface ParkWorkspace {
  downloadsDir: string
  pluginsDir: string
  pluginsFilePath: string
  currentOtoolsVersion?: string
  currentOToolsVersion?: string
  categories: ParkCategory[]
  items: ParkCatalogItem[]
  note: string
}

export interface ParkInstallResult {
  uuid: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  downloadPath: string
  installPath: string
  allPluginsCount: number
  message: string
}

export interface ParkUninstallResult {
  uuid: string
  packid: string
  displayName: string
  displayNameCn?: string | null
  allPluginsCount: number
  message: string
}

export interface OtoolsBridgeRequest {
  id: string
  type: "otools:invoke"
  command: string
  payload?: unknown
}

export interface OtoolsBridgeResponse {
  id: string
  type: "otools:invoke-result"
  ok: boolean
  data?: unknown
  error?: string
}

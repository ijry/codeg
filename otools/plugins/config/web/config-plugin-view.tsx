"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bot,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getOtoolsConfig,
  getOtoolsConfigValue,
  saveOtoolsConfigValue,
} from "@/lib/otools/api"
import {
  AI_PROVIDER_ALIYUN_BAILIAN,
  ALIYUN_BAILIAN_REGION_OPTIONS,
  createHostMirroredBasicSettings,
  DEFAULT_AI_SETTINGS,
  isHostLocaleSupported,
  mergeAiSettings,
  normalizeBasicSettingsForSave,
  OLLAMA_BASE_URL_OPTIONS,
  OTOOLS_GLOBAL_AI_SETTINGS_KEY,
  OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
  OTOOLS_LOCALE_OPTIONS,
  resolveLocaleSetting,
  syncBasicSettingsToHost,
  THEME_ACCENT_OPTIONS,
} from "@/lib/otools/config-runtime"
import type {
  OtoolsAiSettings,
  OtoolsBasicSettings,
  OtoolsHostInfo,
  OtoolsPluginInfo,
} from "@/lib/otools/types"
import { cn } from "@/lib/utils"

export function ConfigPluginView({
  hostInfo,
  loading,
  onRefresh,
  plugin,
  plugins,
}: {
  hostInfo: OtoolsHostInfo | null
  loading: boolean
  marketQuery: string
  onMarketQueryChange: (value: string) => void
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  onRefresh: () => void
  plugin: OtoolsPluginInfo
  plugins: OtoolsPluginInfo[]
}) {
  const [activeTab, setActiveTab] = useState("basic")
  const [basicSettings, setBasicSettings] = useState<OtoolsBasicSettings>(
    createHostMirroredBasicSettings()
  )
  const [aiSettings, setAiSettings] =
    useState<OtoolsAiSettings>(DEFAULT_AI_SETTINGS)
  const [otoolsTabCount, setOtoolsTabCount] = useState(0)
  const [otoolsActiveTab, setOtoolsActiveTab] = useState("home")
  const [configLoading, setConfigLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const builtinCount = plugins.filter(
    (item) => item.source.toLowerCase() === "builtin"
  ).length
  const resolvedLocale = useMemo(
    () => resolveLocaleSetting(basicSettings),
    [basicSettings]
  )
  const localeUnsupported =
    basicSettings.locale !== "system" &&
    !isHostLocaleSupported(basicSettings.locale)

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    setError(null)
    setStatus(null)
    try {
      const [config, globalBasic, globalAi] = await Promise.all([
        getOtoolsConfig(),
        getOtoolsConfigValue<Partial<OtoolsBasicSettings>>(
          OTOOLS_GLOBAL_BASIC_SETTINGS_KEY
        ),
        getOtoolsConfigValue<Partial<OtoolsAiSettings>>(
          OTOOLS_GLOBAL_AI_SETTINGS_KEY
        ),
      ])

      setOtoolsTabCount(config.tabs.length)
      setOtoolsActiveTab(config.active_tab || "home")
      setBasicSettings(
        globalBasic
          ? normalizeBasicSettingsForSave(globalBasic)
          : createHostMirroredBasicSettings()
      )
      setAiSettings(mergeAiSettings(globalAi))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfigLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const refresh = useCallback(() => {
    onRefresh()
    void loadConfig()
  }, [loadConfig, onRefresh])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const normalizedAi = mergeAiSettings(aiSettings)
      const normalizedBasic = normalizeBasicSettingsForSave(basicSettings)

      await saveOtoolsConfigValue(OTOOLS_GLOBAL_AI_SETTINGS_KEY, normalizedAi)
      await saveOtoolsConfigValue(
        OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
        normalizedBasic
      )
      await syncBasicSettingsToHost(normalizedBasic)

      setAiSettings(normalizedAi)
      setBasicSettings(normalizedBasic)
      setStatus("OTools 全局配置已保存")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [aiSettings, basicSettings])

  const resetToHost = useCallback(() => {
    setBasicSettings(createHostMirroredBasicSettings())
    setAiSettings(DEFAULT_AI_SETTINGS)
    setStatus("已重置到宿主当前主题/语言与默认 AI 配置")
    setError(null)
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <Badge variant="secondary">{plugin.packid}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            保持 MenuGit `basic_settings` / `ai_settings` 配置结构不变，同时把
            主题、主题色和语言尽量同步到 codeg-plus 宿主。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetToHost} disabled={saving}>
            重置
          </Button>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={loading || saving}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
          <Button
            onClick={() => void save()}
            disabled={configLoading || saving}
          >
            <Save className="h-4 w-4" />
            保存配置
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <MetricCard label="插件总数" value={String(plugins.length)} />
        <MetricCard label="内置插件" value={String(builtinCount)} />
        <MetricCard label="标签页数" value={String(otoolsTabCount)} />
        <MetricCard label="当前标签" value={otoolsActiveTab} />
      </div>

      {status ? (
        <InfoBanner
          className="mt-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          icon={<ShieldCheck className="h-4 w-4" />}
          text={status}
        />
      ) : null}

      {localeUnsupported ? (
        <InfoBanner
          className="mt-4 border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          icon={<ShieldAlert className="h-4 w-4" />}
          text="当前选择的 OTools 语言可以保存到插件配置，但 codeg-plus 宿主本身暂不支持同步到该语言。"
        />
      ) : null}

      {error ? (
        <InfoBanner
          className="mt-4 border-destructive/30 bg-destructive/10 text-destructive"
          icon={<ShieldAlert className="h-4 w-4" />}
          text={error}
        />
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="basic">
                <Sparkles className="mr-2 h-4 w-4" />
                基础设置
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Bot className="mr-2 h-4 w-4" />
                AI 配置
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-0 space-y-5">
              <FormField
                label="主题模式"
                description="同步到 codeg-plus 当前窗口主题模式。"
              >
                <Select
                  value={basicSettings.themeMode}
                  onValueChange={(value) =>
                    setBasicSettings((current) => ({
                      ...current,
                      themeMode: value as OtoolsBasicSettings["themeMode"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">跟随系统</SelectItem>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                label="主题色"
                description="按 MenuGit 的 themeAccent 结构保存。"
              >
                <Select
                  value={basicSettings.themeAccent}
                  onValueChange={(value) =>
                    setBasicSettings((current) => ({
                      ...current,
                      themeAccent: value as OtoolsBasicSettings["themeAccent"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_ACCENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                label="界面语言"
                description={`当前解析语言：${resolvedLocale}`}
              >
                <Select
                  value={basicSettings.locale}
                  onValueChange={(value) =>
                    setBasicSettings((current) => ({
                      ...current,
                      locale: value as OtoolsBasicSettings["locale"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">跟随系统</SelectItem>
                    {OTOOLS_LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        {!option.hostSupported ? "（仅配置保存）" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={false} disabled aria-hidden />
                  <div className="space-y-1">
                    <Label className="text-sm">开机启动</Label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      codeg-plus 当前宿主还没有接入 MenuGit 的
                      `otools_get_launch_at_startup` /
                      `otools_set_launch_at_startup`
                      原生能力，因此这里先固定为未启用。
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai" className="mt-0 space-y-5">
              <FormField
                label="Provider"
                description="保持 OTools 插件读取的 ai_settings 结构兼容。"
              >
                <Select
                  value={aiSettings.provider}
                  onValueChange={(value) =>
                    setAiSettings((current) => ({
                      ...current,
                      provider: value,
                      baseUrl:
                        value === AI_PROVIDER_ALIYUN_BAILIAN &&
                        !current.baseUrl.trim()
                          ? (ALIYUN_BAILIAN_REGION_OPTIONS[0]?.value ??
                            current.baseUrl)
                          : value === "ollama" && !current.baseUrl.trim()
                            ? (OLLAMA_BASE_URL_OPTIONS[0]?.value ??
                              current.baseUrl)
                            : current.baseUrl,
                    }))
                  }
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI 兼容</SelectItem>
                    <SelectItem value={AI_PROVIDER_ALIYUN_BAILIAN}>
                      阿里云百炼
                    </SelectItem>
                    <SelectItem value="ollama">Ollama</SelectItem>
                    <SelectItem value="azure">Azure OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                label="Base URL"
                description="插件读取时将按原字段名使用。"
              >
                <div className="space-y-3">
                  <Input
                    value={aiSettings.baseUrl}
                    placeholder="https://api.openai.com/v1"
                    onChange={(event) =>
                      setAiSettings((current) => ({
                        ...current,
                        baseUrl: event.target.value,
                      }))
                    }
                  />
                  {aiSettings.provider === AI_PROVIDER_ALIYUN_BAILIAN ? (
                    <div className="flex flex-wrap gap-2">
                      {ALIYUN_BAILIAN_REGION_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAiSettings((current) => ({
                              ...current,
                              baseUrl: option.value,
                            }))
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {aiSettings.provider === "ollama" ? (
                    <div className="flex flex-wrap gap-2">
                      {OLLAMA_BASE_URL_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAiSettings((current) => ({
                              ...current,
                              baseUrl: option.value,
                            }))
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </FormField>

              <FormField
                label="API Key"
                description="为空时保持为空，不自动覆盖。"
              >
                <Input
                  type="password"
                  value={aiSettings.apiKey}
                  placeholder="sk-..."
                  onChange={(event) =>
                    setAiSettings((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField
                label="Model"
                description="供依赖全局 ai_settings 的 OTools 插件复用。"
              >
                <Input
                  value={aiSettings.model}
                  placeholder="gpt-4.1 / qwen2.5-coder:14b"
                  onChange={(event) =>
                    setAiSettings((current) => ({
                      ...current,
                      model: event.target.value,
                    }))
                  }
                />
              </FormField>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <ConfigPanel title="宿主状态">
            <ConfigRow label="Platform" value={hostInfo?.platform ?? "-"} />
            <ConfigRow label="Data dir" value={hostInfo?.dataDir ?? "-"} />
            <ConfigRow
              label="Plugin roots"
              value={String(hostInfo?.pluginRoots.length ?? 0)}
            />
          </ConfigPanel>

          <ConfigPanel title="兼容说明">
            <p className="text-xs leading-5 text-muted-foreground">
              1. `basic_settings` / `ai_settings` 继续保存在 OTools
              `config.json` 中。
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              2. 保存 `basic_settings` 时，当前窗口会同步主题、主题色和语言。
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              3. `launchAtStartup` 先保留字段，不伪造宿主原生能力。
            </p>
          </ConfigPanel>

          <ConfigPanel title="插件根目录">
            <div className="space-y-2">
              {(hostInfo?.pluginRoots ?? []).map((root) => (
                <div
                  key={root}
                  className="rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground"
                >
                  {root}
                </div>
              ))}
              {!hostInfo?.pluginRoots.length ? (
                <div className="text-xs text-muted-foreground">
                  No plugin roots reported by host.
                </div>
              ) : null}
            </div>
          </ConfigPanel>
        </div>
      </div>
    </div>
  )
}

function FormField({
  children,
  description,
  label,
}: {
  children: React.ReactNode
  description: string
  label: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div>{children}</div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function InfoBanner({
  className,
  icon,
  text,
}: {
  className?: string
  icon: React.ReactNode
  text: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
        className
      )}
    >
      {icon}
      <div>{text}</div>
    </div>
  )
}

function ConfigPanel({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all font-mono">{value}</div>
    </div>
  )
}

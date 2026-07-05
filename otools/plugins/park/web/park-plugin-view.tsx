"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { RefreshCw, Search, Star, Store, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { isLocalDesktop, openFileDialog } from "@/lib/platform"
import { cn } from "@/lib/utils"
import {
  getParkWorkspace,
  installOfflineParkPlugin,
  installParkPlugin,
  uninstallParkPlugin,
} from "@/lib/otools/api"
import type {
  OtoolsPluginInfo,
  ParkCatalogItem,
  ParkWorkspace,
} from "@/lib/otools/types"

type NoticeTone = "success" | "error" | "info"

type NoticeState = {
  tone: NoticeTone
  text: string
} | null

const BUILTIN_ICON_TEXT: Record<string, string> = {
  config: "⚙️",
  dbm: "🗄️",
  dev: "🧩",
  git: "🌿",
  mqtt: "📡",
  park: "🦦",
  photopea: "🖼️",
  term: "⌨️",
}

export function ParkPluginView({
  marketQuery,
  onMarketQueryChange,
  onOpenPlugin,
  onRefresh,
  plugins,
}: {
  marketQuery: string
  onMarketQueryChange: (value: string) => void
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  onRefresh: () => void
  plugin: OtoolsPluginInfo
  plugins: OtoolsPluginInfo[]
}) {
  const [category, setCategory] = useState("hot")
  const [workspace, setWorkspace] = useState<ParkWorkspace | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<ParkCatalogItem | null>(null)

  const loadWorkspace = useCallback(async (categoryKey: string) => {
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    try {
      const nextWorkspace = await getParkWorkspace(categoryKey)
      setWorkspace(nextWorkspace)
      if (!nextWorkspace.categories.some((item) => item.key === categoryKey)) {
        setCategory(nextWorkspace.categories[0]?.key ?? "hot")
      }
      setDetailItem((current) =>
        current
          ? (nextWorkspace.items.find((item) =>
              sameCatalogItem(item, current)
            ) ?? null)
          : null
      )
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err))
      setWorkspace(null)
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace(category)
  }, [category, loadWorkspace])

  const filtered = useMemo(() => {
    const needle = marketQuery.trim().toLowerCase()
    const items = workspace?.items ?? []
    const filteredItems = items.filter((plugin) =>
      [
        plugin.uuid,
        plugin.packid,
        plugin.displayName,
        plugin.displayNameCn,
        plugin.developerName,
        plugin.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
    return filteredItems.sort((left, right) => {
      if (left.installed !== right.installed) {
        return left.installed ? -1 : 1
      }
      return right.rating - left.rating
    })
  }, [workspace?.items, marketQuery])

  const refreshMarket = useCallback(
    async (categoryKey = category) => {
      onRefresh()
      await loadWorkspace(categoryKey)
    },
    [category, loadWorkspace, onRefresh]
  )

  const openDetail = useCallback((item: ParkCatalogItem) => {
    setDetailItem(item)
    setDetailOpen(true)
  }, [])

  const findInstalledPlugin = useCallback(
    (item: ParkCatalogItem) =>
      plugins.find(
        (plugin) => plugin.uuid === item.uuid || plugin.packid === item.packid
      ),
    [plugins]
  )

  const runInstallAction = useCallback(
    async (item: ParkCatalogItem) => {
      const key = item.uuid || item.packid
      const minVersion = item.minOToolsVersion || item.minOtoolsVersion
      const meetsMinVersion =
        item.meetsMinOToolsVersion ?? item.meetsMinOtoolsVersion ?? true
      setActionKey(key)
      try {
        if (!meetsMinVersion) {
          setNotice({
            tone: "error",
            text: `当前宿主版本不满足 ${resolvePluginDisplayName(item)} 的最低要求：${minVersion || "-"}`,
          })
          return
        }
        if (!item.installable) {
          setNotice({
            tone: "info",
            text: `${resolvePluginDisplayName(item)} 当前不可安装。`,
          })
          return
        }
        if (item.installed && !item.updateAvailable) {
          const installed = findInstalledPlugin(item)
          if (installed) {
            onOpenPlugin(installed)
          } else {
            setNotice({
              tone: "info",
              text: "插件已安装，但运行时实例尚未刷新到当前列表。",
            })
          }
          return
        }
        const result = await installParkPlugin(item)
        setNotice({ tone: "success", text: result.message })
        await refreshMarket(category)
      } catch (error) {
        setNotice({
          tone: "error",
          text: formatErrorMessage(error, "安装插件失败"),
        })
      } finally {
        setActionKey(null)
      }
    },
    [category, findInstalledPlugin, onOpenPlugin, refreshMarket]
  )

  const runUninstallAction = useCallback(
    async (item: ParkCatalogItem) => {
      if (!window.confirm(`确认卸载 ${resolvePluginDisplayName(item)} ?`)) {
        return
      }
      const key = item.uuid || item.packid
      setActionKey(key)
      try {
        const result = await uninstallParkPlugin(item)
        if (detailItem && sameCatalogItem(detailItem, item)) {
          setDetailOpen(false)
          setDetailItem(null)
        }
        setNotice({ tone: "success", text: result.message })
        await refreshMarket(category)
      } catch (error) {
        setNotice({
          tone: "error",
          text: formatErrorMessage(error, "卸载插件失败"),
        })
      } finally {
        setActionKey(null)
      }
    },
    [category, detailItem, refreshMarket]
  )

  const handleOfflineInstall = useCallback(async () => {
    let filePath = ""
    if (isLocalDesktop()) {
      const picked = await openFileDialog({
        title: "选择离线插件包",
      })
      filePath = Array.isArray(picked)
        ? String(picked[0] || "")
        : String(picked || "")
    } else {
      filePath = window.prompt("输入服务端离线插件包路径") || ""
    }
    filePath = filePath.trim()
    if (!filePath) return

    setActionKey("offline-install")
    try {
      const result = await installOfflineParkPlugin(filePath)
      setNotice({ tone: "success", text: result.message })
      setCategory("installed")
      await refreshMarket("installed")
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "离线安装失败"),
      })
    } finally {
      setActionKey(null)
    }
  }, [refreshMarket])

  const currentOtoolsVersion =
    workspace?.currentOToolsVersion || workspace?.currentOtoolsVersion || "-"
  const detailInstalledPlugin = detailItem
    ? findInstalledPlugin(detailItem)
    : undefined
  const detailActionKey = detailItem ? detailItem.uuid || detailItem.packid : ""

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">插件市场</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            已迁移 MenuGit Park 的
            workspace、详情抽屉、在线安装、离线安装与卸载链路。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {workspace?.items.length ?? 0} market items
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleOfflineInstall()}
            disabled={actionKey === "offline-install"}
          >
            <Upload className="h-4 w-4" />
            离线安装
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshMarket()}
            disabled={workspaceLoading}
          >
            <RefreshCw
              className={cn("h-4 w-4", workspaceLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {notice ? (
        <NoticeBanner tone={notice.tone}>{notice.text}</NoticeBanner>
      ) : null}

      {workspace?.note ? (
        <div className="mb-4 mt-4 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
          {workspace.note}
        </div>
      ) : null}

      {workspaceError ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {workspaceError}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(workspace?.categories ?? []).map((item) => (
          <Button
            key={item.key}
            variant={item.key === category ? "default" : "outline"}
            size="sm"
            onClick={() => setCategory(item.key)}
          >
            {resolveCategoryLabel(item.label, item.key)}
            {item.count ? (
              <Badge variant="secondary" className="ml-1">
                {item.count}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search plugins"
          value={marketQuery}
          onChange={(event) => onMarketQueryChange(event.target.value)}
        />
      </div>

      {filtered.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => {
            const key = item.uuid || item.packid
            const iconText = resolvePluginIconText(item.icon)
            const installedPlugin = findInstalledPlugin(item)
            const meetsMinVersion =
              item.meetsMinOToolsVersion ?? item.meetsMinOtoolsVersion ?? true
            return (
              <div
                key={key}
                className="min-h-40 cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
                onClick={() => openDetail(item)}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background text-lg">
                    {iconText ? (
                      iconText
                    ) : item.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.icon}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Store className="h-4 w-4" />
                    )}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {item.installed ? (
                      <Badge variant="outline">Installed</Badge>
                    ) : null}
                    {item.official ? (
                      <Badge variant="secondary">Official</Badge>
                    ) : null}
                    {item.updateAvailable ? (
                      <Badge variant="secondary">Update</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="truncate font-medium">
                  {resolvePluginDisplayName(item)}
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.summary || item.packid}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {item.developerName || "OTools"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" />
                    {item.rating || 0}
                  </span>
                </div>
                {!meetsMinVersion ? (
                  <div className="mt-2 text-xs text-destructive">
                    需要 OTools {item.minOToolsVersion || item.minOtoolsVersion}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={actionKey === key}
                    onClick={(event) => {
                      event.stopPropagation()
                      void runInstallAction(item)
                    }}
                  >
                    {resolvePrimaryActionLabel(item, installedPlugin)}
                  </Button>
                  {item.installed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionKey === key}
                      onClick={(event) => {
                        event.stopPropagation()
                        void runUninstallAction(item)
                      }}
                    >
                      卸载
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="没有匹配插件"
          description="换一个关键词，或刷新宿主插件目录。"
        />
      )}

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {detailItem ? resolvePluginDisplayName(detailItem) : "插件详情"}
            </SheetTitle>
            <SheetDescription>
              {detailItem?.packid || "查看插件元数据、截图、评价与安装状态。"}
            </SheetDescription>
          </SheetHeader>

          {detailItem ? (
            <div className="flex-1 overflow-auto px-6 pb-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant={detailItem.official ? "secondary" : "outline"}>
                  {detailItem.official ? "官方插件" : "第三方插件"}
                </Badge>
                <Badge variant="outline">v{detailItem.version || "-"}</Badge>
                {detailItem.installed ? (
                  <Badge variant="outline">已安装</Badge>
                ) : null}
                {detailItem.updateAvailable ? (
                  <Badge variant="secondary">有可用更新</Badge>
                ) : null}
              </div>

              <div className="mt-4 text-sm leading-7 text-foreground">
                {detailItem.summary || "暂无摘要。"}
              </div>

              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <div>作者：{detailItem.developerName || "-"}</div>
                <div>已安装版本：{detailItem.installedVersion || "-"}</div>
                <div>当前 OTools 版本：{currentOtoolsVersion}</div>
                <div>
                  最低 OTools 版本：
                  {detailItem.minOToolsVersion ||
                    detailItem.minOtoolsVersion ||
                    "-"}
                </div>
              </div>

              {!(
                detailItem.meetsMinOToolsVersion ??
                detailItem.meetsMinOtoolsVersion ??
                true
              ) ? (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  当前宿主版本不满足该插件的最低要求。
                </div>
              ) : null}

              <div className="mt-6">
                <div className="text-sm font-medium">系统支持</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <OsSupportPill
                    label="Windows"
                    supported={detailItem.supportWindows}
                  />
                  <OsSupportPill
                    label="macOS"
                    supported={detailItem.supportMacos}
                  />
                  <OsSupportPill
                    label="Linux"
                    supported={detailItem.supportLinux}
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-sm font-medium">截图</div>
                {detailItem.screenshots.length ? (
                  <div className="mt-3 grid gap-3">
                    {detailItem.screenshots.map((shot) => (
                      <div
                        key={shot}
                        className="overflow-hidden rounded-xl border bg-muted/20"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={shot}
                          alt=""
                          className="max-h-80 w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    暂无截图。
                  </div>
                )}
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Star className="h-4 w-4" />
                  评分与评价
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {detailItem.rating || 0} / 5 · {detailItem.ratingCount || 0}{" "}
                  条评价
                </div>
                {detailItem.reviews.length ? (
                  <div className="mt-3 space-y-3">
                    {detailItem.reviews.map((review) => (
                      <div
                        key={`${review.user}-${review.date}-${review.content}`}
                        className="rounded-xl border bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{review.user}</span>
                          <span className="text-muted-foreground">
                            {review.date}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          评分：{review.rating} / 5
                        </div>
                        <div className="mt-2 text-sm text-foreground/90">
                          {review.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    暂无评价。
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <SheetFooter className="border-t">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            {detailItem?.installed ? (
              <Button
                variant="outline"
                disabled={actionKey === detailActionKey}
                onClick={() =>
                  detailItem && void runUninstallAction(detailItem)
                }
              >
                卸载
              </Button>
            ) : null}
            <Button
              disabled={actionKey === detailActionKey}
              onClick={() => detailItem && void runInstallAction(detailItem)}
            >
              {detailItem
                ? resolvePrimaryActionLabel(detailItem, detailInstalledPlugin)
                : "安装"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function NoticeBanner({
  children,
  tone,
}: {
  children: ReactNode
  tone: NoticeTone
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "info" && "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}

function OsSupportPill({
  label,
  supported,
}: {
  label: string
  supported: boolean
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        supported
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/30 text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

function resolveCategoryLabel(label: string, key: string): string {
  switch (String(key).trim().toLowerCase()) {
    case "hot":
      return "热门"
    case "latest":
      return "最新"
    case "featured":
      return "精选"
    case "official":
      return "官方"
    case "installed":
      return "已安装"
    default:
      return label
  }
}

function resolvePluginDisplayName(item: ParkCatalogItem): string {
  return item.displayNameCn || item.displayName || item.packid
}

function resolvePrimaryActionLabel(
  item: ParkCatalogItem,
  installedPlugin: OtoolsPluginInfo | undefined
): string {
  if (item.installed && installedPlugin && !item.updateAvailable) {
    return "打开"
  }
  if (item.updateAvailable) {
    return "更新"
  }
  return item.installed ? "重装" : "安装"
}

function sameCatalogItem(
  left: ParkCatalogItem,
  right: ParkCatalogItem
): boolean {
  return Boolean(
    (left.uuid && right.uuid && left.uuid === right.uuid) ||
    (left.packid && right.packid && left.packid === right.packid)
  )
}

function formatErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : String(error)
  return text?.trim() ? text : fallback
}

function EmptyState({
  description,
  icon,
  title,
}: {
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center p-6 text-center text-muted-foreground">
      <div className="mb-3 rounded-full border bg-card p-4">{icon}</div>
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 max-w-md text-sm">{description}</div>
    </div>
  )
}

function isShortTextIcon(value: string | null | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  if (text.startsWith("@builtin:")) return false
  if (/^(data|https?|file):/i.test(text)) return false
  return Array.from(text).length <= 4
}

function resolvePluginIconText(value: string | null | undefined): string {
  const text = value?.trim()
  if (!text) return ""
  if (text.startsWith("@builtin:")) {
    const name = text.slice("@builtin:".length).trim().toLowerCase()
    return BUILTIN_ICON_TEXT[name] || "🧰"
  }
  return isShortTextIcon(text) ? text : ""
}

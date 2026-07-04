"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { RefreshCw, Search, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  getParkWorkspace,
  installParkPlugin,
  uninstallParkPlugin,
} from "@/lib/otools/api"
import type {
  OtoolsPluginInfo,
  ParkCatalogItem,
  ParkWorkspace,
} from "@/lib/otools/types"

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

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    try {
      setWorkspace(await getParkWorkspace(category))
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorkspaceLoading(false)
    }
  }, [category])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const filtered = useMemo(() => {
    const needle = marketQuery.trim().toLowerCase()
    const items = workspace?.items ?? []
    if (!needle) return items
    return items.filter((plugin) =>
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
  }, [workspace?.items, marketQuery])

  const refreshMarket = useCallback(() => {
    onRefresh()
    void loadWorkspace()
  }, [loadWorkspace, onRefresh])

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
      setActionKey(key)
      try {
        if (item.installed && !item.updateAvailable) {
          const installed = findInstalledPlugin(item)
          if (installed) onOpenPlugin(installed)
          return
        }
        await installParkPlugin(item)
        refreshMarket()
      } finally {
        setActionKey(null)
      }
    },
    [findInstalledPlugin, onOpenPlugin, refreshMarket]
  )

  const runUninstallAction = useCallback(
    async (item: ParkCatalogItem) => {
      const key = item.uuid || item.packid
      setActionKey(key)
      try {
        await uninstallParkPlugin(item)
        refreshMarket()
      } finally {
        setActionKey(null)
      }
    },
    [refreshMarket]
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">插件市场</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            已迁移 MenuGit Park 的 workspace/install/offline/uninstall
            宿主命令。远程不可用时回退到本地目录。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {workspace?.items.length ?? 0} market items
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshMarket}
            disabled={workspaceLoading}
          >
            <RefreshCw
              className={cn("h-4 w-4", workspaceLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      {workspace?.note ? (
        <div className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
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
            {item.label}
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
            const installedPlugin = findInstalledPlugin(item)
            return (
              <div
                key={key}
                className="min-h-40 rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background text-lg">
                    {isShortTextIcon(item.icon) ? (
                      item.icon
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
                  </div>
                </div>
                <div className="truncate font-medium">
                  {item.displayNameCn || item.displayName || item.packid}
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.summary || item.packid}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {item.developerName || "OTools"}
                  </span>
                  <span>{item.version || "-"}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={actionKey === key}
                    onClick={() => void runInstallAction(item)}
                  >
                    {item.installed && installedPlugin
                      ? "打开"
                      : item.updateAvailable
                        ? "更新"
                        : "安装"}
                  </Button>
                  {item.installed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionKey === key}
                      onClick={() => void runUninstallAction(item)}
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
    </div>
  )
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
  if (/^(data|https?|file):/i.test(text)) return false
  return Array.from(text).length <= 4
}

"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Box,
  Boxes,
  Code2,
  ExternalLink,
  Home,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getServerBaseUrl } from "@/lib/transport"
import { cn } from "@/lib/utils"
import {
  buildOtoolsPluginUrl,
  getDevWorkspace,
  getOtoolsHostInfo,
  getParkWorkspace,
  installParkPlugin,
  listOtoolsPlugins,
  uninstallParkPlugin,
} from "@/lib/otools/api"
import type {
  DevWorkspace,
  OtoolsHostInfo,
  OtoolsPluginInfo,
  ParkCatalogItem,
  ParkWorkspace,
} from "@/lib/otools/types"
import { OtoolsPluginFrame } from "./otools-plugin-frame"

type ShellView = { kind: "home" } | { kind: "plugin"; pluginId: string }

const HOME_VIEW: ShellView = { kind: "home" }

export function OtoolsShell() {
  const [plugins, setPlugins] = useState<OtoolsPluginInfo[]>([])
  const [hostInfo, setHostInfo] = useState<OtoolsHostInfo | null>(null)
  const [view, setView] = useState<ShellView>(HOME_VIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marketQuery, setMarketQuery] = useState("")

  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, info] = await Promise.all([
        listOtoolsPlugins(),
        getOtoolsHostInfo(),
      ])
      setPlugins(list)
      setHostInfo(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlugins()
  }, [loadPlugins])

  const activePlugin = useMemo(() => {
    if (view.kind !== "plugin") return null
    return plugins.find((plugin) => plugin.uuid === view.pluginId) ?? null
  }, [plugins, view])
  const developerPlugin = useMemo(
    () => plugins.find((plugin) => plugin.entry === "builtin://dev") ?? null,
    [plugins]
  )
  const marketPlugin = useMemo(
    () => plugins.find((plugin) => plugin.entry === "builtin://park") ?? null,
    [plugins]
  )

  const nativeCount = useMemo(
    () => plugins.filter((plugin) => plugin.nativeEnabled).length,
    [plugins]
  )
  const devCount = useMemo(
    () =>
      plugins.filter((plugin) =>
        String(plugin.source || "")
          .toLowerCase()
          .includes("dev")
      ).length,
    [plugins]
  )

  const openPlugin = useCallback((plugin: OtoolsPluginInfo) => {
    setView({ kind: "plugin", pluginId: plugin.uuid })
  }, [])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/25">
        <div className="flex h-11 items-center justify-between border-b px-3">
          <div className="text-sm font-medium">OTools</div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void loadPlugins()}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="space-y-1">
            <ShellNavButton
              active={view.kind === "home"}
              icon={<Home className="h-4 w-4" />}
              label="首页"
              onClick={() => setView(HOME_VIEW)}
            />
          </div>

          <div className="my-3 h-px bg-border" />

          {error ? (
            <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && plugins.length === 0 ? (
            <div className="mb-2 rounded-md border bg-card p-3 text-sm text-muted-foreground">
              No OTools plugins found. Set CODEG_OTOOLS_PLUGIN_DIR or copy
              plugins into the codeg data directory.
            </div>
          ) : null}

          <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Installed
          </div>
          <div className="space-y-1">
            {plugins.map((plugin) => (
              <button
                key={plugin.uuid}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  view.kind === "plugin" &&
                    view.pluginId === plugin.uuid &&
                    "bg-accent text-accent-foreground"
                )}
                onClick={() => openPlugin(plugin)}
              >
                <PluginIcon plugin={plugin} className="h-7 w-7" />
                <span className="min-w-0 flex-1 truncate">
                  {displayName(plugin)}
                </span>
                {plugin.nativeEnabled ? (
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    N
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {view.kind === "home" ? (
          <OtoolsHomeView
            devCount={devCount}
            loading={loading}
            nativeCount={nativeCount}
            onOpenDeveloper={() =>
              developerPlugin && openPlugin(developerPlugin)
            }
            onOpenMarket={() => marketPlugin && openPlugin(marketPlugin)}
            onOpenPlugin={openPlugin}
            plugins={plugins}
          />
        ) : null}

        {view.kind === "plugin" ? (
          activePlugin ? (
            <OtoolsPluginView
              hostInfo={hostInfo}
              loading={loading}
              marketQuery={marketQuery}
              onMarketQueryChange={setMarketQuery}
              onOpenPlugin={openPlugin}
              onRefresh={() => void loadPlugins()}
              plugin={activePlugin}
              plugins={plugins}
            />
          ) : (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="Plugin unavailable"
              description="The selected plugin is no longer in the host catalog."
            />
          )
        ) : null}
      </section>
    </div>
  )
}

function ShellNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
        active && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function OtoolsHomeView({
  devCount,
  loading,
  nativeCount,
  onOpenDeveloper,
  onOpenMarket,
  onOpenPlugin,
  plugins,
}: {
  devCount: number
  loading: boolean
  nativeCount: number
  onOpenDeveloper: () => void
  onOpenMarket: () => void
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  plugins: OtoolsPluginInfo[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              <Badge variant="secondary">codeg-plus host</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              OTools 首页
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              运行 MenuGit OTools 插件的兼容宿主。插件在隔离 iframe
              中加载，原生能力通过独立 runtime 和 codeg 双 transport 转发。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MetricCard label="插件" value={plugins.length} />
            <MetricCard label="Native" value={nativeCount} />
            <MetricCard label="Dev" value={devCount} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
          onClick={onOpenDeveloper}
        >
          <Code2 className="mb-3 h-5 w-5 text-primary" />
          <div className="font-medium">开发者工具</div>
          <div className="mt-1 text-sm text-muted-foreground">
            查看宿主路径、插件诊断、native/transport 兼容状态。
          </div>
        </button>
        <button
          type="button"
          className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
          onClick={onOpenMarket}
        >
          <Store className="mb-3 h-5 w-5 text-primary" />
          <div className="font-medium">插件市场</div>
          <div className="mt-1 text-sm text-muted-foreground">
            浏览当前宿主可识别的市场/本地插件目录，后续接安装源。
          </div>
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">已安装插件</h2>
        {loading ? <Badge variant="outline">Loading</Badge> : null}
      </div>
      {plugins.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.uuid}
              actionLabel="打开"
              onClick={() => onOpenPlugin(plugin)}
              plugin={plugin}
            />
          ))}
          <button
            type="button"
            className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground hover:bg-accent"
            onClick={onOpenMarket}
          >
            <Store className="mb-2 h-6 w-6" />
            打开插件市场
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="暂无插件"
          description="将插件放入 OTools 插件目录，或配置 CODEG_OTOOLS_PLUGIN_DIR。"
        />
      )}
    </div>
  )
}

function OtoolsDeveloperView({
  hostInfo,
  loading,
  onRefresh,
  plugins,
}: {
  hostInfo: OtoolsHostInfo | null
  loading: boolean
  onRefresh: () => void
  plugins: OtoolsPluginInfo[]
}) {
  const [workspace, setWorkspace] = useState<DevWorkspace | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const nativePlugins = plugins.filter((plugin) => plugin.nativeEnabled)
  const devPlugins = workspace?.items ?? []

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    try {
      setWorkspace(await getDevWorkspace())
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const refresh = useCallback(() => {
    onRefresh()
    void loadWorkspace()
  }, [loadWorkspace, onRefresh])

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">开发者工具</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用于确认 OTools 宿主路径、插件发现结果、native 隔离和双 transport
            状态。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refresh}
          disabled={loading || workspaceLoading}
        >
          <RefreshCw
            className={cn(
              "h-4 w-4",
              (loading || workspaceLoading) && "animate-spin"
            )}
          />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <InfoPanel title="Host" icon={<ShieldCheck className="h-4 w-4" />}>
          <InfoRow label="Platform" value={hostInfo?.platform ?? "-"} />
          <InfoRow label="Plugins" value={String(hostInfo?.pluginCount ?? 0)} />
          <InfoRow label="Data dir" value={hostInfo?.dataDir ?? "-"} />
        </InfoPanel>

        <InfoPanel title="Runtime" icon={<Code2 className="h-4 w-4" />}>
          <InfoRow label="Plugin iframe" value="isolated srcDoc" />
          <InfoRow label="Native bridge" value="dedicated runtime" />
          <InfoRow label="Transport" value="Tauri + HTTP/WS" />
        </InfoPanel>

        <InfoPanel title="Catalog" icon={<Package className="h-4 w-4" />}>
          <InfoRow
            label="Native plugins"
            value={String(nativePlugins.length)}
          />
          <InfoRow label="Dev records" value={String(devPlugins.length)} />
          <InfoRow label="Packs dir" value={workspace?.packsDir ?? "-"} />
        </InfoPanel>
      </div>

      {workspaceError ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {workspaceError}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium">Workspace files</div>
        <div className="space-y-2">
          {[
            workspace?.metaStateFilePath,
            workspace?.bindingStateFilePath,
            workspace?.packsDir,
            ...(hostInfo?.pluginRoots ?? []),
          ]
            .filter(Boolean)
            .map((root) => (
              <div
                key={root}
                className="rounded-md bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
              >
                {root}
              </div>
            ))}
          {!workspace && !hostInfo?.pluginRoots.length ? (
            <div className="text-sm text-muted-foreground">
              No host info loaded.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Dev workspace
        </div>
        <div className="divide-y">
          {devPlugins.map((plugin) => (
            <div
              key={plugin.uuid}
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_auto]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {plugin.displayNameCn || plugin.displayName || plugin.packid}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {plugin.uuid}
                </div>
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                <div className="truncate">
                  {plugin.directoryBound
                    ? plugin.boundDirectoryPath
                    : "未绑定开发目录"}
                </div>
                <div className="truncate">{plugin.devUrl}</div>
              </div>
              <div className="flex items-center gap-2">
                {plugin.debugEnabled ? (
                  <Badge variant="outline">Debug</Badge>
                ) : null}
                <Badge variant="secondary">{plugin.version || "0.0.0"}</Badge>
              </div>
            </div>
          ))}
          {!devPlugins.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              暂无开发插件。已迁移 `dev_get_workspace`
              等原始命令，创建入口后会写入 OTools dev state。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function OtoolsMarketView({
  onOpenPlugin,
  onRefresh,
  plugins,
  query,
  setQuery,
}: {
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  onRefresh: () => void
  plugins: OtoolsPluginInfo[]
  query: string
  setQuery: (value: string) => void
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
    const needle = query.trim().toLowerCase()
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
  }, [workspace?.items, query])

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
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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

function OtoolsPluginView({
  hostInfo,
  loading,
  marketQuery,
  onMarketQueryChange,
  onOpenPlugin,
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
  const builtin = plugin.entry.trim().toLowerCase()

  if (builtin === "builtin://dev") {
    return (
      <OtoolsDeveloperView
        hostInfo={hostInfo}
        loading={loading}
        onRefresh={onRefresh}
        plugins={plugins}
      />
    )
  }

  if (builtin === "builtin://park") {
    return (
      <OtoolsMarketView
        onOpenPlugin={onOpenPlugin}
        onRefresh={onRefresh}
        plugins={plugins}
        query={marketQuery}
        setQuery={onMarketQueryChange}
      />
    )
  }

  return (
    <>
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {displayName(plugin)}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {plugin.summary || plugin.packid}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(buildOtoolsPluginUrl(plugin), "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Button>
      </div>
      <OtoolsPluginFrame plugin={plugin} />
    </>
  )
}

function PluginCard({
  actionLabel,
  onClick,
  plugin,
}: {
  actionLabel: string
  onClick: () => void
  plugin: OtoolsPluginInfo
}) {
  return (
    <button
      type="button"
      className="min-h-36 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:bg-accent"
      onClick={onClick}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <PluginIcon plugin={plugin} className="h-10 w-10" />
        <div className="flex flex-wrap justify-end gap-1">
          {plugin.nativeEnabled ? (
            <Badge variant="outline">Native</Badge>
          ) : null}
          <Badge variant="secondary">{actionLabel}</Badge>
        </div>
      </div>
      <div className="truncate font-medium">{displayName(plugin)}</div>
      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
        {plugin.summary || plugin.packid}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        <span className="truncate">
          {plugin.developerName || plugin.source || "local"}
        </span>
      </div>
    </button>
  )
}

function PluginIcon({
  className,
  plugin,
}: {
  className?: string
  plugin: OtoolsPluginInfo
}) {
  const iconUrl = resolvePluginIconUrl(plugin)
  const iconText = isShortTextIcon(plugin.icon) ? plugin.icon?.trim() : ""
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background text-lg text-muted-foreground",
        className
      )}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="h-full w-full object-cover" />
      ) : iconText ? (
        iconText
      ) : (
        <Box className="h-4 w-4" />
      )}
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-xl border bg-background/60 px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function InfoPanel({
  children,
  icon,
  title,
}: {
  children: ReactNode
  icon: ReactNode
  title: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate font-mono">{value}</div>
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

function displayName(plugin: OtoolsPluginInfo): string {
  return plugin.displayNameCn || plugin.displayName || plugin.uuid
}

function resolvePluginIconUrl(plugin: OtoolsPluginInfo): string | null {
  const icon = plugin.icon?.trim()
  if (!icon) return null
  if (isShortTextIcon(icon)) return null
  if (/^(data|https?):/i.test(icon)) return icon
  if (!plugin.assetBaseUrl) return null
  const base = getServerBaseUrl().replace(/\/+$/, "")
  return `${base}${plugin.assetBaseUrl.replace(/\/+$/, "")}/${icon.replace(/^\/+/, "")}`
}

function isShortTextIcon(value: string | null | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  if (/^(data|https?|file):/i.test(text)) return false
  return Array.from(text).length <= 4
}

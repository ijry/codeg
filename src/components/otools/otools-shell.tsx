"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import {
  Box,
  Boxes,
  ChevronLeft,
  Code2,
  ExternalLink,
  Home,
  Package,
  RefreshCw,
  Store,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { openUrl } from "@/lib/platform"
import {
  getServerBaseUrl,
  getShellTransport,
  isDesktop,
  isRemoteDesktopMode,
} from "@/lib/transport"
import {
  OTOOLS_HOST_CLOSE_TAB_EVENT,
  OTOOLS_HOST_CREATE_TAB_EVENT,
  OTOOLS_HOST_NOTIFICATION_EVENT,
  OTOOLS_HOST_RELOAD_PLUGINS_EVENT,
  OTOOLS_HOST_SHELL_SHORTCUT_EVENT,
  OTOOLS_HOST_STATUS_BAR_EVENT,
  OTOOLS_HOST_SWITCH_TAB_EVENT,
  type OtoolsHostCloseTabDetail,
  type OtoolsHostCreateTabDetail,
  type OtoolsHostNotificationDetail,
  type OtoolsHostShellShortcutAction,
  type OtoolsHostShellShortcutDetail,
  type OtoolsHostStatusBarDetail,
  type OtoolsHostSwitchTabDetail,
  type OtoolsHostWindowState,
} from "@/lib/otools/host-events"
import { cn } from "@/lib/utils"
import {
  getBuiltinHomeTargets,
  renderBuiltinPluginView,
} from "../../../otools/plugins/web-registry"
import {
  buildOtoolsPluginUrl,
  buildOtoolsRuntimeUrl,
  getOtoolsHostInfo,
  listOtoolsPlugins,
} from "@/lib/otools/api"
import { useOtoolsChildWebviewSync } from "@/lib/otools/child-webview-sync"
import {
  clearPendingOtoolsGlobalShortcut,
  hasHandledOtoolsGlobalShortcut,
  markHandledOtoolsGlobalShortcut,
  OTOOLS_GLOBAL_SHORTCUT_EVENT,
  readPendingOtoolsGlobalShortcut,
  type OtoolsGlobalShortcutTriggeredPayload,
} from "@/lib/otools/shortcut-events"
import type { OtoolsHostInfo, OtoolsPluginInfo } from "@/lib/otools/types"

const OTOOLS_TOOLS_SHELL_SHORTCUT_EVENT = "otools-tools-shell-shortcut"
const OTOOLS_PLUGINS_RELOADED_EVENT = "otools-plugins-reloaded"
const OTOOLS_NOTIFICATION_TRANSPORT_EVENT = "otools-notification"
const OTOOLS_STATUS_BAR_TRANSPORT_EVENT = "otools-status-bar"
const OTOOLS_REQUEST_APP_EXIT_EVENT = "otools-request-app-exit"
const OTOOLS_SHOW_MAIN_WINDOW_EVENT = "otools-show-main-window"
import { OtoolsPluginFrame } from "./otools-plugin-frame"

type HomeTab = {
  id: "home"
  kind: "home"
  title: string
}

type PluginTab = {
  id: string
  kind: "plugin"
  title: string
  pluginId: string
  windowLabel: string
}

type ExternalTab = {
  id: string
  kind: "external"
  title: string
  url: string
  windowLabel: string
  pluginId?: string | null
}

type ShellTab = HomeTab | PluginTab | ExternalTab

const HOME_TAB: HomeTab = {
  id: "home",
  kind: "home",
  title: "首页",
}

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

function buildPluginWindowLabel(plugin: OtoolsPluginInfo): string {
  return `tools-tab-plugin-${plugin.uuid}`
}

function buildPluginTab(
  plugin: OtoolsPluginInfo,
  options?: {
    title?: string | null
    windowLabel?: string | null
  }
): PluginTab {
  return {
    id: `plugin:${plugin.uuid}`,
    kind: "plugin",
    title: String(options?.title || "").trim() || displayName(plugin),
    pluginId: plugin.uuid,
    windowLabel:
      String(options?.windowLabel || "").trim() ||
      buildPluginWindowLabel(plugin),
  }
}

export function OtoolsShell() {
  const [plugins, setPlugins] = useState<OtoolsPluginInfo[]>([])
  const [hostInfo, setHostInfo] = useState<OtoolsHostInfo | null>(null)
  const [tabs, setTabs] = useState<ShellTab[]>([HOME_TAB])
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB.id)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marketQuery, setMarketQuery] = useState("")
  const [statusBarState, setStatusBarState] =
    useState<OtoolsHostStatusBarDetail | null>(null)

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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? HOME_TAB,
    [activeTabId, tabs]
  )
  const activePlugin = useMemo(() => {
    if (activeTab.kind !== "plugin") return null
    return plugins.find((plugin) => plugin.uuid === activeTab.pluginId) ?? null
  }, [activeTab, plugins])
  const activeSidebarPluginId =
    activeTab.kind === "plugin"
      ? activeTab.pluginId
      : activeTab.kind === "external"
        ? (activeTab.pluginId ?? null)
        : null

  const builtinHomeTargets = useMemo(
    () => getBuiltinHomeTargets(plugins),
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
  const statusBarLabel = useMemo(() => {
    const title = String(statusBarState?.title || "").trim()
    const tooltip = String(statusBarState?.tooltip || "").trim()
    return title || tooltip
  }, [statusBarState])

  useEffect(() => {
    const handleReload = () => {
      void loadPlugins()
    }

    window.addEventListener(OTOOLS_HOST_RELOAD_PLUGINS_EVENT, handleReload)
    return () =>
      window.removeEventListener(OTOOLS_HOST_RELOAD_PLUGINS_EVENT, handleReload)
  }, [loadPlugins])

  useEffect(() => {
    const handleStatusBar = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostStatusBarDetail>).detail
      const title = String(detail?.title || "").trim()
      const tooltip = String(detail?.tooltip || "").trim()
      if (detail?.visible === false || (!title && !tooltip)) {
        setStatusBarState(null)
        return
      }
      setStatusBarState({
        pluginUuid: String(detail?.pluginUuid || "").trim() || null,
        title: title || null,
        tooltip: tooltip || null,
        visible: true,
      })
    }

    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostNotificationDetail>).detail
      const title = String(detail?.title || "").trim() || "OTools"
      const body = String(detail?.body || "").trim()
      if (body) {
        toast(title, { description: body })
        return
      }
      toast(title)
    }

    window.addEventListener(OTOOLS_HOST_STATUS_BAR_EVENT, handleStatusBar)
    window.addEventListener(
      OTOOLS_HOST_NOTIFICATION_EVENT,
      handleNotification
    )
    return () => {
      window.removeEventListener(
        OTOOLS_HOST_STATUS_BAR_EVENT,
        handleStatusBar
      )
      window.removeEventListener(
        OTOOLS_HOST_NOTIFICATION_EVENT,
        handleNotification
      )
    }
  }, [])

  useEffect(() => {
    const state: OtoolsHostWindowState = {
      tabLabels: tabs
        .filter((tab): tab is PluginTab | ExternalTab => tab.kind !== "home")
        .map((tab) => tab.windowLabel),
      activeLabel: activeTab.kind === "home" ? null : activeTab.windowLabel,
    }

    ;(
      window as Window & {
        __CODEG_OTOOLS_HOST_STATE__?: OtoolsHostWindowState
      }
    ).__CODEG_OTOOLS_HOST_STATE__ = state
  }, [activeTab, tabs])

  const closeTab = useCallback((tabId: string) => {
    setTabs((currentTabs) => {
      const targetIndex = currentTabs.findIndex((tab) => tab.id === tabId)
      if (targetIndex <= 0) {
        return currentTabs
      }

      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId)
      const fallback =
        nextTabs[targetIndex - 1] ?? nextTabs[targetIndex] ?? HOME_TAB
      setActiveTabId((currentActive) =>
        currentActive === tabId ? fallback.id : currentActive
      )
      return nextTabs.length ? nextTabs : [HOME_TAB]
    })
  }, [])

  const closeActiveTab = useCallback(() => {
    if (activeTabId === HOME_TAB.id) {
      return
    }
    closeTab(activeTabId)
  }, [activeTabId, closeTab])

  const activateRelativeTab = useCallback(
    (direction: "prev" | "next") => {
      if (tabs.length <= 1) {
        return
      }

      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
      if (currentIndex < 0) {
        setActiveTabId(HOME_TAB.id)
        return
      }

      const delta = direction === "prev" ? -1 : 1
      const nextIndex = (currentIndex + delta + tabs.length) % tabs.length
      setActiveTabId(tabs[nextIndex]?.id ?? HOME_TAB.id)
    },
    [activeTabId, tabs]
  )

  const runShellShortcutAction = useCallback(
    (action: OtoolsHostShellShortcutAction) => {
      if (action === "closeActiveTab") {
        closeActiveTab()
        return
      }
      if (action === "activatePrevTab") {
        activateRelativeTab("prev")
        return
      }
      if (action === "activateNextTab") {
        activateRelativeTab("next")
      }
    },
    [activateRelativeTab, closeActiveTab]
  )

  const openPlugin = useCallback((plugin: OtoolsPluginInfo) => {
    if (plugin.openInBrowser) {
      void openUrl(buildPluginBrowserOpenUrl(plugin)).catch((err) => {
        console.error("[otools] failed to open plugin in browser", err)
        setError(err instanceof Error ? err.message : String(err))
      })
      return
    }

    const nextTab = buildPluginTab(plugin)
    setTabs((currentTabs) => {
      const existingIndex = currentTabs.findIndex(
        (tab) => tab.kind !== "home" && tab.windowLabel === nextTab.windowLabel
      )
      if (existingIndex >= 0) {
        const nextTabs = [...currentTabs]
        nextTabs[existingIndex] = nextTab
        return nextTabs
      }
      return [...currentTabs, nextTab]
    })
    setActiveTabId(nextTab.id)
  }, [])

  const handleGlobalShortcut = useCallback(
    (payload: OtoolsGlobalShortcutTriggeredPayload | null): boolean => {
      if (!payload) {
        return false
      }

      if (hasHandledOtoolsGlobalShortcut(payload)) {
        clearPendingOtoolsGlobalShortcut()
        return true
      }

      const plugin =
        plugins.find(
          (item) =>
            item.uuid === payload.pluginUuid ||
            item.packid === payload.pluginUuid
        ) ?? null

      if (!plugin) {
        return false
      }

      openPlugin(plugin)
      markHandledOtoolsGlobalShortcut(payload)
      clearPendingOtoolsGlobalShortcut()
      return true
    },
    [openPlugin, plugins]
  )

  const openHostManagedTab = useCallback(
    (detail: OtoolsHostCreateTabDetail) => {
      const label = String(detail.label || "").trim()
      if (!label) return

      const pluginUuid = String(detail.pluginUuid || "").trim()
      const plugin =
        plugins.find(
          (item) => item.uuid === pluginUuid || item.packid === pluginUuid
        ) ?? null

      if (plugin?.openInBrowser) {
        const sourceUrl = String(detail.url || "").trim()
        void openUrl(
          buildPluginBrowserOpenUrl(plugin, sourceUrl || undefined)
        ).catch((err) => {
          console.error(
            "[otools] failed to open host-managed plugin in browser",
            err
          )
          setError(err instanceof Error ? err.message : String(err))
        })
        return
      }

      const nextTab: ShellTab | null = plugin
        ? buildPluginTab(plugin, {
            title: detail.title,
            windowLabel: label,
          })
        : String(detail.url || "").trim()
          ? {
              id: `external:${label}`,
              kind: "external",
              title: String(detail.title || "").trim() || label,
              url: String(detail.url || "").trim(),
              windowLabel: label,
              pluginId: pluginUuid || null,
            }
          : null

      if (!nextTab) return

      setTabs((currentTabs) => {
        const existingIndex = currentTabs.findIndex(
          (tab) => tab.kind !== "home" && tab.windowLabel === label
        )
        if (existingIndex >= 0) {
          const nextTabs = [...currentTabs]
          nextTabs[existingIndex] = nextTab
          return nextTabs
        }
        return [...currentTabs, nextTab]
      })
      setActiveTabId(nextTab.id)
    },
    [plugins]
  )

  useEffect(() => {
    const handleCreate = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostCreateTabDetail>).detail
      if (detail) {
        openHostManagedTab(detail)
      }
    }

    const handleClose = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostCloseTabDetail>).detail
      const label = String(detail?.label || "").trim()
      if (!label) return
      const target = tabs.find(
        (tab) => tab.kind !== "home" && tab.windowLabel === label
      )
      if (target) {
        closeTab(target.id)
      }
    }

    const handleSwitch = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostSwitchTabDetail>).detail
      const activeLabel = String(detail?.activeLabel || "").trim()
      if (!activeLabel) {
        setActiveTabId(HOME_TAB.id)
        return
      }
      const target = tabs.find(
        (tab) => tab.kind !== "home" && tab.windowLabel === activeLabel
      )
      if (target) {
        setActiveTabId(target.id)
      }
    }

    const handleShellShortcut = (event: Event) => {
      const detail = (event as CustomEvent<OtoolsHostShellShortcutDetail>)
        .detail
      if (!detail?.action) {
        return
      }
      runShellShortcutAction(detail.action)
    }

    window.addEventListener(OTOOLS_HOST_CREATE_TAB_EVENT, handleCreate)
    window.addEventListener(OTOOLS_HOST_CLOSE_TAB_EVENT, handleClose)
    window.addEventListener(OTOOLS_HOST_SWITCH_TAB_EVENT, handleSwitch)
    window.addEventListener(
      OTOOLS_HOST_SHELL_SHORTCUT_EVENT,
      handleShellShortcut
    )
    return () => {
      window.removeEventListener(OTOOLS_HOST_CREATE_TAB_EVENT, handleCreate)
      window.removeEventListener(OTOOLS_HOST_CLOSE_TAB_EVENT, handleClose)
      window.removeEventListener(OTOOLS_HOST_SWITCH_TAB_EVENT, handleSwitch)
      window.removeEventListener(
        OTOOLS_HOST_SHELL_SHORTCUT_EVENT,
        handleShellShortcut
      )
    }
  }, [closeTab, openHostManagedTab, runShellShortcutAction, tabs])

  useEffect(() => {
    handleGlobalShortcut(readPendingOtoolsGlobalShortcut())
  }, [handleGlobalShortcut, plugins])

  useEffect(() => {
    if (!isDesktop()) {
      return
    }

    let dispose: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const off = await getShellTransport().subscribe<unknown>(
          OTOOLS_GLOBAL_SHORTCUT_EVENT,
          (payload) => {
            if (
              !handleGlobalShortcut(
                payload as OtoolsGlobalShortcutTriggeredPayload
              )
            ) {
              return
            }
          }
        )

        if (cancelled) {
          off()
        } else {
          dispose = off
        }
      } catch (error) {
        console.warn("[otools-shortcut] shell subscribe failed:", error)
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [handleGlobalShortcut])

  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false

    const normalizeAction = (
      payload: unknown
    ): OtoolsHostShellShortcutAction | null => {
      if (typeof payload === "string") {
        const action = payload.trim()
        if (
          action === "closeActiveTab" ||
          action === "activatePrevTab" ||
          action === "activateNextTab"
        ) {
          return action
        }
        return null
      }
      if (!payload || typeof payload !== "object") {
        return null
      }
      const action = String(
        (payload as { action?: unknown }).action || ""
      ).trim()
      if (
        action === "closeActiveTab" ||
        action === "activatePrevTab" ||
        action === "activateNextTab"
      ) {
        return action
      }
      return null
    }

    void (async () => {
      try {
        const off = await getShellTransport().subscribe<unknown>(
          OTOOLS_TOOLS_SHELL_SHORTCUT_EVENT,
          (payload) => {
            const action = normalizeAction(payload)
            if (!action) {
              return
            }
            runShellShortcutAction(action)
          }
        )

        if (cancelled) {
          off()
        } else {
          dispose = off
        }
      } catch (error) {
        console.warn(
          "[otools-shortcut] tools shell shortcut subscribe failed:",
          error
        )
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [runShellShortcutAction])

  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const unsubscribers = await Promise.all([
          getShellTransport().subscribe(OTOOLS_PLUGINS_RELOADED_EVENT, () => {
            void loadPlugins()
          }),
          getShellTransport().subscribe(
            OTOOLS_NOTIFICATION_TRANSPORT_EVENT,
            (payload) => {
              const detail = (payload || {}) as OtoolsHostNotificationDetail
              window.dispatchEvent(
                new CustomEvent(OTOOLS_HOST_NOTIFICATION_EVENT, { detail })
              )
            }
          ),
          getShellTransport().subscribe(
            OTOOLS_STATUS_BAR_TRANSPORT_EVENT,
            (payload) => {
              const detail = (payload || {}) as OtoolsHostStatusBarDetail
              window.dispatchEvent(
                new CustomEvent(OTOOLS_HOST_STATUS_BAR_EVENT, { detail })
              )
            }
          ),
          getShellTransport().subscribe(OTOOLS_REQUEST_APP_EXIT_EVENT, () => {
            try {
              window.close()
            } catch {}
          }),
          getShellTransport().subscribe(OTOOLS_SHOW_MAIN_WINDOW_EVENT, () => {
            try {
              window.opener?.focus()
            } catch {}
            window.focus()
          }),
        ])

        if (cancelled) {
          unsubscribers.forEach((off) => off())
        } else {
          dispose = () => {
            unsubscribers.forEach((off) => off())
          }
        }
      } catch (error) {
        console.warn("[otools-host] transport subscribe failed:", error)
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [loadPlugins])

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
              active={activeTab.kind === "home"}
              icon={<Home className="h-4 w-4" />}
              label="首页"
              onClick={() => setActiveTabId(HOME_TAB.id)}
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
              No OTools plugins found. Set `CODEG_OTOOLS_PLUGIN_DIR` or copy
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
                  activeSidebarPluginId === plugin.uuid &&
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
        <div className="flex h-11 items-center gap-2 border-b px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setActiveTabId(HOME_TAB.id)}
            title="Back to home"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-auto">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const closable = tab.kind !== "home"
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "flex max-w-72 shrink-0 items-center gap-1 rounded-md border bg-background px-1",
                    active && "bg-accent text-accent-foreground"
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm"
                    onClick={() => setActiveTabId(tab.id)}
                    title={tab.title}
                  >
                    <span className="truncate">{tab.title}</span>
                  </button>
                  {tab.kind === "external" ? (
                    <ExternalLink className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  {closable ? (
                    <button
                      type="button"
                      className="mr-1 shrink-0 rounded-sm p-1 hover:bg-background/60"
                      onClick={() => closeTab(tab.id)}
                      aria-label={`Close ${tab.title}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
          {statusBarLabel ? (
            <Badge
              variant="secondary"
              className="max-w-72 shrink-0 truncate px-2 py-1 text-[11px]"
              title={statusBarState?.tooltip || statusBarLabel}
            >
              {statusBarLabel}
            </Badge>
          ) : null}
        </div>

        {activeTab.kind === "home" ? (
          <OtoolsHomeView
            devCount={devCount}
            loading={loading}
            nativeCount={nativeCount}
            onOpenDeveloper={() =>
              builtinHomeTargets.dev && openPlugin(builtinHomeTargets.dev)
            }
            onOpenMarket={() =>
              builtinHomeTargets.park && openPlugin(builtinHomeTargets.park)
            }
            onOpenPlugin={openPlugin}
            plugins={plugins}
          />
        ) : null}

        {activeTab.kind === "plugin" ? (
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
              windowLabel={activeTab.windowLabel}
            />
          ) : (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="Plugin unavailable"
              description="The selected plugin is no longer in the host catalog."
            />
          )
        ) : null}

        {activeTab.kind === "external" ? (
          <OtoolsExternalView tab={activeTab} />
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

function OtoolsPluginView({
  hostInfo,
  loading,
  marketQuery,
  onMarketQueryChange,
  onOpenPlugin,
  onRefresh,
  plugin,
  plugins,
  windowLabel,
}: {
  hostInfo: OtoolsHostInfo | null
  loading: boolean
  marketQuery: string
  onMarketQueryChange: (value: string) => void
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  onRefresh: () => void
  plugin: OtoolsPluginInfo
  plugins: OtoolsPluginInfo[]
  windowLabel: string
}) {
  const builtinView = renderBuiltinPluginView(plugin, {
    hostInfo,
    loading,
    marketQuery,
    onMarketQueryChange,
    onOpenPlugin,
    onRefresh,
    plugin,
    plugins,
  })
  if (builtinView) return builtinView

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
          onClick={() =>
            window.open(
              buildOtoolsRuntimeUrl(plugin, { windowLabel }),
              "_blank"
            )
          }
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Button>
      </div>
      <OtoolsPluginFrame
        hostInfo={hostInfo}
        plugin={plugin}
        windowLabel={windowLabel}
      />
    </>
  )
}

function OtoolsExternalView({ tab }: { tab: ExternalTab }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  useOtoolsChildWebviewSync(frameRef, tab.url)

  return (
    <>
      <div className="flex h-11 items-center justify-between border-b px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{tab.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {tab.url}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(tab.url, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Button>
      </div>
      {tab.url ? (
        <iframe
          ref={frameRef}
          src={tab.url}
          title={tab.title}
          allow="clipboard-read; clipboard-write"
          className="min-h-0 flex-1 border-0 bg-background"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        />
      ) : (
        <EmptyState
          icon={<ExternalLink className="h-8 w-8" />}
          title="Tab unavailable"
          description="The requested OTools tab does not include a valid URL."
        />
      )}
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
  const iconText = resolvePluginIconText(plugin.icon)
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

function buildPluginBrowserOpenUrl(
  plugin: OtoolsPluginInfo,
  sourceUrl?: string
): string {
  const rawUrl = String(sourceUrl || "").trim() || buildOtoolsPluginUrl(plugin)
  if (isDesktop() && !isRemoteDesktopMode()) {
    return rawUrl
  }
  return buildOtoolsRuntimeUrl(plugin, { sourceUrl: rawUrl })
}

function resolvePluginIconUrl(plugin: OtoolsPluginInfo): string | null {
  const icon = plugin.icon?.trim()
  if (!icon) return null
  if (icon.startsWith("@builtin:")) return null
  if (isShortTextIcon(icon)) return null
  if (/^(data|https?):/i.test(icon)) return icon
  if (!plugin.assetBaseUrl) return null
  const base = getServerBaseUrl().replace(/\/+$/, "")
  return `${base}${plugin.assetBaseUrl.replace(/\/+$/, "")}/${icon.replace(/^\/+/, "")}`
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

function isShortTextIcon(value: string | null | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  if (text.startsWith("@builtin:")) return false
  if (/^(data|https?|file):/i.test(text)) return false
  return Array.from(text).length <= 4
}

"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Code2, Package, RefreshCw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getDevWorkspace } from "@/lib/otools/api"
import type {
  DevWorkspace,
  OtoolsHostInfo,
  OtoolsPluginInfo,
} from "@/lib/otools/types"

export function DevPluginView({
  hostInfo,
  loading,
  onRefresh,
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

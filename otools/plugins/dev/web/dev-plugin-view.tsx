"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Bug,
  Code2,
  FolderCode,
  FolderOpen,
  Hammer,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Terminal,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { openFileDialog } from "@/lib/platform"
import { cn } from "@/lib/utils"
import {
  bindDevPluginDirectory,
  createDevPlugin,
  disableDevDebug,
  enableDevDebug,
  getDevNativeBuildJob,
  getDevNativeConfig,
  getDevWorkspace,
  initializeDevNativeProject,
  initializeDevVueProject,
  openProjectInEditor,
  openProjectInTerminal,
  packDevPlugin,
  reloadOtoolsPlugins,
  setDevNativeEnabled,
  startDevNativePluginBuild,
  updateDevPlugin,
} from "@/lib/otools/api"
import type {
  DevNativeBuildJobSnapshot,
  DevPluginInput,
  DevPluginRecord,
  DevWorkspace,
  OtoolsHostInfo,
  OtoolsPluginInfo,
} from "@/lib/otools/types"

type NoticeTone = "success" | "error" | "info"

type NoticeState = {
  tone: NoticeTone
  text: string
} | null

const BUILD_POLL_INTERVAL_MS = 1200

export function DevPluginView({
  hostInfo,
  loading,
  onOpenPlugin,
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
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const [detailForm, setDetailForm] = useState<DevPluginInput>(
    createEmptyPluginInput
  )
  const [detailScreenshotText, setDetailScreenshotText] = useState("")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState<DevPluginInput>(
    createEmptyPluginInput
  )
  const [createScreenshotText, setCreateScreenshotText] = useState("")
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [nativeEnabled, setNativeEnabled] = useState(false)
  const [nativeManifestPath, setNativeManifestPath] = useState("")
  const [nativeEnabledLoading, setNativeEnabledLoading] = useState(false)
  const [nativeBuildSnapshot, setNativeBuildSnapshot] =
    useState<DevNativeBuildJobSnapshot | null>(null)

  const devPlugins = useMemo(() => workspace?.items ?? [], [workspace?.items])
  const nativePlugins = plugins.filter((plugin) => plugin.nativeEnabled)
  const selectedPlugin = useMemo(
    () => devPlugins.find((item) => item.uuid === selectedUuid) ?? null,
    [devPlugins, selectedUuid]
  )
  const selectedRuntimePlugin = useMemo(
    () =>
      selectedPlugin
        ? (plugins.find(
            (plugin) =>
              plugin.uuid === selectedPlugin.uuid ||
              plugin.packid === selectedPlugin.packid
          ) ?? null)
        : null,
    [plugins, selectedPlugin]
  )

  const loadWorkspace = useCallback(async (preferredUuid?: string) => {
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    try {
      const nextWorkspace = await getDevWorkspace()
      setWorkspace(nextWorkspace)
      setSelectedUuid(
        (current) =>
          preferredUuid ?? current ?? nextWorkspace.items[0]?.uuid ?? null
      )
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err))
      setWorkspace(null)
      setSelectedUuid(null)
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  const loadNativeConfig = useCallback(async (uuid: string) => {
    try {
      const config = await getDevNativeConfig(uuid)
      setNativeEnabled(Boolean(config.enabled))
      setNativeManifestPath(config.manifestPath || "")
    } catch {
      setNativeEnabled(false)
      setNativeManifestPath("")
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    if (!devPlugins.length) {
      if (selectedUuid !== null) setSelectedUuid(null)
      return
    }

    if (!selectedUuid) {
      setSelectedUuid(devPlugins[0].uuid)
      return
    }

    if (!devPlugins.some((item) => item.uuid === selectedUuid)) {
      setSelectedUuid(devPlugins[0].uuid)
    }
  }, [devPlugins, selectedUuid])

  useEffect(() => {
    if (!selectedPlugin) {
      setDetailForm(createEmptyPluginInput())
      setDetailScreenshotText("")
      setNativeEnabled(false)
      setNativeManifestPath("")
      setNativeBuildSnapshot(null)
      return
    }

    setDetailForm(buildPluginInput(selectedPlugin))
    setDetailScreenshotText(selectedPlugin.screenshots.join("\n"))
    setNativeBuildSnapshot(null)
    void loadNativeConfig(selectedPlugin.uuid)
  }, [loadNativeConfig, selectedPlugin])

  const setFieldValue = useCallback(
    (field: keyof DevPluginInput, value: string | boolean | string[]) => {
      setDetailForm((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const setCreateFieldValue = useCallback(
    (field: keyof DevPluginInput, value: string | boolean | string[]) => {
      setCreateForm((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const refreshWorkspace = useCallback(
    async (preferredUuid?: string, refreshCatalog = false) => {
      if (refreshCatalog) {
        onRefresh()
      }
      await loadWorkspace(preferredUuid)
    },
    [loadWorkspace, onRefresh]
  )

  const runAction = useCallback(
    async <T,>(key: string, action: () => Promise<T>) => {
      setActionKey(key)
      try {
        return await action()
      } finally {
        setActionKey(null)
      }
    },
    []
  )

  const openPluginInstance = useCallback(() => {
    if (!selectedRuntimePlugin) {
      setNotice({
        tone: "info",
        text: "当前插件还未以调试或安装状态注册到运行时。",
      })
      return
    }
    onOpenPlugin(selectedRuntimePlugin)
  }, [onOpenPlugin, selectedRuntimePlugin])

  const refreshAll = useCallback(async () => {
    onRefresh()
    await loadWorkspace(selectedPlugin?.uuid ?? undefined)
  }, [loadWorkspace, onRefresh, selectedPlugin?.uuid])

  const handleCreatePlugin = useCallback(async () => {
    const payload = {
      ...createForm,
      screenshots: normalizeScreenshotLines(createScreenshotText),
    }

    try {
      const result = await runAction("create", () => createDevPlugin(payload))
      setCreateDialogOpen(false)
      setCreateForm(createEmptyPluginInput())
      setCreateScreenshotText("")
      setNotice({ tone: "success", text: result.message })
      await refreshWorkspace(result.item.uuid, true)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "创建开发插件失败"),
      })
    }
  }, [createForm, createScreenshotText, refreshWorkspace, runAction])

  const handleSaveDetails = useCallback(async () => {
    if (!selectedPlugin) return

    try {
      const result = await runAction("save", () =>
        updateDevPlugin(selectedPlugin.uuid, {
          ...detailForm,
          screenshots: normalizeScreenshotLines(detailScreenshotText),
        })
      )
      setNotice({ tone: "success", text: result.message })
      await refreshWorkspace(selectedPlugin.uuid, true)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "保存插件信息失败"),
      })
    }
  }, [
    detailForm,
    detailScreenshotText,
    refreshWorkspace,
    runAction,
    selectedPlugin,
  ])

  const handleBindDirectory = useCallback(async () => {
    if (!selectedPlugin) return

    const picked = await openFileDialog({
      directory: true,
      title: "选择插件开发目录",
    })
    const path = Array.isArray(picked) ? picked[0] : picked
    if (!path || !String(path).trim()) return

    try {
      const result = await runAction("bind", () =>
        bindDevPluginDirectory(selectedPlugin.uuid, String(path).trim())
      )
      setNotice({ tone: "success", text: result.message })
      await refreshWorkspace(selectedPlugin.uuid, true)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "绑定开发目录失败"),
      })
    }
  }, [refreshWorkspace, runAction, selectedPlugin])

  const handleToggleDebug = useCallback(async () => {
    if (!selectedPlugin) return

    try {
      const message = await runAction(
        selectedPlugin.debugEnabled ? "disable-debug" : "debug",
        () =>
          selectedPlugin.debugEnabled
            ? disableDevDebug(selectedPlugin.uuid)
            : enableDevDebug(selectedPlugin.uuid)
      )
      await reloadOtoolsPlugins().catch(() => undefined)
      setNotice({ tone: "success", text: message })
      await refreshWorkspace(selectedPlugin.uuid, true)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "切换调试状态失败"),
      })
    }
  }, [refreshWorkspace, runAction, selectedPlugin])

  const handleOpenEditor = useCallback(async () => {
    if (!selectedPlugin?.boundDirectoryPath) return
    try {
      await runAction("editor", () =>
        openProjectInEditor(selectedPlugin.boundDirectoryPath)
      )
      setNotice({
        tone: "success",
        text: "已请求用 VS Code 打开开发目录。",
      })
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "打开编辑器失败"),
      })
    }
  }, [runAction, selectedPlugin?.boundDirectoryPath])

  const handleOpenTerminal = useCallback(async () => {
    if (!selectedPlugin?.boundDirectoryPath) return
    try {
      await runAction("terminal", () =>
        openProjectInTerminal(selectedPlugin.boundDirectoryPath)
      )
      setNotice({
        tone: "success",
        text: "已请求在系统终端打开开发目录。",
      })
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "打开系统终端失败"),
      })
    }
  }, [runAction, selectedPlugin?.boundDirectoryPath])

  const handleInitializeVue = useCallback(async () => {
    if (!selectedPlugin) return
    try {
      const message = await runAction("init-vue", () =>
        initializeDevVueProject(selectedPlugin.uuid)
      )
      setNotice({ tone: "success", text: message })
      await refreshWorkspace(selectedPlugin.uuid)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "初始化 Vue 工程失败"),
      })
    }
  }, [refreshWorkspace, runAction, selectedPlugin])

  const handleInitializeNative = useCallback(async () => {
    if (!selectedPlugin) return
    try {
      const message = await runAction("init-native", () =>
        initializeDevNativeProject(selectedPlugin.uuid)
      )
      setNotice({ tone: "success", text: message })
      await refreshWorkspace(selectedPlugin.uuid)
      await loadNativeConfig(selectedPlugin.uuid)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "初始化原生工程失败"),
      })
    }
  }, [loadNativeConfig, refreshWorkspace, runAction, selectedPlugin])

  const handlePackPlugin = useCallback(async () => {
    if (!selectedPlugin) return
    try {
      const result = await runAction("pack", () =>
        packDevPlugin(selectedPlugin.uuid)
      )
      setNotice({ tone: "success", text: result.message })
      await refreshWorkspace(selectedPlugin.uuid)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "打包插件失败"),
      })
    }
  }, [refreshWorkspace, runAction, selectedPlugin])

  const handleBuildNative = useCallback(async () => {
    if (!selectedPlugin) return
    try {
      const started = await runAction("build-native", () =>
        startDevNativePluginBuild(selectedPlugin.uuid)
      )
      let snapshot = await getDevNativeBuildJob(started.jobId)
      setNativeBuildSnapshot(snapshot)
      while (snapshot.running) {
        await delay(BUILD_POLL_INTERVAL_MS)
        snapshot = await getDevNativeBuildJob(started.jobId)
        setNativeBuildSnapshot(snapshot)
      }
      if (snapshot.success) {
        setNotice({
          tone: "success",
          text: snapshot.message || "原生插件构建完成。",
        })
      } else {
        setNotice({
          tone: "error",
          text: snapshot.error || "原生插件构建失败。",
        })
      }
      await loadNativeConfig(selectedPlugin.uuid)
    } catch (error) {
      setNotice({
        tone: "error",
        text: formatErrorMessage(error, "启动原生构建失败"),
      })
    }
  }, [loadNativeConfig, runAction, selectedPlugin])

  const handleNativeEnabledChange = useCallback(
    async (checked: boolean) => {
      if (!selectedPlugin) return
      setNativeEnabledLoading(true)
      try {
        const message = await setDevNativeEnabled(selectedPlugin.uuid, checked)
        setNativeEnabled(checked)
        setNotice({ tone: "success", text: message })
        await loadNativeConfig(selectedPlugin.uuid)
      } catch (error) {
        setNotice({
          tone: "error",
          text: formatErrorMessage(error, "切换原生能力失败"),
        })
      } finally {
        setNativeEnabledLoading(false)
      }
    },
    [loadNativeConfig, selectedPlugin]
  )

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">开发者工具</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            保留 MenuGit 的 Dev 工作区结构，并在 codeg-plus 中直接复用已迁移的
            `dev_*` 宿主命令进行创建、绑定、调试与打包。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void refreshAll()}
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
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建插件
          </Button>
        </div>
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
        <NoticeBanner tone="error" className="mt-6">
          {workspaceError}
        </NoticeBanner>
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-medium">Dev workspace</div>
              <div className="text-xs text-muted-foreground">
                {devPlugins.length} items
              </div>
            </div>
          </div>
          <div className="divide-y">
            {devPlugins.map((item) => {
              const active = item.uuid === selectedUuid
              return (
                <button
                  key={item.uuid}
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-accent/60",
                    active && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => setSelectedUuid(item.uuid)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {item.displayNameCn || item.displayName || item.packid}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.packid}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {item.debugEnabled ? (
                        <Badge variant="outline">Debug</Badge>
                      ) : null}
                      <Badge variant="secondary">
                        {item.version || "0.0.0"}
                      </Badge>
                    </div>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.directoryBound
                      ? item.boundDirectoryPath
                      : "未绑定开发目录"}
                  </div>
                </button>
              )
            })}
            {!devPlugins.length ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无开发插件。先创建一条 Dev 记录，再绑定目录初始化工程。
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          {!selectedPlugin ? (
            <EmptyPanel
              title="还没有选中开发插件"
              description="左侧选择一条开发记录，或直接创建新的插件工作区。"
              action={
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  新建插件
                </Button>
              }
            />
          ) : (
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-semibold tracking-tight">
                      {selectedPlugin.displayNameCn ||
                        selectedPlugin.displayName ||
                        selectedPlugin.packid}
                    </h2>
                    <Badge variant="secondary">
                      {selectedPlugin.version || "0.0.0"}
                    </Badge>
                    {selectedPlugin.debugEnabled ? (
                      <Badge variant="outline">Debug registered</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedPlugin.packid} · {selectedPlugin.developerName}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedRuntimePlugin}
                    onClick={openPluginInstance}
                  >
                    <Rocket className="h-4 w-4" />
                    打开插件
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedPlugin.boundDirectoryPath}
                    onClick={() => void handleOpenEditor()}
                  >
                    <FolderCode className="h-4 w-4" />
                    VS Code
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selectedPlugin.boundDirectoryPath}
                    onClick={() => void handleOpenTerminal()}
                  >
                    <Terminal className="h-4 w-4" />
                    终端
                  </Button>
                </div>
              </div>

              {notice ? (
                <NoticeBanner tone={notice.tone} className="mt-4">
                  {notice.text}
                </NoticeBanner>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Field label="显示名称">
                  <Input
                    value={detailForm.displayName}
                    onChange={(event) =>
                      setFieldValue("displayName", event.target.value)
                    }
                  />
                </Field>
                <Field label="中文显示名称">
                  <Input
                    value={detailForm.displayNameCn ?? ""}
                    onChange={(event) =>
                      setFieldValue("displayNameCn", event.target.value)
                    }
                  />
                </Field>
                <Field label="Pack ID">
                  <Input
                    value={detailForm.packid}
                    onChange={(event) =>
                      setFieldValue("packid", event.target.value)
                    }
                  />
                </Field>
                <Field label="开发者">
                  <Input
                    value={detailForm.developerName}
                    onChange={(event) =>
                      setFieldValue("developerName", event.target.value)
                    }
                  />
                </Field>
                <Field label="版本">
                  <Input
                    value={detailForm.version}
                    onChange={(event) =>
                      setFieldValue("version", event.target.value)
                    }
                  />
                </Field>
                <Field label="Dev URL">
                  <Input
                    value={detailForm.devUrl}
                    onChange={(event) =>
                      setFieldValue("devUrl", event.target.value)
                    }
                  />
                </Field>
                <Field label="图标" className="lg:col-span-2">
                  <Input
                    value={detailForm.icon}
                    onChange={(event) =>
                      setFieldValue("icon", event.target.value)
                    }
                    placeholder="@builtin:dev 或 emoji / https 图标"
                  />
                </Field>
                <Field label="摘要" className="lg:col-span-2">
                  <Textarea
                    value={detailForm.summary}
                    onChange={(event) =>
                      setFieldValue("summary", event.target.value)
                    }
                    rows={4}
                  />
                </Field>
                <Field label="截图地址" className="lg:col-span-2">
                  <Textarea
                    value={detailScreenshotText}
                    onChange={(event) => {
                      setDetailScreenshotText(event.target.value)
                      setFieldValue(
                        "screenshots",
                        normalizeScreenshotLines(event.target.value)
                      )
                    }}
                    rows={4}
                    placeholder="每行一个 https 图片地址"
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <ToggleField
                  checked={detailForm.hasAd}
                  label="含广告"
                  onCheckedChange={(checked) =>
                    setFieldValue("hasAd", checked === true)
                  }
                />
                <ToggleField
                  checked={detailForm.inPluginPurchase}
                  label="插件内付费"
                  onCheckedChange={(checked) =>
                    setFieldValue("inPluginPurchase", checked === true)
                  }
                />
                <ToggleField
                  checked={detailForm.agreementAccepted}
                  label="接受开发者协议"
                  onCheckedChange={(checked) =>
                    setFieldValue("agreementAccepted", checked === true)
                  }
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleSaveDetails()}
                  disabled={actionKey === "save"}
                >
                  <Save className="h-4 w-4" />
                  保存信息
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleBindDirectory()}
                  disabled={actionKey === "bind"}
                >
                  <FolderOpen className="h-4 w-4" />
                  {selectedPlugin.directoryBound ? "重新绑定目录" : "绑定目录"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleToggleDebug()}
                  disabled={
                    actionKey === "debug" || actionKey === "disable-debug"
                  }
                >
                  <Bug className="h-4 w-4" />
                  {selectedPlugin.debugEnabled ? "取消调试" : "开启调试"}
                </Button>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <SectionCard
                  title="工程初始化"
                  description="基于已绑定目录快速补齐 Vue 与 native 工程骨架。"
                  icon={<Code2 className="h-4 w-4" />}
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionKey === "init-vue"}
                      onClick={() => void handleInitializeVue()}
                    >
                      初始化 Vue
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionKey === "init-native"}
                      onClick={() => void handleInitializeNative()}
                    >
                      初始化 Native
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionKey === "pack"}
                      onClick={() => void handlePackPlugin()}
                    >
                      打包插件
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2 rounded-lg border bg-muted/25 p-3 text-xs">
                    <DetailRow label="UUID" value={selectedPlugin.uuid} />
                    <DetailRow
                      label="绑定目录"
                      value={selectedPlugin.boundDirectoryPath || "-"}
                    />
                    <DetailRow
                      label="Manifest"
                      value={selectedPlugin.pluginManifestPath || "-"}
                    />
                    <DetailRow
                      label="Pack 文件"
                      value={selectedPlugin.packFilePath || "-"}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Native"
                  description="切换插件原生能力并发起异步构建。"
                  icon={<Hammer className="h-4 w-4" />}
                >
                  <div className="flex items-center justify-between rounded-lg border bg-muted/25 p-3">
                    <div>
                      <div className="text-sm font-medium">启用 native</div>
                      <div className="text-xs text-muted-foreground">
                        {nativeManifestPath ||
                          "尚未检测到 plugin.json 原生配置"}
                      </div>
                    </div>
                    <Switch
                      checked={nativeEnabled}
                      disabled={nativeEnabledLoading}
                      onCheckedChange={(checked) =>
                        void handleNativeEnabledChange(checked === true)
                      }
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={actionKey === "build-native"}
                      onClick={() => void handleBuildNative()}
                    >
                      <Hammer className="h-4 w-4" />
                      构建 Native
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedPlugin.boundDirectoryPath}
                      onClick={() => void handleOpenTerminal()}
                    >
                      <Terminal className="h-4 w-4" />
                      打开构建终端
                    </Button>
                  </div>

                  <pre className="mt-4 min-h-36 overflow-auto rounded-lg border bg-background px-3 py-3 text-xs text-muted-foreground">
                    {describeBuildSnapshot(nativeBuildSnapshot)}
                  </pre>
                </SectionCard>
              </div>

              <SectionCard
                title="版本记录"
                description="沿用原 Dev 工作区的本地版本记录。"
                icon={<Package className="h-4 w-4" />}
                className="mt-6"
              >
                <div className="divide-y rounded-lg border">
                  {selectedPlugin.versionRecords.map((version) => (
                    <div
                      key={version.id}
                      className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[120px_1fr_180px]"
                    >
                      <div className="font-medium">{version.version}</div>
                      <div className="text-muted-foreground">
                        {version.changelog || "无更新说明"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {version.status || "local"} ·{" "}
                        {version.publishedAt || "-"}
                      </div>
                    </div>
                  ))}
                  {!selectedPlugin.versionRecords.length ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground">
                      还没有版本记录。
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建开发插件</DialogTitle>
            <DialogDescription>
              先写入 Dev 工作区记录，再绑定实际开发目录。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="显示名称">
              <Input
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateFieldValue("displayName", event.target.value)
                }
              />
            </Field>
            <Field label="中文显示名称">
              <Input
                value={createForm.displayNameCn ?? ""}
                onChange={(event) =>
                  setCreateFieldValue("displayNameCn", event.target.value)
                }
              />
            </Field>
            <Field label="Pack ID">
              <Input
                value={createForm.packid}
                onChange={(event) =>
                  setCreateFieldValue("packid", event.target.value)
                }
              />
            </Field>
            <Field label="开发者">
              <Input
                value={createForm.developerName}
                onChange={(event) =>
                  setCreateFieldValue("developerName", event.target.value)
                }
              />
            </Field>
            <Field label="版本">
              <Input
                value={createForm.version}
                onChange={(event) =>
                  setCreateFieldValue("version", event.target.value)
                }
              />
            </Field>
            <Field label="Dev URL">
              <Input
                value={createForm.devUrl}
                onChange={(event) =>
                  setCreateFieldValue("devUrl", event.target.value)
                }
              />
            </Field>
            <Field label="图标" className="lg:col-span-2">
              <Input
                value={createForm.icon}
                onChange={(event) =>
                  setCreateFieldValue("icon", event.target.value)
                }
              />
            </Field>
            <Field label="摘要" className="lg:col-span-2">
              <Textarea
                rows={4}
                value={createForm.summary}
                onChange={(event) =>
                  setCreateFieldValue("summary", event.target.value)
                }
              />
            </Field>
            <Field label="截图地址" className="lg:col-span-2">
              <Textarea
                rows={4}
                value={createScreenshotText}
                onChange={(event) => {
                  setCreateScreenshotText(event.target.value)
                  setCreateFieldValue(
                    "screenshots",
                    normalizeScreenshotLines(event.target.value)
                  )
                }}
                placeholder="每行一个 https 图片地址"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <ToggleField
              checked={createForm.hasAd}
              label="含广告"
              onCheckedChange={(checked) =>
                setCreateFieldValue("hasAd", checked === true)
              }
            />
            <ToggleField
              checked={createForm.inPluginPurchase}
              label="插件内付费"
              onCheckedChange={(checked) =>
                setCreateFieldValue("inPluginPurchase", checked === true)
              }
            />
            <ToggleField
              checked={createForm.agreementAccepted}
              label="接受开发者协议"
              onCheckedChange={(checked) =>
                setCreateFieldValue("agreementAccepted", checked === true)
              }
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={actionKey === "create"}
              onClick={() => void handleCreatePlugin()}
            >
              <Plus className="h-4 w-4" />
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function createEmptyPluginInput(): DevPluginInput {
  return {
    icon: "@builtin:dev",
    packid: "",
    displayName: "",
    displayNameCn: "",
    developerName: "OTools Developer",
    summary: "",
    screenshots: [],
    version: "0.1.0",
    devUrl: "http://127.0.0.1:5173",
    hasAd: false,
    inPluginPurchase: false,
    agreementAccepted: true,
  }
}

function buildPluginInput(plugin: DevPluginRecord): DevPluginInput {
  return {
    icon: plugin.icon || "@builtin:dev",
    packid: plugin.packid,
    displayName: plugin.displayName,
    displayNameCn: plugin.displayNameCn ?? "",
    developerName: plugin.developerName,
    summary: plugin.summary,
    screenshots: plugin.screenshots ?? [],
    version: plugin.version,
    devUrl: plugin.devUrl,
    hasAd: plugin.hasAd,
    inPluginPurchase: plugin.inPluginPurchase,
    agreementAccepted: plugin.agreementAccepted,
  }
}

function normalizeScreenshotLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function describeBuildSnapshot(
  snapshot: DevNativeBuildJobSnapshot | null
): string {
  if (!snapshot) {
    return "尚未发起原生构建。"
  }

  const lines = [
    `jobId: ${snapshot.jobId}`,
    `running: ${snapshot.running ? "true" : "false"}`,
    `success: ${
      typeof snapshot.success === "boolean" ? String(snapshot.success) : "null"
    }`,
  ]

  if (snapshot.message) {
    lines.push(`message: ${snapshot.message}`)
  }
  if (snapshot.error) {
    lines.push(`error: ${snapshot.error}`)
  }
  if (snapshot.log) {
    lines.push("", snapshot.log)
  }

  return lines.join("\n")
}

function formatErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : String(error)
  return text?.trim() ? text : fallback
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs))
}

function NoticeBanner({
  children,
  className,
  tone,
}: {
  children: ReactNode
  className?: string
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
        tone === "info" && "border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}

function EmptyPanel({
  action,
  description,
  title,
}: {
  action?: ReactNode
  description: string
  title: string
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-lg font-medium">{title}</div>
      <div className="max-w-md text-sm text-muted-foreground">
        {description}
      </div>
      {action}
    </div>
  )
}

function SectionCard({
  children,
  className,
  description,
  icon,
  title,
}: {
  children: ReactNode
  className?: string
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className={cn("rounded-xl border bg-muted/20 p-4", className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Field({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function ToggleField({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean | "indeterminate") => void
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate font-mono">{value}</div>
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

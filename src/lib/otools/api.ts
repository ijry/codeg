import {
  getActiveRemoteConnectionId,
  getServerBaseUrl,
  getShellTransport,
  getTransport,
  isDesktop,
} from "@/lib/transport"
import { getCurrentEffectiveAppLocale } from "@/lib/i18n"
import type {
  DevNativeBuildJobSnapshot,
  DevNativeBuildJobStart,
  DevNativeConfig,
  DevPluginActionResult,
  DevPluginInput,
  DevPublishVersionInput,
  OtoolsAiChatMessage,
  DevWorkspace,
  OtoolsAssetPayload,
  OtoolsConfig,
  OtoolsHostInfo,
  OtoolsNavigationResult,
  OtoolsNativeProbeResult,
  OtoolsPluginInfo,
  ParkCatalogItem,
  ParkInstallResult,
  ParkUninstallResult,
  ParkWorkspace,
} from "./types"

const OTOOLS_DEV_PLUGIN_UUID = "otools-dev"
const OTOOLS_PARK_PLUGIN_UUID = "otools-park"

export async function openOtoolsWindow(source?: string): Promise<void> {
  if (isDesktop()) {
    return getShellTransport().call("open_otools_window", {
      source,
      remoteConnectionId: getActiveRemoteConnectionId(),
      locale: getCurrentEffectiveAppLocale(),
    })
  }
  const result = await getTransport().call<OtoolsNavigationResult>(
    "open_otools_window",
    { source }
  )
  window.open(result.path, "otools")
}

export async function listOtoolsPlugins(): Promise<OtoolsPluginInfo[]> {
  return getTransport().call("otools_list_plugins")
}

export async function getAllOtoolsPlugins(): Promise<OtoolsPluginInfo[]> {
  return getTransport().call("otools_get_all_plugins")
}

export async function getOtoolsHostInfo(): Promise<OtoolsHostInfo> {
  return getTransport().call("otools_host_info")
}

export async function getOtoolsPlugin(
  pluginUuid: string
): Promise<OtoolsPluginInfo> {
  return getTransport().call("otools_get_plugin", { pluginUuid })
}

export async function getOtoolsPluginState(
  pluginUuid: string,
  scheme: "local" | "sync" = "local"
): Promise<unknown> {
  return getTransport().call("otools_plugin_state_get", { pluginUuid, scheme })
}

export async function setOtoolsPluginState(
  pluginUuid: string,
  state: unknown,
  scheme: "local" | "sync" = "local"
): Promise<void> {
  return getTransport().call("otools_plugin_state_set", {
    pluginUuid,
    scheme,
    state,
  })
}

export async function getOtoolsPluginAsset(
  pluginUuid: string,
  assetPath: string
): Promise<OtoolsAssetPayload> {
  return getTransport().call("otools_get_plugin_asset", {
    pluginUuid,
    assetPath,
  })
}

export async function getOtoolsConfig(): Promise<OtoolsConfig> {
  return getTransport().call("get_otools_config")
}

export async function saveOtoolsConfig(config: OtoolsConfig): Promise<void> {
  return getTransport().call("save_otools_config", { config })
}

export async function getOtoolsConfigValue<T = unknown>(
  key: string
): Promise<T | null> {
  return getTransport().call("get_otools_config_value", { key })
}

export async function saveOtoolsConfigValue(
  key: string,
  value: unknown
): Promise<void> {
  return getTransport().call("save_otools_config_value", { key, value })
}

export async function loadOtoolsAiChatHistory(
  prefix: string
): Promise<OtoolsAiChatMessage[]> {
  return getTransport().call("otools_ai_load_chat_history", { prefix })
}

export async function saveOtoolsAiChatHistory(
  prefix: string,
  messages: OtoolsAiChatMessage[]
): Promise<void> {
  return getTransport().call("otools_ai_save_chat_history", {
    prefix,
    messages,
  })
}

export async function emitOtoolsShellShortcut(
  action: "closeActiveTab" | "activatePrevTab" | "activateNextTab"
): Promise<void> {
  return getTransport().call("otools_emit_tools_shell_shortcut", { action })
}

export async function requestOtoolsAppExit(): Promise<void> {
  if (!isDesktop()) {
    throw new Error("网页模式不支持退出本地 codeg-plus 宿主")
  }
  return getShellTransport().call("otools_request_app_exit")
}

export async function getOtoolsLaunchAtStartup(): Promise<boolean> {
  if (!isDesktop()) {
    return false
  }
  return getShellTransport().call("otools_get_launch_at_startup")
}

export async function setOtoolsLaunchAtStartup(
  enabled: boolean
): Promise<boolean> {
  if (!isDesktop()) {
    if (enabled) {
      throw new Error("网页模式不支持设置本地 codeg-plus 开机启动")
    }
    return false
  }
  return getShellTransport().call("otools_set_launch_at_startup", { enabled })
}

export async function invokeOtoolsNative<T = unknown>(
  pluginUuid: string,
  method: string,
  payload?: unknown
): Promise<T> {
  return getTransport().call("otools_native_invoke", {
    pluginUuid,
    method,
    payload: payload ?? null,
  })
}

export async function invokeOtoolsPluginCommand<T = unknown>(
  pluginUuid: string,
  command: string,
  payload?: unknown
): Promise<T> {
  return getTransport().call("otools_plugin_command_invoke", {
    pluginUuid,
    command,
    payload: payload ?? null,
  })
}

function invokeDevCommand<T>(command: string, payload?: unknown): Promise<T> {
  return invokeOtoolsPluginCommand<T>(OTOOLS_DEV_PLUGIN_UUID, command, payload)
}

function invokeParkCommand<T>(command: string, payload?: unknown): Promise<T> {
  return invokeOtoolsPluginCommand<T>(OTOOLS_PARK_PLUGIN_UUID, command, payload)
}

export async function getDevWorkspace(): Promise<DevWorkspace> {
  return invokeDevCommand<DevWorkspace>("dev_get_workspace")
}

export async function createDevPlugin(
  input: DevPluginInput
): Promise<DevPluginActionResult> {
  return invokeDevCommand<DevPluginActionResult>("dev_create_plugin", { input })
}

export async function updateDevPlugin(
  uuid: string,
  meta: DevPluginInput
): Promise<DevPluginActionResult> {
  return invokeDevCommand<DevPluginActionResult>("dev_update_plugin", {
    input: { uuid, meta },
  })
}

export async function bindDevPluginDirectory(
  uuid: string,
  directoryPath: string
): Promise<DevPluginActionResult> {
  return invokeDevCommand<DevPluginActionResult>("dev_bind_plugin_directory", {
    input: { uuid, directoryPath },
  })
}

export async function enableDevDebug(uuid: string): Promise<string> {
  return invokeDevCommand<string>("dev_enable_debug", { uuid })
}

export async function disableDevDebug(uuid: string): Promise<string> {
  return invokeDevCommand<string>("dev_disable_debug", { uuid })
}

export async function initializeDevVueProject(uuid: string): Promise<string> {
  return invokeDevCommand<string>("dev_initialize_vue_project", { uuid })
}

export async function initializeDevNativeProject(
  uuid: string
): Promise<string> {
  return invokeDevCommand<string>("dev_initialize_native_project", { uuid })
}

export async function buildDevNativePlugin(uuid: string): Promise<string> {
  return invokeDevCommand<string>("dev_build_native_plugin", { uuid })
}

export async function buildDevNativeArtifact(uuid: string): Promise<string> {
  return invokeDevCommand<string>("dev_build_native_artifact", { uuid })
}

export async function buildDevNativeArtifactFromDir(
  directoryPath: string
): Promise<string> {
  return invokeDevCommand<string>("dev_build_native_artifact_from_dir", {
    directoryPath,
  })
}

export async function startDevNativePluginBuild(
  uuid: string
): Promise<DevNativeBuildJobStart> {
  return invokeDevCommand<DevNativeBuildJobStart>(
    "dev_start_native_plugin_build",
    { uuid }
  )
}

export async function startDevNativeArtifactBuildFromDir(
  directoryPath: string
): Promise<DevNativeBuildJobStart> {
  return invokeDevCommand<DevNativeBuildJobStart>(
    "dev_start_native_artifact_build_from_dir",
    {
      directoryPath,
    }
  )
}

export async function getDevNativeBuildJob(
  jobId: string
): Promise<DevNativeBuildJobSnapshot> {
  return invokeDevCommand<DevNativeBuildJobSnapshot>(
    "dev_get_native_build_job",
    { jobId }
  )
}

export async function getDevNativeConfig(
  uuid: string
): Promise<DevNativeConfig> {
  return invokeDevCommand<DevNativeConfig>("dev_get_native_config", { uuid })
}

export async function setDevNativeEnabled(
  uuid: string,
  enabled: boolean
): Promise<string> {
  return invokeDevCommand<string>("dev_set_native_enabled", { uuid, enabled })
}

export async function packDevPlugin(
  uuid: string
): Promise<DevPluginActionResult> {
  return invokeDevCommand<DevPluginActionResult>("dev_pack_plugin", { uuid })
}

export async function probeDevNativePlugin(
  uuid: string
): Promise<OtoolsNativeProbeResult> {
  return getTransport().call("native_plugin_probe", { uuid })
}

export async function reloadDevNativePlugin(uuid: string): Promise<string> {
  return getTransport().call("native_plugin_reload", { uuid })
}

export async function publishDevVersion(
  input: DevPublishVersionInput
): Promise<DevPluginActionResult> {
  return invokeDevCommand<DevPluginActionResult>("dev_publish_version", {
    input,
  })
}

export async function reloadOtoolsPlugins(): Promise<void> {
  return getTransport().call("otools_reload_all_plugins")
}

export async function openProjectInEditor(
  path: string,
  editorId = "vscode"
): Promise<void> {
  return getTransport().call("project_editor_open", {
    path,
    editorId,
  })
}

export async function openProjectInTerminal(workingDir: string): Promise<void> {
  return getTransport().call("project_runner_open_in_terminal", {
    workingDir,
  })
}

export async function getParkWorkspace(cate?: string): Promise<ParkWorkspace> {
  return invokeParkCommand<ParkWorkspace>("park_get_workspace", { cate })
}

export async function installParkPlugin(
  item: ParkCatalogItem
): Promise<ParkInstallResult> {
  return invokeParkCommand<ParkInstallResult>("park_install_plugin", {
    input: { item },
  })
}

export async function installOfflineParkPlugin(
  filePath: string
): Promise<ParkInstallResult> {
  return invokeParkCommand<ParkInstallResult>("park_install_offline_plugin", {
    filePath,
  })
}

export async function uninstallParkPlugin(
  item: ParkCatalogItem
): Promise<ParkUninstallResult> {
  return invokeParkCommand<ParkUninstallResult>("park_uninstall_plugin", {
    input: { item },
  })
}

export function buildOtoolsPluginUrl(plugin: OtoolsPluginInfo): string {
  if (/^(https?|file|data):/i.test(plugin.entry)) {
    return plugin.entry
  }
  const base = getServerBaseUrl().replace(/\/+$/, "")
  const entry = plugin.entry.replace(/^\/+/, "")
  return `${base}${plugin.assetBaseUrl}/${entry}`
}

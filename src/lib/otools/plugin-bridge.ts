// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { sendSystemNotification } from "@/lib/notification"
import {
  closeCurrentWindow,
  getCurrentWindow,
  openFileDialog,
  openPath,
  openUrl,
  revealItemInDir,
} from "@/lib/platform"
import {
  getActiveRemoteConnectionId,
  getActiveRemoteToken,
  getServerBaseUrl,
  getShellTransport,
  getTransport,
  isDesktop,
} from "@/lib/transport"
import { getCodegToken } from "@/lib/transport/web-auth"
import {
  listOtoolsPlugins,
  reloadOtoolsPlugins,
  getOtoolsConfig,
  getOtoolsConfigValue,
  getOtoolsPluginAsset,
  invokeOtoolsNative,
  invokeOtoolsPluginCommand,
  probeDevNativePlugin,
  reloadDevNativePlugin,
  saveOtoolsConfig,
  saveOtoolsConfigValue,
} from "./api"
import {
  normalizeConfigValueForSave,
  OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
  syncBasicSettingsToHost,
} from "./config-runtime"
import {
  OTOOLS_HOST_CLOSE_TAB_EVENT,
  OTOOLS_HOST_CREATE_TAB_EVENT,
  OTOOLS_HOST_NOTIFICATION_EVENT,
  OTOOLS_HOST_RELOAD_PLUGINS_EVENT,
  OTOOLS_HOST_SHELL_SHORTCUT_EVENT,
  OTOOLS_HOST_STATUS_BAR_EVENT,
  OTOOLS_HOST_SWITCH_TAB_EVENT,
  dispatchOtoolsChildLocaleSync,
  dispatchOtoolsChildThemeSync,
  type OtoolsHostCloseTabDetail,
  type OtoolsHostCreateTabDetail,
  type OtoolsHostChildLocaleSyncDetail,
  type OtoolsHostChildThemeSyncDetail,
  type OtoolsHostNotificationDetail,
  type OtoolsHostShellShortcutDetail,
  type OtoolsHostStatusBarDetail,
  type OtoolsHostSwitchTabDetail,
  type OtoolsHostWindowState,
} from "./host-events"
import type {
  OtoolsBridgeRequest,
  OtoolsBridgeResponse,
  OtoolsHostInfo,
  OtoolsPluginInfo,
} from "./types"

const STATE_GET_COMMANDS = new Set([
  "get_otools_plugin_localstate",
  "get_otools_plugin_localstate_with_scheme",
  "get_otools_plugin_syncstate",
  "get_otools_plugin_syncstate_with_scheme",
])

const STATE_SET_COMMANDS = new Set([
  "save_otools_plugin_localstate",
  "save_otools_plugin_localstate_with_scheme",
  "save_otools_plugin_syncstate",
  "save_otools_plugin_syncstate_with_scheme",
])

const STATE_VALUE_GET_COMMANDS = new Set([
  "get_otools_plugin_localstate_value",
  "get_otools_plugin_localstate_value_with_scheme",
  "get_otools_plugin_syncstate_value",
  "get_otools_plugin_syncstate_value_with_scheme",
])

const STATE_VALUE_SET_COMMANDS = new Set([
  "save_otools_plugin_localstate_value",
  "save_otools_plugin_localstate_value_with_scheme",
  "save_otools_plugin_syncstate_value",
  "save_otools_plugin_syncstate_value_with_scheme",
])

const STATE_PATCH_COMMANDS = new Set([
  "patch_otools_plugin_localstate",
  "patch_otools_plugin_localstate_with_scheme",
  "patch_otools_plugin_syncstate",
  "patch_otools_plugin_syncstate_with_scheme",
])

const DIRECT_TAURI_NOOP_COMMANDS = new Set([
  "set_window_theme",
  "update_tray_menu",
])

const OTOOLS_POPUP_COMMANDS = new Set([
  "open_commit_window",
  "open_merge_window",
  "open_settings_window",
  "open_stash_window",
  "open_push_window",
  "open_project_boot_window",
])

function withMenuGitPluginCompat(plugin: OtoolsPluginInfo) {
  const record = { ...plugin }
  if (!record.displayNameCN && record.displayNameCn) {
    record.displayNameCN = record.displayNameCn
  }
  if (!record.displayNameCn && record.displayNameCN) {
    record.displayNameCn = record.displayNameCN
  }
  if (!record.minOToolsVersion && record.minOtoolsVersion) {
    record.minOToolsVersion = record.minOtoolsVersion
  }
  if (!record.minOtoolsVersion && record.minOToolsVersion) {
    record.minOtoolsVersion = record.minOToolsVersion
  }
  if (!Array.isArray(record.screenshots)) {
    record.screenshots = []
  }
  if (!Array.isArray(record.key)) {
    record.key = []
  }
  if (!Array.isArray(record.permissions)) {
    record.permissions = []
  }
  if (typeof record.enabled !== "boolean") {
    record.enabled = true
  }
  return record
}

async function listOtoolsPluginsForBridge() {
  const plugins = await listOtoolsPlugins()
  return plugins.map(withMenuGitPluginCompat)
}

const OPEN_EXTERNAL_COMMANDS = new Set([
  "__otools_open_external",
  "plugin:opener|open_url",
  "remote_service_shell_open_external",
  "otools_shell_open_external",
])

const OPEN_PATH_COMMANDS = new Set([
  "__otools_open_path",
  "plugin:opener|open_path",
  "remote_service_shell_open_path",
  "otools_shell_open_path",
])

const SHELL_OPEN_COMMANDS = new Set([
  "__otools_shell_open",
  "plugin:shell|open",
  "remote_service_shell_open",
  "otools_shell_open",
])

const REVEAL_ITEM_COMMANDS = new Set([
  "__otools_reveal_item",
  "plugin:opener|reveal_item_in_dir",
  "remote_service_shell_show_item_in_folder",
  "otools_shell_show_item_in_folder",
])

const TRASH_ITEM_COMMANDS = new Set([
  "__otools_trash_item",
  "remote_service_shell_trash_item",
  "otools_shell_trash_item",
])

const BEEP_COMMANDS = new Set([
  "__otools_shell_beep",
  "remote_service_shell_beep",
  "otools_shell_beep",
])

const COPY_TEXT_COMMANDS = new Set(["__otools_copy_text", "otools_copy_text"])

const COPY_FILE_COMMANDS = new Set(["otools_copy_file"])

const COPY_IMAGE_COMMANDS = new Set(["otools_copy_image"])

const GET_COPIED_FILES_COMMANDS = new Set(["otools_get_copied_files"])

const FILE_ICON_COMMANDS = new Set(["otools_get_file_icon"])

const UPLOAD_COMMANDS = new Set(["upload_save_image"])

const FILESYSTEM_COMMANDS = new Set([
  "read_file_content",
  "write_file_content",
  "read_directory_recursive",
  "create_directory",
  "delete_file",
  "delete_directory",
])

const PACKAGE_MANAGER_COMMANDS = new Set([
  "otools_host_run_winget_install",
  "otools_host_run_package_action",
  "otools_host_get_package_status",
  "otools_host_get_packages_status",
])

const HOST_COMMANDS = new Set([
  "otools_host_scan_storage_catalog",
  "otools_host_clean_storage_paths",
  "otools_host_clean_storage_items",
  "otools_host_list_listen_processes",
  "otools_host_kill_process",
  "otools_host_http_write_base64_file",
  "otools_host_http_send",
])

const TOOLS_WEBVIEW_FORWARD_COMMANDS = new Set([
  "tools_webview_read_file",
  "tools_webview_file_meta",
  "tools_webview_write_file",
  "tools_webview_list_dir",
  "tools_webview_home_dir",
  "tools_webview_join_path",
  "tools_webview_create_dir",
  "tools_webview_touch_file",
  "tools_webview_remove_entry",
  "tools_webview_rename_entry",
  "tools_webview_browse_dialog",
  "tools_webview_log",
])

const NOTIFICATION_COMMANDS = new Set([
  "__otools_show_notification",
  "otools_show_notification",
  "plugin:notification|notify",
  "plugin:notification|send",
  "plugin:notification|show",
])

const CONFIG_COMMANDS = new Set([
  "get_otools_config",
  "save_otools_config",
  "get_otools_config_value",
  "save_otools_config_value",
])
const WINDOW_LABEL = "otools"
const LOCAL_TERMINAL_OUTPUT_EVENT = "local-terminal-output"
const LOCAL_TERMINAL_STATUS_EVENT = "local-terminal-status"
const SSH_OUTPUT_EVENT = "ssh-output"
const SSH_CONNECTION_STATUS_EVENT = "ssh-connection-status"
const MAX_LOCAL_TERMINAL_BUFFERED_EVENTS = 400
const OTOOLS_RUNTIME_RESERVED_QUERY_KEYS = new Set([
  "pluginUuid",
  "windowLabel",
  "title",
  "entryPath",
  "sourceUrl",
])

type OtoolsHostTerminalEventPayload = {
  terminal_id?: string
  data?: string | null
}

type OtoolsLocalTerminalBufferedEvent =
  | {
      kind: "output"
      sessionId: string
      output: string
    }
  | {
      kind: "status"
      sessionId: string
      status: string
      message: string
    }

type OtoolsLocalTerminalSession = {
  unlistenOutput: (() => void) | null
  unlistenExit: (() => void) | null
}

type OtoolsSshFrameSession = {
  unlistenOutput: (() => void) | null
  unlistenStatus: (() => void) | null
  refs: number
}

type OtoolsFrameNativeListenSession = {
  refs: number
  unlisten: (() => void) | null
}

let copiedHostFiles: string[] = []
let cachedOtoolsHostInfo: Promise<Record<string, unknown> | null> | null = null

function canUseLocalDesktopHost(): boolean {
  return isDesktop() && getActiveRemoteConnectionId() === null
}

export function installOtoolsFrameBridge(
  frame: HTMLIFrameElement,
  pluginUuid: string
): () => void {
  const localTerminalSessions = new Map<string, OtoolsLocalTerminalSession>()
  const nativeListenSessions = new Map<string, OtoolsFrameNativeListenSession>()
  const sshFrameSessions = new Map<string, OtoolsSshFrameSession>()
  const localTerminalBuffers = new Map<
    string,
    OtoolsLocalTerminalBufferedEvent[]
  >()

  async function handleMessage(event: MessageEvent<OtoolsBridgeRequest>) {
    if (event.source !== frame.contentWindow) return
    const request = event.data
    if (!request || request.type !== "otools:invoke") return

    const response: OtoolsBridgeResponse = {
      id: request.id,
      type: "otools:invoke-result",
      ok: true,
    }

    try {
      response.data = await dispatchOtoolsFrameCommand(
        frame,
        pluginUuid,
        request.command,
        request.payload,
        localTerminalSessions,
        localTerminalBuffers,
        nativeListenSessions,
        sshFrameSessions
      )
    } catch (error) {
      response.ok = false
      response.error = error instanceof Error ? error.message : String(error)
    }

    frame.contentWindow?.postMessage(response, "*")
  }

  window.addEventListener("message", handleMessage)
  return () => {
    window.removeEventListener("message", handleMessage)
    for (const sessionId of [...localTerminalSessions.keys()]) {
      void disposeLocalTerminalSession(localTerminalSessions, sessionId)
    }
    for (const uuid of [...nativeListenSessions.keys()]) {
      void disposeFrameNativeListenSession(nativeListenSessions, uuid)
    }
    for (const sessionId of [...sshFrameSessions.keys()]) {
      void disposeSshFrameSession(sshFrameSessions, sessionId)
    }
    localTerminalBuffers.clear()
  }
}

async function dispatchOtoolsFrameCommand(
  frame: HTMLIFrameElement,
  pluginUuid: string,
  command: string,
  payload: unknown,
  localTerminalSessions: Map<string, OtoolsLocalTerminalSession>,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>,
  nativeListenSessions: Map<string, OtoolsFrameNativeListenSession>,
  sshFrameSessions: Map<string, OtoolsSshFrameSession>
): Promise<unknown> {
  switch (command) {
    case "start_local_terminal_session":
      return startLocalTerminalSession(
        frame,
        payload,
        localTerminalSessions,
        localTerminalBuffers
      )
    case "pull_local_terminal_events":
      return pullLocalTerminalEvents(payload, localTerminalBuffers)
    case "send_local_terminal_input":
      return sendLocalTerminalInput(payload)
    case "resize_local_terminal_session":
      return resizeLocalTerminalSession(payload)
    case "close_local_terminal_session":
      return closeLocalTerminalSession(
        frame,
        payload,
        localTerminalSessions,
        localTerminalBuffers
      )
    case "native_plugin_listen_acquire":
      return acquireFrameNativeListen(
        frame,
        pluginUuid,
        payload,
        nativeListenSessions
      )
    case "native_plugin_listen_release":
      return releaseFrameNativeListen(
        pluginUuid,
        payload,
        nativeListenSessions
      )
    case "connect_ssh_server":
      return connectSshServerForFrame(frame, payload, sshFrameSessions)
    case "send_ssh_input":
      return sendSshInputForFrame(payload)
    case "disconnect_ssh_server":
      return disconnectSshServerForFrame(payload, sshFrameSessions)
    case "is_ssh_connected":
      return getTransport().call("is_ssh_connected", asRecord(payload) ?? {})
    default:
      return dispatchOtoolsCommand(pluginUuid, command, payload)
  }
}

async function acquireFrameNativeListen(
  frame: HTMLIFrameElement,
  pluginUuid: string,
  payload: unknown,
  nativeListenSessions: Map<string, OtoolsFrameNativeListenSession>
): Promise<Record<string, unknown>> {
  const targetPluginUuid = resolvePayloadPluginUuid(pluginUuid, payload)
  if (!targetPluginUuid) {
    throw new Error("plugin uuid is required")
  }

  const existing = nativeListenSessions.get(targetPluginUuid)
  if (existing) {
    existing.refs += 1
    return {
      ok: true,
      pluginUuid: targetPluginUuid,
    }
  }

  const eventName = `otools-native:${targetPluginUuid}`
  const unlisten = await getTransport().subscribe(eventName, (eventPayload) => {
    const body = asRecord(eventPayload)
    frame.contentWindow?.postMessage(
      {
        type: "otools:native-event",
        payload: {
          pluginUuid: targetPluginUuid,
          topic: readStringField(body ?? {}, "topic"),
          payload: body?.payload ?? null,
        },
      },
      "*"
    )
  })

  try {
    await getTransport().call("native_plugin_listen_acquire", {
      uuid: targetPluginUuid,
      intervalMs: readOptionalIntervalMs(payload),
    })
  } catch (error) {
    unlisten()
    throw error
  }

  nativeListenSessions.set(targetPluginUuid, {
    refs: 1,
    unlisten,
  })

  return {
    ok: true,
    pluginUuid: targetPluginUuid,
  }
}

async function releaseFrameNativeListen(
  pluginUuid: string,
  payload: unknown,
  nativeListenSessions: Map<string, OtoolsFrameNativeListenSession>
): Promise<Record<string, unknown>> {
  const targetPluginUuid = resolvePayloadPluginUuid(pluginUuid, payload)
  if (!targetPluginUuid) {
    throw new Error("plugin uuid is required")
  }

  const session = nativeListenSessions.get(targetPluginUuid)
  if (!session) {
    return {
      ok: true,
      pluginUuid: targetPluginUuid,
    }
  }

  session.refs -= 1
  if (session.refs <= 0) {
    await disposeFrameNativeListenSession(nativeListenSessions, targetPluginUuid)
  }

  return {
    ok: true,
    pluginUuid: targetPluginUuid,
  }
}

async function disposeFrameNativeListenSession(
  nativeListenSessions: Map<string, OtoolsFrameNativeListenSession>,
  pluginUuid: string
): Promise<void> {
  const session = nativeListenSessions.get(pluginUuid)
  if (!session) {
    return
  }
  nativeListenSessions.delete(pluginUuid)
  session.unlisten?.()
  try {
    await getTransport().call("native_plugin_listen_release", {
      uuid: pluginUuid,
    })
  } catch {}
}

async function startLocalTerminalSession(
  frame: HTMLIFrameElement,
  payload: unknown,
  localTerminalSessions: Map<string, OtoolsLocalTerminalSession>,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>
): Promise<string> {
  const sessionId = readStringField(payload, "sessionId").trim()
  if (!sessionId) {
    throw new Error("sessionId is required")
  }

  await disposeLocalTerminalSession(localTerminalSessions, sessionId)
  try {
    await getTransport().call("terminal_kill", {
      terminalId: sessionId,
    })
  } catch (error) {
    if (!isTerminalNotFoundError(error)) {
      throw error
    }
  }
  localTerminalBuffers.set(sessionId, [])

  const outputEvent = `terminal://output/${sessionId}`
  const exitEvent = `terminal://exit/${sessionId}`
  const session: OtoolsLocalTerminalSession = {
    unlistenOutput: null,
    unlistenExit: null,
  }
  localTerminalSessions.set(sessionId, session)

  try {
    session.unlistenOutput =
      await getTransport().subscribe<OtoolsHostTerminalEventPayload>(
        outputEvent,
        (event) => {
          emitLocalTerminalOutput(
            frame,
            localTerminalBuffers,
            sessionId,
            typeof event?.data === "string" ? event.data : ""
          )
        }
      )

    session.unlistenExit =
      await getTransport().subscribe<OtoolsHostTerminalEventPayload>(
        exitEvent,
        () => {
          emitLocalTerminalStatus(
            frame,
            localTerminalBuffers,
            sessionId,
            "closed"
          )
          void disposeLocalTerminalSession(localTerminalSessions, sessionId)
        }
      )

    const workingDir = readOptionalStringField(payload, "workingDir") || "."
    const shell = readOptionalStringField(payload, "shell")
    const initialCommand = readOptionalStringField(payload, "initialCommand")

    const terminalId = await getTransport().call<string>("terminal_spawn", {
      workingDir,
      shell,
      initialCommand,
      terminalId: sessionId,
    })

    emitLocalTerminalStatus(frame, localTerminalBuffers, sessionId, "connected")

    return String(terminalId || sessionId)
  } catch (error) {
    emitLocalTerminalStatus(
      frame,
      localTerminalBuffers,
      sessionId,
      "error",
      formatBridgeError(error)
    )
    await disposeLocalTerminalSession(localTerminalSessions, sessionId)
    throw error
  }
}

function pullLocalTerminalEvents(
  payload: unknown,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>
): OtoolsLocalTerminalBufferedEvent[] {
  const sessionId = readStringField(payload, "sessionId").trim()
  if (!sessionId) {
    throw new Error("sessionId is required")
  }

  const events = [...(localTerminalBuffers.get(sessionId) ?? [])]
  localTerminalBuffers.set(sessionId, [])
  return events
}

async function sendLocalTerminalInput(payload: unknown): Promise<void> {
  const sessionId = readStringField(payload, "sessionId").trim()
  if (!sessionId) {
    throw new Error("sessionId is required")
  }

  await getTransport().call("terminal_write", {
    terminalId: sessionId,
    data: readStringField(payload, "input"),
  })
}

async function resizeLocalTerminalSession(payload: unknown): Promise<void> {
  const sessionId = readStringField(payload, "sessionId").trim()
  if (!sessionId) {
    throw new Error("sessionId is required")
  }

  await getTransport().call("terminal_resize", {
    terminalId: sessionId,
    cols: readNumberField(payload, "cols", 80),
    rows: readNumberField(payload, "rows", 24),
  })
}

async function closeLocalTerminalSession(
  frame: HTMLIFrameElement,
  payload: unknown,
  localTerminalSessions: Map<string, OtoolsLocalTerminalSession>,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>
): Promise<void> {
  const sessionId = readStringField(payload, "sessionId").trim()
  if (!sessionId) {
    throw new Error("sessionId is required")
  }

  await disposeLocalTerminalSession(localTerminalSessions, sessionId)

  try {
    await getTransport().call("terminal_kill", {
      terminalId: sessionId,
    })
  } catch (error) {
    if (!isTerminalNotFoundError(error)) {
      throw error
    }
  }

  emitLocalTerminalStatus(frame, localTerminalBuffers, sessionId, "closed")
}

async function disposeLocalTerminalSession(
  localTerminalSessions: Map<string, OtoolsLocalTerminalSession>,
  sessionId: string
): Promise<void> {
  const session = localTerminalSessions.get(sessionId)
  if (!session) return

  localTerminalSessions.delete(sessionId)

  const unsubscribeTasks = [session.unlistenOutput, session.unlistenExit]
    .filter(Boolean)
    .map((unsubscribe) =>
      Promise.resolve()
        .then(() => unsubscribe?.())
        .catch(() => {})
    )

  if (unsubscribeTasks.length > 0) {
    await Promise.allSettled(unsubscribeTasks)
  }
}

function emitLocalTerminalOutput(
  frame: HTMLIFrameElement,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>,
  sessionId: string,
  output: string
) {
  const payload = {
    sessionId,
    output,
  }
  pushLocalTerminalBufferedEvent(localTerminalBuffers, sessionId, {
    kind: "output",
    sessionId,
    output,
  })
  postBridgeEvent(frame, LOCAL_TERMINAL_OUTPUT_EVENT, payload)
}

function emitLocalTerminalStatus(
  frame: HTMLIFrameElement,
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>,
  sessionId: string,
  status: string,
  message = ""
) {
  const payload = {
    sessionId,
    status,
    message,
  }
  pushLocalTerminalBufferedEvent(localTerminalBuffers, sessionId, {
    kind: "status",
    sessionId,
    status,
    message,
  })
  postBridgeEvent(frame, LOCAL_TERMINAL_STATUS_EVENT, payload)
}

function pushLocalTerminalBufferedEvent(
  localTerminalBuffers: Map<string, OtoolsLocalTerminalBufferedEvent[]>,
  sessionId: string,
  event: OtoolsLocalTerminalBufferedEvent
) {
  const buffer = localTerminalBuffers.get(sessionId) ?? []
  buffer.push(event)

  if (buffer.length > MAX_LOCAL_TERMINAL_BUFFERED_EVENTS) {
    buffer.splice(0, buffer.length - MAX_LOCAL_TERMINAL_BUFFERED_EVENTS)
  }

  localTerminalBuffers.set(sessionId, buffer)
}


async function connectSshServerForFrame(
  frame: HTMLIFrameElement,
  payload: unknown,
  sshFrameSessions: Map<string, OtoolsSshFrameSession>
): Promise<unknown> {
  const record = asRecord(payload) ?? {}
  const config = asRecord(record.config) ?? record
  const sessionId =
    readStringField(config, "sessionId") ||
    readStringField(config, "session_id") ||
    readStringField(record, "sessionId") ||
    readStringField(record, "session_id")
  if (!sessionId) {
    throw new Error("session_id is required")
  }

  await ensureSshFrameSubscriptions(frame, sessionId, sshFrameSessions)

  try {
    return await getTransport().call("connect_ssh_server", {
      config: {
        server_id:
          readStringField(config, "serverId") ||
          readStringField(config, "server_id"),
        session_id: sessionId,
        host: readStringField(config, "host"),
        port: readNumberField(config, "port", 22),
        username: readStringField(config, "username"),
        auth_type:
          readStringField(config, "authType") ||
          readStringField(config, "auth_type") ||
          "password",
        password: readStringField(config, "password"),
        private_key_path:
          readStringField(config, "privateKeyPath") ||
          readStringField(config, "private_key_path"),
        passphrase: readStringField(config, "passphrase"),
      },
    })
  } catch (error) {
    postBridgeEvent(frame, SSH_CONNECTION_STATUS_EVENT, {
      sessionId,
      status: "error",
    })
    await disposeSshFrameSession(sshFrameSessions, sessionId)
    throw error
  }
}

async function sendSshInputForFrame(payload: unknown): Promise<void> {
  const record = asRecord(payload) ?? {}
  await getTransport().call("send_ssh_input", {
    serverId:
      readStringField(record, "serverId") ||
      readStringField(record, "server_id"),
    sessionId:
      readStringField(record, "sessionId") ||
      readStringField(record, "session_id"),
    input: readStringField(record, "input"),
  })
}

async function disconnectSshServerForFrame(
  payload: unknown,
  sshFrameSessions: Map<string, OtoolsSshFrameSession>
): Promise<void> {
  const record = asRecord(payload) ?? {}
  const sessionId =
    readStringField(record, "sessionId") ||
    readStringField(record, "session_id")
  await getTransport().call("disconnect_ssh_server", {
    serverId:
      readStringField(record, "serverId") ||
      readStringField(record, "server_id"),
    sessionId,
  })
  if (sessionId) {
    await disposeSshFrameSession(sshFrameSessions, sessionId)
  }
}

async function ensureSshFrameSubscriptions(
  frame: HTMLIFrameElement,
  sessionId: string,
  sshFrameSessions: Map<string, OtoolsSshFrameSession>
): Promise<void> {
  const existing = sshFrameSessions.get(sessionId)
  if (existing) {
    existing.refs += 1
    return
  }

  const session: OtoolsSshFrameSession = {
    unlistenOutput: null,
    unlistenStatus: null,
    refs: 1,
  }
  sshFrameSessions.set(sessionId, session)

  session.unlistenOutput = await getTransport().subscribe(
    SSH_OUTPUT_EVENT,
    (eventPayload) => {
      const body = asRecord(eventPayload) ?? {}
      const eventSessionId =
        readStringField(body, "sessionId") ||
        readStringField(body, "session_id")
      if (eventSessionId && eventSessionId !== sessionId) return
      postBridgeEvent(frame, SSH_OUTPUT_EVENT, {
        sessionId: eventSessionId || sessionId,
        output:
          typeof body.output === "string"
            ? body.output
            : String(body.output ?? ""),
      })
    }
  )

  session.unlistenStatus = await getTransport().subscribe(
    SSH_CONNECTION_STATUS_EVENT,
    (eventPayload) => {
      const body = asRecord(eventPayload) ?? {}
      const eventSessionId =
        readStringField(body, "sessionId") ||
        readStringField(body, "session_id")
      if (eventSessionId && eventSessionId !== sessionId) return
      const status = readStringField(body, "status") || "disconnected"
      postBridgeEvent(frame, SSH_CONNECTION_STATUS_EVENT, {
        sessionId: eventSessionId || sessionId,
        status,
      })
      if (status === "disconnected" || status === "error") {
        void disposeSshFrameSession(sshFrameSessions, sessionId)
      }
    }
  )
}

async function disposeSshFrameSession(
  sshFrameSessions: Map<string, OtoolsSshFrameSession>,
  sessionId: string
): Promise<void> {
  const session = sshFrameSessions.get(sessionId)
  if (!session) return
  sshFrameSessions.delete(sessionId)

  const unsubscribeTasks = [session.unlistenOutput, session.unlistenStatus]
    .filter(Boolean)
    .map((unsubscribe) =>
      Promise.resolve()
        .then(() => unsubscribe?.())
        .catch(() => {})
    )

  if (unsubscribeTasks.length > 0) {
    await Promise.allSettled(unsubscribeTasks)
  }
}

function postBridgeEvent(
  frame: HTMLIFrameElement,
  event: string,
  payload: unknown
) {
  frame.contentWindow?.postMessage(
    {
      type: "otools:host-event",
      event,
      payload,
    },
    "*"
  )
}

function isTerminalNotFoundError(error: unknown): boolean {
  return formatBridgeError(error).toLowerCase().includes("terminal not found")
}

function formatBridgeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPluginHostDispatcherMiss(error: unknown): boolean {
  const record = asRecord(error)
  const code =
    typeof record?.code === "string" ? record.code.toLowerCase() : ""
  const message =
    typeof record?.message === "string"
      ? record.message
      : formatBridgeError(error)
  return (
    code === "not_found" &&
    (message.includes("No OTools host dispatcher registered") ||
      message.includes("Unsupported otools-"))
  )
}

export async function loadOtoolsPluginDocument(
  entryUrl: string,
  plugin: OtoolsPluginInfo,
  hostInfo?: OtoolsHostInfo | null,
  options?: {
    currentBrowserUrl?: string | null
    initialLocaleSync?: { locale?: string | null } | null
    initialThemeSync?: {
      themeMode?: string | null
      themeAccent?: string | null
      resolvedTheme?: string | null
    } | null
    windowLabel?: string | null
  }
): Promise<string> {
  const html = await loadPluginAssetText(plugin.uuid, plugin.entry, entryUrl)
  const inlinedHtml = await inlinePluginDocumentAssets(html, entryUrl, plugin)
  const preload = await loadOtoolsPluginPreloadScript(plugin, entryUrl)
  return injectCompatBridge(
    inlinedHtml,
    entryUrl,
    plugin,
    hostInfo,
    options,
    preload
  )
}

async function loadPluginAssetText(
  pluginUuid: string,
  assetPath: string,
  fallbackUrl: string
): Promise<string> {
  try {
    const asset = await getOtoolsPluginAsset(pluginUuid, assetPath)
    return asset.text ?? decodeBase64Text(asset.dataBase64)
  } catch {
    const response = await fetch(fallbackUrl, {
      credentials: "same-origin",
    })
    if (!response.ok) {
      throw new Error(`Failed to load plugin entry (${response.status})`)
    }
    return response.text()
  }
}

async function loadOtoolsPluginPreloadScript(
  plugin: OtoolsPluginInfo,
  entryUrl: string
): Promise<{ filename: string; source: string } | null> {
  const candidates = []
  const declaredPreload =
    typeof plugin.preload === "string" ? plugin.preload.trim() : ""
  if (declaredPreload) {
    candidates.push(declaredPreload)
  }
  candidates.push("preload.js")

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const assetPath = String(candidate || "").trim()
    const key = assetPath.toLowerCase()
    if (!assetPath || seen.has(key)) {
      continue
    }
    seen.add(key)

    const fallbackUrl = resolvePluginPreloadFallbackUrl(assetPath, entryUrl)
    const source = await tryLoadPluginAssetText(
      plugin.uuid,
      assetPath,
      fallbackUrl
    )
    if (source && source.trim()) {
      return {
        filename: assetPath,
        source,
      }
    }
  }

  return null
}

async function tryLoadPluginAssetText(
  pluginUuid: string,
  assetPath: string,
  fallbackUrl: string | null
): Promise<string | null> {
  try {
    const asset = await getOtoolsPluginAsset(pluginUuid, assetPath)
    return asset.text ?? decodeBase64Text(asset.dataBase64)
  } catch {}

  if (!fallbackUrl) {
    return null
  }

  try {
    const response = await fetch(fallbackUrl, {
      credentials: "same-origin",
    })
    if (!response.ok) {
      return null
    }
    return response.text()
  } catch {
    return null
  }
}

function resolvePluginPreloadFallbackUrl(
  preloadPath: string,
  entryUrl: string
): string | null {
  const value = String(preloadPath || "").trim()
  if (!value || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) {
    return null
  }
  try {
    return new URL(value, entryUrl).toString()
  } catch {
    return null
  }
}

async function inlinePluginDocumentAssets(
  html: string,
  entryUrl: string,
  plugin: OtoolsPluginInfo
): Promise<string> {
  if (!plugin.assetBaseUrl && /^(https?|data):/i.test(entryUrl)) {
    return html
  }

  const withScripts = await replaceAsync(
    html,
    /<script\b([^>]*)\bsrc=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    async (match, before, _quote, source, after) => {
      const assetPath = resolvePluginAssetPath(source, entryUrl, plugin)
      if (!assetPath) return match
      try {
        const asset = await getOtoolsPluginAsset(plugin.uuid, assetPath)
        const text = asset.text ?? decodeBase64Text(asset.dataBase64)
        const attrs = `${before}${after}`
        return `<script${attrs}>${escapeScriptText(text)}</script>`
      } catch {
        return match
      }
    }
  )

  return replaceAsync(
    withScripts,
    /<link\b([^>]*?)\bhref=(["'])([^"']+)\2([^>]*?)>/gi,
    async (match, before, _quote, source, after) => {
      const attrs = `${before}${after}`
      if (!/\brel=(["'])stylesheet\1/i.test(attrs)) return match
      const assetPath = resolvePluginAssetPath(source, entryUrl, plugin)
      if (!assetPath) return match
      try {
        const asset = await getOtoolsPluginAsset(plugin.uuid, assetPath)
        const text = asset.text ?? decodeBase64Text(asset.dataBase64)
        return `<style>${escapeStyleText(text)}</style>`
      } catch {
        return match
      }
    }
  )
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacer: (...args: string[]) => Promise<string>
): Promise<string> {
  const matches = [...input.matchAll(pattern)]
  if (!matches.length) return input
  const replacements = await Promise.all(
    matches.map((match) => replacer(...(match as unknown as string[])))
  )
  let output = ""
  let lastIndex = 0
  matches.forEach((match, index) => {
    output += input.slice(lastIndex, match.index)
    output += replacements[index]
    lastIndex = (match.index ?? 0) + match[0].length
  })
  output += input.slice(lastIndex)
  return output
}

function resolvePluginAssetPath(
  value: string,
  entryUrl: string,
  plugin: OtoolsPluginInfo
): string | null {
  const raw = value.trim()
  if (!raw || /^(data|blob|javascript|mailto):/i.test(raw)) return null
  if (!plugin.assetBaseUrl && /^file:/i.test(entryUrl)) {
    try {
      const absolute = new URL(raw, new URL(".", entryUrl))
      return absolute.protocol === "file:" ? absolute.toString() : null
    } catch {
      return raw
    }
  }
  try {
    const absolute = new URL(raw, new URL(".", entryUrl))
    const marker = `/otools-assets/${plugin.uuid}/`
    const index = absolute.pathname.indexOf(marker)
    if (index >= 0) {
      return decodeURIComponent(absolute.pathname.slice(index + marker.length))
    }
    if (/^https?:\/\//i.test(raw) && !absolute.pathname.includes(marker)) {
      return null
    }
    return decodeURIComponent(absolute.pathname.replace(/^\/+/, ""))
  } catch {
    return raw.replace(/^\/+/, "")
  }
}

function decodeBase64Text(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function escapeScriptText(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script")
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style")
}

export async function dispatchOtoolsCommand(
  pluginUuid: string,
  command: string,
  payload: unknown
): Promise<unknown> {
  const targetPluginUuid = resolvePayloadPluginUuid(pluginUuid, payload)

  if (command === "get_init_error") {
    return null
  }

  if (DIRECT_TAURI_NOOP_COMMANDS.has(command)) {
    return true
  }

  if (OTOOLS_POPUP_COMMANDS.has(command)) {
    return dispatchOtoolsPopupCommand(command, payload)
  }

  if (command.startsWith("plugin:remote-service|")) {
    return dispatchOtoolsRemoteServiceCommand(command, payload)
  }

  if (command.startsWith("plugin:app|")) {
    return dispatchTauriAppCommand(command, payload)
  }

  if (command.startsWith("plugin:path|")) {
    return dispatchTauriPathCommand(command, payload)
  }

  if (command.startsWith("plugin:notification|")) {
    return dispatchTauriNotificationCommand(targetPluginUuid, command, payload)
  }

  if (command.startsWith("plugin:process|")) {
    return dispatchTauriProcessCommand(command, payload)
  }

  if (command.startsWith("plugin:updater|")) {
    return dispatchTauriUpdaterCommand(command)
  }

  if (command.startsWith("plugin:global-shortcut|")) {
    return dispatchTauriGlobalShortcutCommand(command, payload)
  }

  if (command.startsWith("plugin:")) {
    const handled = dispatchTauriPluginCompatCommand(command, payload)
    if (handled.handled) {
      return handled.value
    }
  }

  if (STATE_GET_COMMANDS.has(command)) {
    return getTransport().call(
      command,
      buildStateCommandPayload(targetPluginUuid, payload)
    )
  }
  if (STATE_SET_COMMANDS.has(command)) {
    return getTransport().call(command, {
      ...buildStateCommandPayload(targetPluginUuid, payload),
      state: extractStatePayload(payload),
    })
  }
  if (STATE_VALUE_GET_COMMANDS.has(command)) {
    return getTransport().call(command, {
      ...buildStateCommandPayload(targetPluginUuid, payload),
      key: extractKey(payload) ?? "",
    })
  }
  if (STATE_VALUE_SET_COMMANDS.has(command)) {
    return getTransport().call(command, {
      ...buildStateCommandPayload(targetPluginUuid, payload),
      key: extractKey(payload) ?? "",
      value: extractValuePayload(payload),
    })
  }
  if (STATE_PATCH_COMMANDS.has(command)) {
    return getTransport().call(command, {
      ...buildStateCommandPayload(targetPluginUuid, payload),
      patch: extractPatchPayload(payload) ?? {},
    })
  }

  if (FILESYSTEM_COMMANDS.has(command)) {
    return getTransport().call(command, asRecord(payload) ?? {})
  }

  if (PACKAGE_MANAGER_COMMANDS.has(command)) {
    return getTransport().call(command, asRecord(payload) ?? {})
  }

  if (HOST_COMMANDS.has(command)) {
    return getTransport().call(command, asRecord(payload) ?? {})
  }

  if (TOOLS_WEBVIEW_FORWARD_COMMANDS.has(command)) {
    return getTransport().call(command, asRecord(payload) ?? {})
  }

  if (CONFIG_COMMANDS.has(command)) {
    return dispatchConfigCommand(command, payload)
  }

  if (command === "save_http_file") {
    return getTransport().call("otools_host_http_write_base64_file", {
      filePath:
        readStringField(payload, "filePath") ||
        readStringField(payload, "file_path"),
      dataBase64:
        readStringField(payload, "dataBase64") ||
        readStringField(payload, "data_base64"),
    })
  }

  if (command === "otools_ai_load_chat_history") {
    return getTransport().call(command, {
      prefix: readStringField(payload, "prefix"),
    })
  }

  if (command === "otools_ai_save_chat_history") {
    return getTransport().call(command, {
      prefix: readStringField(payload, "prefix"),
      messages: readArrayField(payload, "messages"),
    })
  }

  if (command === "otools_host_repair_json_text") {
    return getTransport().call(command, {
      rawText: readStringField(payload, "rawText"),
    })
  }

  if (command === "otools_host_set_linux_privilege_password") {
    return getTransport().call(command, {
      password: readStringField(payload, "password"),
    })
  }

  if (command === "otools_get_plugins_file_path") {
    return getTransport().call(command)
  }

  if (command === "otools_emit_tools_shell_shortcut") {
    const action = normalizeToolsShellShortcutAction(
      readStringField(payload, "action")
    )
    if (!action) {
      throw new Error("Unsupported tools shell shortcut action")
    }
    try {
      await getShellTransport().call("otools_emit_tools_shell_shortcut", {
        action,
      })
      return true
    } catch {
      // Fallback for pure in-page shell when backend emit is unavailable.
      dispatchHostCustomEvent<OtoolsHostShellShortcutDetail>(
        OTOOLS_HOST_SHELL_SHORTCUT_EVENT,
        {
          action,
        }
      )
      return true
    }
  }

  if (OPEN_EXTERNAL_COMMANDS.has(command)) {
    const url = readStringField(payload, "url")
    try {
      return await getTransport().call("otools_shell_open_external", { url })
    } catch {
      return openUrl(url)
    }
  }

  if (OPEN_PATH_COMMANDS.has(command)) {
    const path = readStringField(payload, "path")
    try {
      return await getTransport().call("otools_shell_open_path", { path })
    } catch {
      return openPath(path)
    }
  }

  if (SHELL_OPEN_COMMANDS.has(command)) {
    return openOtoolsShellTarget(payload)
  }

  if (command === "open_directory" || command === "openWslUnc") {
    const path = readStringField(payload, "path")
    try {
      return await getTransport().call("otools_shell_open_path", { path })
    } catch {
      return openPath(path)
    }
  }

  if (REVEAL_ITEM_COMMANDS.has(command)) {
    const path = readFirstPathField(payload)
    try {
      return await getTransport().call("otools_shell_show_item_in_folder", {
        path,
      })
    } catch {
      return revealItemInDir(path)
    }
  }

  if (TRASH_ITEM_COMMANDS.has(command)) {
    const path = readStringField(payload, "path")
    try {
      await getTransport().call("otools_shell_trash_item", { path })
      return true
    } catch {
      if (path) await revealItemInDir(path)
      return false
    }
  }

  if (BEEP_COMMANDS.has(command)) {
    try {
      return await getTransport().call("otools_shell_beep")
    } catch {
      return
    }
  }

  if (COPY_TEXT_COMMANDS.has(command)) {
    return copyText(readStringField(payload, "text"))
  }

  if (COPY_FILE_COMMANDS.has(command)) {
    const paths = readStringArrayField(payload, "paths")
    try {
      return await getTransport().call("otools_copy_file", { paths })
    } catch {
      copiedHostFiles = paths
      return copiedHostFiles.length > 0
    }
  }

  if (COPY_IMAGE_COMMANDS.has(command)) {
    const image = readImagePayloadString(payload)
    try {
      return await getTransport().call("otools_copy_image", { image })
    } catch {
      return copyImagePayload(payload)
    }
  }

  if (GET_COPIED_FILES_COMMANDS.has(command)) {
    try {
      return await getTransport().call("otools_get_copied_files")
    } catch {
      return copiedHostFiles
    }
  }

  if (FILE_ICON_COMMANDS.has(command)) {
    try {
      return await getTransport().call("otools_get_file_icon", {
        path: readStringField(payload, "path"),
      })
    } catch {
      return ""
    }
  }

  if (UPLOAD_COMMANDS.has(command)) {
    const saved = await getTransport().call("upload_save_image", {
      fileName:
        readStringField(payload, "fileName") ||
        readStringField(payload, "file_name"),
      mime: readStringField(payload, "mime"),
      dataBase64:
        readStringField(payload, "dataBase64") ||
        readStringField(payload, "data_base64"),
      sourceModule:
        readOptionalStringField(payload, "sourceModule") ??
        readOptionalStringField(payload, "source_module"),
    })
    return normalizeUploadSavedImage(saved)
  }

  if (command === "otools_set_status_bar_state") {
    const detail = normalizeStatusBarDetail(targetPluginUuid, payload)
    dispatchHostCustomEvent<OtoolsHostStatusBarDetail>(
      OTOOLS_HOST_STATUS_BAR_EVENT,
      detail
    )

    if (canUseLocalDesktopHost()) {
      try {
        return await getShellTransport().call("otools_set_status_bar_state", {
          payload: {
            title: detail.title ?? null,
            tooltip: detail.tooltip ?? null,
            visible: detail.visible !== false,
          },
        })
      } catch {}
    }

    return {
      ok: true,
      payload: detail,
    }
  }

  if (NOTIFICATION_COMMANDS.has(command)) {
    const detail = normalizeNotificationDetail(targetPluginUuid, payload)
    dispatchHostCustomEvent<OtoolsHostNotificationDetail>(
      OTOOLS_HOST_NOTIFICATION_EVENT,
      detail
    )
    await sendSystemNotification(detail.title || "OTools", detail.body || "")
    return true
  }

  switch (command) {
    case "bridge_ping":
      return "invoke-ok"
    case "otools_list_plugins":
      return listOtoolsPluginsForBridge()
    case "otools_get_all_plugins":
      return listOtoolsPluginsForBridge()
    case "otools_reload_all_plugins": {
      const plugins = await reloadOtoolsPlugins()
      window.dispatchEvent(new Event(OTOOLS_HOST_RELOAD_PLUGINS_EVENT))
      return plugins.map(withMenuGitPluginCompat)
    }
    case "otools_request_app_exit":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_request_app_exit")
      }
      return closeCurrentWindow()
    case "show_main_window":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_show_main_window")
      }
      try {
        window.opener?.focus()
      } catch {}
      window.focus()
      return
    case "project_editor_open":
      return getTransport().call("project_editor_open", asRecord(payload) ?? {})
    case "project_runner_open_in_terminal":
      return getTransport().call(
        "project_runner_open_in_terminal",
        asRecord(payload) ?? {}
      )
    case "create_tools_tab_window":
      dispatchHostCustomEvent<OtoolsHostCreateTabDetail>(
        OTOOLS_HOST_CREATE_TAB_EVENT,
        {
          label: readStringField(payload, "label"),
          title: readOptionalStringField(payload, "title"),
          url: readOptionalStringField(payload, "url"),
          pluginUuid: readOptionalStringField(payload, "pluginUuid"),
        }
      )
      return true
    case "close_tools_tab_window":
      dispatchHostCustomEvent<OtoolsHostCloseTabDetail>(
        OTOOLS_HOST_CLOSE_TAB_EVENT,
        {
          label: readStringField(payload, "label"),
        }
      )
      return true
    case "switch_and_position_tools_windows":
      dispatchHostCustomEvent<OtoolsHostSwitchTabDetail>(
        OTOOLS_HOST_SWITCH_TAB_EVENT,
        {
          activeLabel: readOptionalStringField(payload, "activeLabel"),
          allLabels: readStringArrayField(payload, "allLabels"),
        }
      )
      return true
    case "tools_tab_exists":
      return hostTabExists(readStringField(payload, "label"))
    case "set_tools_loading_state":
      return true
    case "tools_sync_child_webview_theme":
      dispatchOtoolsChildThemeSync({
        themeMode: readOptionalStringField(payload, "themeMode"),
        themeAccent: readOptionalStringField(payload, "themeAccent"),
        resolvedTheme: readOptionalStringField(payload, "resolvedTheme"),
      } satisfies OtoolsHostChildThemeSyncDetail)
      return true
    case "tools_sync_child_webview_locale":
      dispatchOtoolsChildLocaleSync({
        locale: readOptionalStringField(payload, "locale"),
      } satisfies OtoolsHostChildLocaleSyncDetail)
      return true
    case "create_embedded_webview":
      dispatchHostCustomEvent<OtoolsHostCreateTabDetail>(
        OTOOLS_HOST_CREATE_TAB_EVENT,
        {
          label: readStringField(payload, "label"),
          title: readOptionalStringField(payload, "title"),
          url: readOptionalStringField(payload, "url"),
          pluginUuid:
            readOptionalStringField(payload, "pluginUuid") || targetPluginUuid,
        }
      )
      return true
    case "close_embedded_webview":
      dispatchHostCustomEvent<OtoolsHostCloseTabDetail>(
        OTOOLS_HOST_CLOSE_TAB_EVENT,
        {
          label: readStringField(payload, "label"),
        }
      )
      return true
    case "switch_and_position_embedded_webviews":
      dispatchHostCustomEvent<OtoolsHostSwitchTabDetail>(
        OTOOLS_HOST_SWITCH_TAB_EVENT,
        {
          activeLabel: readOptionalStringField(payload, "activeLabel"),
          allLabels: readStringArrayField(payload, "allLabels"),
        }
      )
      return true
    case "embedded_webview_exists":
      return hostTabExists(readStringField(payload, "label"))
    case "__otools_dialog_open":
    case "plugin:dialog|open":
      return openOtoolsFileDialog(payload)
    case "__otools_dialog_save":
    case "plugin:dialog|save":
      return saveDialog(extractDialogSaveOptions(payload))
    case "tools_webview_pick_files":
      return pickHostFiles(payload)
    case "tools_webview_pick_folder":
      return pickHostFolder(payload)
    case "tools_webview_pick_save_path":
      return pickHostSavePath(payload)
    case "__otools_dialog_message":
    case "plugin:dialog|message": {
      const message = readStringField(payload, "message")
      window.alert(message)
      return
    }
    case "__otools_dialog_confirm":
    case "plugin:dialog|confirm":
    case "__otools_dialog_ask":
    case "plugin:dialog|ask":
      return window.confirm(readStringField(payload, "message"))
    case "plugin:window|create":
    case "plugin:webview|create_webview_window":
      return openOtoolsShimWindow(targetPluginUuid, payload)
    case "__otools_poll_events":
      return getTransport().call("otools_poll_events")
    case "__otools_close_window":
    case "plugin:window|close":
      await closeCurrentOtoolsWindow(payload)
      return
    case "plugin:window|destroy":
      await closeCurrentOtoolsWindow(payload, true)
      return
    case "plugin:window|show":
      await showCurrentOtoolsWindow(payload)
      return
    case "plugin:window|hide":
      await hideCurrentOtoolsWindow(payload)
      return
    case "plugin:window|minimize":
      await minimizeCurrentOtoolsWindow(payload)
      return
    case "plugin:window|unminimize":
      await unminimizeCurrentOtoolsWindow(payload)
      return
    case "plugin:window|maximize":
      await maximizeCurrentOtoolsWindow(payload)
      return
    case "plugin:window|unmaximize":
      await unmaximizeCurrentOtoolsWindow(payload)
      return
    case "plugin:window|toggle_maximize":
      await toggleCurrentOtoolsWindowMaximize(payload)
      return
    case "plugin:window|is_focused":
      return document.hasFocus()
    case "plugin:window|is_visible":
      return !document.hidden
    case "plugin:window|is_enabled":
    case "plugin:window|is_decorated":
    case "plugin:window|is_resizable":
    case "plugin:window|is_maximizable":
    case "plugin:window|is_minimizable":
    case "plugin:window|is_closable":
      return true
    case "plugin:window|is_fullscreen":
    case "plugin:window|is_always_on_top":
    case "plugin:window|is_maximized":
    case "plugin:window|is_minimized":
      return false
    case "plugin:window|scale_factor":
      return getCurrentOtoolsWindowScaleFactor(payload)
    case "plugin:window|outer_position":
      return getCurrentOtoolsWindowOuterPosition(payload)
    case "plugin:window|inner_position":
      return getCurrentOtoolsWindowInnerPosition(payload)
    case "plugin:window|inner_size":
      return getCurrentOtoolsWindowInnerSize(payload)
    case "plugin:window|outer_size":
      return getCurrentOtoolsWindowOuterSize(payload)
    case "plugin:window|title":
      return document.title || "OTools"
    case "plugin:window|theme":
      return getCurrentOtoolsWindowTheme()
    case "plugin:window|current_monitor":
    case "plugin:window|primary_monitor":
    case "plugin:window|monitor_from_point":
      return null
    case "plugin:window|available_monitors":
      return []
    case "plugin:window|cursor_position":
      return {
        x: 0,
        y: 0,
      }
    case "plugin:window|center":
      await centerCurrentOtoolsWindow(payload)
      return
    case "plugin:window|request_user_attention":
      await requestCurrentOtoolsWindowAttention(payload)
      return
    case "plugin:window|set_title":
      await setCurrentOtoolsWindowTitle(payload)
      return
    case "plugin:window|set_resizable":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setResizable")
      return
    case "plugin:window|set_enabled":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setEnabled")
      return
    case "plugin:window|set_maximizable":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setMaximizable")
      return
    case "plugin:window|set_minimizable":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setMinimizable")
      return
    case "plugin:window|set_closable":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setClosable")
      return
    case "plugin:window|set_decorations":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setDecorations")
      return
    case "plugin:window|set_shadow":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setShadow")
      return
    case "plugin:window|set_always_on_bottom":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setAlwaysOnBottom")
      return
    case "plugin:window|set_content_protected":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setContentProtected")
      return
    case "plugin:window|set_always_on_top":
      await setCurrentOtoolsWindowAlwaysOnTop(payload)
      return
    case "plugin:window|set_ignore_cursor_events":
      await setCurrentOtoolsWindowIgnoreCursorEvents(payload)
      return
    case "plugin:window|set_position":
      await setCurrentOtoolsWindowPosition(payload)
      return
    case "plugin:window|set_size":
      await setCurrentOtoolsWindowSize(payload)
      return
    case "plugin:window|set_min_size":
      await setCurrentOtoolsWindowNoopMethod(payload, "setMinSize")
      return
    case "plugin:window|set_max_size":
      await setCurrentOtoolsWindowNoopMethod(payload, "setMaxSize")
      return
    case "plugin:window|set_size_constraints":
      await setCurrentOtoolsWindowNoopMethod(payload, "setSizeConstraints")
      return
    case "plugin:window|set_fullscreen":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setFullscreen")
      return
    case "plugin:window|set_simple_fullscreen":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setSimpleFullscreen")
      return
    case "plugin:window|set_focus":
      await focusCurrentOtoolsWindow(payload)
      return
    case "plugin:window|set_focusable":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setFocusable")
      return
    case "plugin:window|set_skip_taskbar":
      await setCurrentOtoolsWindowBooleanMethod(payload, "setSkipTaskbar")
      return
    case "plugin:window|set_background_color":
      await setCurrentOtoolsWindowNoopMethod(payload, "setBackgroundColor")
      return
    case "plugin:window|set_theme":
      await setCurrentOtoolsWindowNoopMethod(payload, "setTheme")
      return
    case "plugin:window|set_badge_count":
    case "plugin:window|set_badge_label":
    case "plugin:window|set_cursor_grab":
    case "plugin:window|set_cursor_icon":
    case "plugin:window|set_cursor_position":
    case "plugin:window|set_cursor_visible":
    case "plugin:window|set_effects":
    case "plugin:window|set_icon":
    case "plugin:window|set_overlay_icon":
    case "plugin:window|set_progress_bar":
    case "plugin:window|set_title_bar_style":
      await setCurrentOtoolsWindowNoopMethod(payload, command.split("|")[1])
      return
    case "plugin:window|set_visible_on_all_workspaces":
      await setCurrentOtoolsWindowVisibleOnAllWorkspaces(payload)
      return
    case "plugin:window|start_dragging":
      await setCurrentOtoolsWindowNoopMethod(payload, "startDragging")
      return
    case "plugin:window|start_resize_dragging":
      await setCurrentOtoolsWindowNoopMethod(payload, "startResizeDragging")
      return
    case "plugin:window|get_all_windows":
      return listCurrentOtoolsWindowLabels()
    case "plugin:webview|get_all_webviews":
      return listCurrentOtoolsWindowLabels().map((label) => ({
        label,
        windowLabel: label,
      }))
    case "plugin:webview|create_webview":
      return openOtoolsShimWindow(targetPluginUuid, payload)
    case "plugin:webview|webview_position":
      return getCurrentOtoolsWindowInnerPosition(payload)
    case "plugin:webview|webview_size":
      return getCurrentOtoolsWindowInnerSize(payload)
    case "plugin:webview|webview_close":
      await closeCurrentOtoolsWindow(payload)
      return
    case "plugin:webview|set_webview_size":
      await setCurrentOtoolsWindowSize(payload)
      return
    case "plugin:webview|set_webview_position":
      await setCurrentOtoolsWindowPosition(payload)
      return
    case "plugin:webview|set_webview_focus":
      await focusCurrentOtoolsWindow(payload)
      return
    case "plugin:webview|webview_hide":
      await hideCurrentOtoolsWindow(payload)
      return
    case "plugin:webview|webview_show":
      await showCurrentOtoolsWindow(payload)
      return
    case "plugin:webview|set_webview_auto_resize":
    case "plugin:webview|set_webview_zoom":
    case "plugin:webview|set_webview_background_color":
    case "plugin:webview|clear_all_browsing_data":
    case "plugin:webview|reparent":
      return
    case "otools_get_launch_at_startup":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_get_launch_at_startup")
      }
      return false
    case "otools_set_launch_at_startup":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_set_launch_at_startup", {
          enabled: readBooleanField(payload, "enabled"),
        })
      }
      if (readBooleanField(payload, "enabled")) {
        throw new Error("codeg-plus 暂未实现 launch-at-startup 宿主能力")
      }
      return false
    case "otools_get_global_shortcut_bindings":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_get_global_shortcut_bindings")
      }
      return []
    case "otools_get_global_shortcut_binding":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call("otools_get_global_shortcut_binding", {
          pluginUuid: readStringField(payload, "pluginUuid"),
        })
      }
      return null
    case "otools_upsert_global_shortcut_binding":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call(
          "otools_upsert_global_shortcut_binding",
          {
            binding: {
              pluginUuid: readStringField(payload, "pluginUuid"),
              shortcut: readStringField(payload, "shortcut"),
              enabled: readBooleanField(payload, "enabled"),
            },
          }
        )
      }
      throw new Error("网页模式不支持 OTools 全局快捷键")
    case "otools_remove_global_shortcut_binding":
      if (canUseLocalDesktopHost()) {
        return getShellTransport().call(
          "otools_remove_global_shortcut_binding",
          {
            pluginUuid: readStringField(payload, "pluginUuid"),
          }
        )
      }
      return
    default:
      break
  }

  if (command === "native_plugin_invoke") {
    const native = asRecord(payload)
    const method = native?.method ? String(native.method) : command
    if (method === "get_init_error") {
      return null
    }
    if (DIRECT_TAURI_NOOP_COMMANDS.has(method)) {
      return true
    }
    if (OTOOLS_POPUP_COMMANDS.has(method)) {
      return dispatchOtoolsPopupCommand(method, native?.payload ?? {})
    }
    return invokeOtoolsNative(
      resolvePayloadPluginUuid(targetPluginUuid, native),
      method,
      native?.payload
    )
  }

  if (command === "native_plugin_reload") {
    return reloadDevNativePlugin(
      resolvePayloadPluginUuid(targetPluginUuid, payload)
    )
  }

  if (command === "native_plugin_probe") {
    return probeDevNativePlugin(
      resolvePayloadPluginUuid(targetPluginUuid, payload)
    )
  }

  if (command === "native_plugin_poll_events") {
    return getTransport().call("native_plugin_poll_events", {
      uuid: resolvePayloadPluginUuid(targetPluginUuid, payload),
    })
  }

  if (command === "native_plugin_listen_acquire") {
    const body = asRecord(payload) ?? {}
    const rawInterval = body.intervalMs ?? body.interval_ms
    const intervalMs = Number(rawInterval)
    return getTransport().call(command, {
      uuid: targetPluginUuid,
      intervalMs: Number.isFinite(intervalMs) ? Math.floor(intervalMs) : null,
    })
  }

  if (command === "native_plugin_listen_release") {
    return getTransport().call(command, {
      uuid: targetPluginUuid,
    })
  }

  try {
    return await invokeOtoolsPluginCommand(targetPluginUuid, command, payload)
  } catch (error) {
    if (!isPluginHostDispatcherMiss(error)) {
      throw error
    }
  }

  return invokeOtoolsNative(targetPluginUuid, command, payload)
}

async function dispatchConfigCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  const body = asRecord(payload)
  switch (command) {
    case "get_otools_config":
      return getOtoolsConfig()
    case "save_otools_config":
      return saveOtoolsConfig(
        (body && "config" in body ? body.config : payload) as Awaited<
          ReturnType<typeof getOtoolsConfig>
        >
      )
    case "get_otools_config_value":
      return getOtoolsConfigValue(readStringField(payload, "key"))
    case "save_otools_config_value":
      return saveNormalizedConfigValue(
        readStringField(payload, "key"),
        body?.value ?? null
      )
    default:
      return null
  }
}

async function dispatchOtoolsPopupCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  return getTransport().call(command, asRecord(payload) ?? {})
}

async function dispatchTauriAppCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  const hostInfo = await readCachedOtoolsHostInfo()
  switch (command) {
    case "plugin:app|name":
      return readHostInfoString(hostInfo, "appName") || "codeg-plus"
    case "plugin:app|version":
      return readHostInfoString(hostInfo, "appVersion") || "0"
    case "plugin:app|tauri_version":
      return "2"
    case "plugin:app|identifier":
      return "com.codeg.plus"
    case "plugin:app|bundle_type":
      return "unknown"
    case "plugin:app|app_show":
      return showCurrentOtoolsWindow(payload)
    case "plugin:app|app_hide":
      return hideCurrentOtoolsWindow(payload)
    case "plugin:app|default_window_icon":
      return null
    case "plugin:app|set_app_theme":
    case "plugin:app|set_dock_visibility":
    case "plugin:app|remove_data_store":
      return
    case "plugin:app|fetch_data_store_identifiers":
      return []
    default:
      return null
  }
}

async function dispatchTauriPathCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  const hostInfo = await readCachedOtoolsHostInfo()
  switch (command) {
    case "plugin:path|resolve_directory": {
      const directory =
        readOptionalNumberValue(asRecord(payload)?.directory) ?? 0
      const base = resolveTauriBaseDirectory(hostInfo, directory)
      const child = readOptionalStringField(payload, "path")
      return child ? joinHostPathSegments([base, child], hostInfo) : base
    }
    case "plugin:path|join":
    case "plugin:path|resolve":
      return joinHostPathSegments(readStringArrayField(payload, "paths"), hostInfo)
    case "plugin:path|normalize":
      return normalizeHostPath(readStringField(payload, "path"), hostInfo)
    case "plugin:path|dirname":
      return dirnameHostPath(readStringField(payload, "path"), hostInfo)
    case "plugin:path|extname":
      return extnameHostPath(readStringField(payload, "path"))
    case "plugin:path|basename":
      return basenameHostPath(
        readStringField(payload, "path"),
        readOptionalStringField(payload, "ext")
      )
    case "plugin:path|is_absolute":
      return isAbsoluteHostPath(readStringField(payload, "path"))
    default:
      return ""
  }
}

async function dispatchTauriNotificationCommand(
  pluginUuid: string,
  command: string,
  payload: unknown
): Promise<unknown> {
  switch (command) {
    case "plugin:notification|is_permission_granted":
      if (typeof Notification === "undefined") {
        return true
      }
      return Notification.permission === "granted"
    case "plugin:notification|notify":
    case "plugin:notification|send":
    case "plugin:notification|show": {
      const detail = normalizeNotificationDetail(pluginUuid, payload)
      dispatchHostCustomEvent<OtoolsHostNotificationDetail>(
        OTOOLS_HOST_NOTIFICATION_EVENT,
        detail
      )
      await sendSystemNotification(detail.title || "OTools", detail.body || "")
      return
    }
    case "plugin:notification|get_pending":
    case "plugin:notification|get_active":
    case "plugin:notification|listChannels":
      return []
    case "plugin:notification|register_action_types":
    case "plugin:notification|cancel":
    case "plugin:notification|remove_active":
    case "plugin:notification|create_channel":
    case "plugin:notification|delete_channel":
      return
    default:
      return
  }
}

async function dispatchTauriProcessCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  switch (command) {
    case "plugin:process|exit":
      if (readOptionalNumberValue(asRecord(payload)?.code) === 0) {
        return
      }
      return
    case "plugin:process|restart":
      window.dispatchEvent(new Event(OTOOLS_HOST_RELOAD_PLUGINS_EVENT))
      return
    default:
      return
  }
}

async function dispatchTauriUpdaterCommand(command: string): Promise<unknown> {
  switch (command) {
    case "plugin:updater|check":
      return null
    case "plugin:updater|download":
    case "plugin:updater|install":
    case "plugin:updater|download_and_install":
      return
    default:
      return null
  }
}

async function dispatchTauriGlobalShortcutCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  switch (command) {
    case "plugin:global-shortcut|is_registered":
      void payload
      return false
    case "plugin:global-shortcut|register":
    case "plugin:global-shortcut|unregister":
    case "plugin:global-shortcut|unregister_all":
      return
    default:
      return
  }
}

function dispatchTauriPluginCompatCommand(
  command: string,
  payload: unknown
): { handled: boolean; value?: unknown } {
  if (command === "plugin:resources|close") {
    return { handled: true }
  }

  const matched = command.match(/^plugin:([^|]+)\|(.+)$/)
  if (!matched) {
    return { handled: false }
  }

  const plugin = matched[1]
  const action = matched[2]
  if (!plugin || !action) {
    return { handled: false }
  }

  switch (action) {
    case "check_permissions":
    case "request_permissions":
      return { handled: true, value: [] }
    default:
      return { handled: false }
  }
}

async function dispatchOtoolsRemoteServiceCommand(
  command: string,
  payload: unknown
): Promise<unknown> {
  const remoteCommand = command.replace(/^plugin:remote-service\|/, "")
  const record = asRecord(payload)

  switch (remoteCommand) {
    case "remote_service_shell_open":
      return openOtoolsShellTarget(record?.request ?? payload)
    case "remote_service_shell_open_path":
      return openOtoolsShellPath(readStringField(payload, "path"))
    case "remote_service_shell_show_item_in_folder":
      return revealOtoolsShellPath(readStringField(payload, "path"))
    case "remote_service_shell_trash_item":
      return trashOtoolsShellPath(readStringField(payload, "path"))
    case "remote_service_shell_open_external":
      return openOtoolsShellExternal(readStringField(payload, "url"))
    case "remote_service_shell_beep":
      return beepOtoolsShell()
    case "remote_service_pick_files":
      return pickHostFiles(record?.options ?? payload)
    case "remote_service_read_file":
      return getTransport().call("tools_webview_read_file", {
        path: readStringField(payload, "path"),
      })
    case "remote_service_pick_save_path":
      return pickHostSavePath(record?.options ?? payload)
    case "remote_service_pick_folder":
      return pickHostFolder(record?.options ?? payload)
    case "remote_service_write_file":
      return getTransport().call(
        "tools_webview_write_file",
        asRecord(record?.request) ?? {}
      )
    case "remote_service_list_dir":
      return getTransport().call("tools_webview_list_dir", {
        path: readStringField(payload, "path"),
      })
    case "remote_service_browse_dialog":
      return getTransport().call("tools_webview_browse_dialog", {
        path: readOptionalStringField(record?.request, "path"),
      })
    case "remote_service_home_dir":
      return getTransport().call("tools_webview_home_dir")
    case "remote_service_join_path":
      return getTransport().call("tools_webview_join_path", {
        parts: readStringArrayField(payload, "parts"),
      })
    case "remote_service_create_dir":
      return getTransport().call("tools_webview_create_dir", {
        path: readStringField(payload, "path"),
      })
    case "remote_service_touch_file":
      return getTransport().call("tools_webview_touch_file", {
        path: readStringField(payload, "path"),
      })
    case "remote_service_remove_entry":
      return getTransport().call("tools_webview_remove_entry", {
        path: readStringField(payload, "path"),
        recursive: readBooleanField(payload, "recursive"),
      })
    case "remote_service_rename_entry":
      return getTransport().call(
        "tools_webview_rename_entry",
        asRecord(record?.request) ?? {}
      )
    default:
      throw new Error(`Unsupported OTools remote service command: ${remoteCommand}`)
  }
}

function readCachedOtoolsHostInfo(): Promise<Record<string, unknown> | null> {
  if (!cachedOtoolsHostInfo) {
    cachedOtoolsHostInfo = getTransport()
      .call("otools_host_info")
      .then((value) => asRecord(value))
      .catch(() => null)
  }
  return cachedOtoolsHostInfo
}

function readHostInfoString(
  hostInfo: Record<string, unknown> | null,
  key: string
): string {
  const value = hostInfo?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function readHostInfoPaths(
  hostInfo: Record<string, unknown> | null
): Record<string, unknown> {
  return asRecord(hostInfo?.paths) ?? {}
}

function resolveTauriBaseDirectory(
  hostInfo: Record<string, unknown> | null,
  directory: number
): string {
  const paths = readHostInfoPaths(hostInfo)
  const byName = (name: string) =>
    typeof paths[name] === "string" ? String(paths[name]) : ""

  switch (directory) {
    case 1:
      return byName("music") || byName("home")
    case 2:
      return byName("cache") || byName("home")
    case 3:
      return byName("config") || byName("appData") || byName("home")
    case 4:
      return byName("data") || byName("appData") || byName("home")
    case 5:
      return byName("localData") || byName("data") || byName("home")
    case 6:
      return byName("documents") || byName("home")
    case 7:
      return byName("downloads") || byName("home")
    case 8:
      return byName("pictures") || byName("home")
    case 9:
      return byName("public") || byName("home")
    case 10:
      return byName("videos") || byName("home")
    case 11:
      return byName("resource") || byName("userData") || byName("home")
    case 12:
      return byName("temp") || byName("home")
    case 13:
      return byName("appConfig") || byName("userData") || byName("home")
    case 14:
      return byName("userData") || byName("appData") || byName("home")
    case 15:
      return byName("userData") || byName("localData") || byName("home")
    case 16:
      return byName("appCache") || byName("cache") || byName("userData") || byName("home")
    case 17:
      return byName("logs") || byName("userData") || byName("home")
    case 18:
      return byName("desktop") || byName("home")
    case 19:
      return byName("executable") || byName("home")
    case 20:
      return byName("font") || byName("home")
    case 21:
      return byName("home")
    case 22:
      return byName("runtime") || byName("temp") || byName("home")
    case 23:
      return byName("template") || byName("documents") || byName("home")
    default:
      return byName("home") || byName("userData") || ""
  }
}

function hostPathSeparator(
  hostInfo: Record<string, unknown> | null,
  sample = ""
): "\\" | "/" {
  const platform = readHostInfoString(hostInfo, "platform").toLowerCase()
  if (platform === "windows" || /^[A-Za-z]:[\\/]/.test(sample)) {
    return "\\"
  }
  return "/"
}

function joinHostPathSegments(
  parts: string[],
  hostInfo: Record<string, unknown> | null
): string {
  const filtered = parts.map((part) => part.trim()).filter(Boolean)
  if (!filtered.length) {
    return ""
  }

  const sep = hostPathSeparator(hostInfo, filtered[0])
  const first = filtered[0].replace(/[\\/]+$/, "")
  const rest = filtered
    .slice(1)
    .map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
  return normalizeHostPath([first, ...rest].join(sep), hostInfo)
}

function normalizeHostPath(
  path: string,
  hostInfo: Record<string, unknown> | null
): string {
  const raw = path.trim()
  if (!raw) {
    return ""
  }

  const sep = hostPathSeparator(hostInfo, raw)
  const prefix = /^[A-Za-z]:/.test(raw) ? raw.slice(0, 2) : raw.startsWith("/") ? "/" : ""
  const withoutPrefix = prefix && prefix !== "/" ? raw.slice(2) : raw
  const segments = withoutPrefix
    .split(/[\\/]+/)
    .filter((part) => part && part !== ".")
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === ".." && resolved.length && resolved[resolved.length - 1] !== "..") {
      resolved.pop()
    } else if (segment !== ".." || !prefix) {
      resolved.push(segment)
    }
  }

  if (prefix === "/") {
    return `${sep}${resolved.join(sep)}`
  }
  if (prefix) {
    const suffix = resolved.join(sep)
    return suffix ? `${prefix}${sep}${suffix}` : `${prefix}${sep}`
  }
  return resolved.join(sep)
}

function dirnameHostPath(
  path: string,
  hostInfo: Record<string, unknown> | null
): string {
  const normalized = normalizeHostPath(path, hostInfo).replace(/[\\/]+$/, "")
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"))
  if (index <= 0) {
    return isAbsoluteHostPath(normalized) ? normalized.slice(0, index + 1) : "."
  }
  return normalized.slice(0, index)
}

function basenameHostPath(path: string, ext: string | null): string {
  const name = readHostPathName(path, "")
  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length)
  }
  return name
}

function extnameHostPath(path: string): string {
  const name = readHostPathName(path, "")
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(index + 1) : ""
}

function isAbsoluteHostPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")
}

async function saveNormalizedConfigValue(
  key: string,
  value: unknown
): Promise<void> {
  const normalizedKey = String(key || "").trim()
  const normalizedValue = normalizeConfigValueForSave(normalizedKey, value)
  await saveOtoolsConfigValue(normalizedKey, normalizedValue)

  if (normalizedKey === OTOOLS_GLOBAL_BASIC_SETTINGS_KEY) {
    await syncBasicSettingsToHost(normalizedValue as Record<string, unknown>)
  }
}

function injectCompatBridge(
  html: string,
  entryUrl: string,
  plugin: OtoolsPluginInfo,
  hostInfo?: OtoolsHostInfo | null,
  options?: {
    currentBrowserUrl?: string | null
    initialLocaleSync?: { locale?: string | null } | null
    initialThemeSync?: {
      themeMode?: string | null
      themeAccent?: string | null
      resolvedTheme?: string | null
    } | null
    windowLabel?: string | null
  },
  preload?: { filename: string; source: string } | null
): string {
  const baseHref = new URL(".", entryUrl).toString()
  const script = `<script id="codeg-otools-bridge">${buildCompatBridgeScript(plugin, hostInfo, options)}</script>`
  const noderScript = `<script id="codeg-otools-noder" src="/otools/noder-runtime.js"></script>`
  const preloadScript = preload
    ? `<script id="codeg-otools-plugin-preload">${buildPluginPreloadScript(preload.source, preload.filename)}</script>`
    : ""
  const base = `<base href="${escapeHtml(baseHref)}" />`
  const pluginUuid = plugin.uuid
  const marker = `<meta name="codeg-otools-plugin" content="${escapeHtml(pluginUuid)}" />`
  const injected = `${base}${marker}${script}${noderScript}${preloadScript}`

  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${injected}`)
  }

  if (/<html(\s[^>]*)?>/i.test(html)) {
    return html.replace(
      /<html(\s[^>]*)?>/i,
      (match) => `${match}<head>${injected}</head>`
    )
  }

  return `<!doctype html><html><head>${injected}</head><body>${html}</body></html>`
}

function buildPluginPreloadScript(source: string, filename: string): string {
  return `;(${runOtoolsPluginPreload.toString()})(${serializeScriptArg(source)}, ${serializeScriptArg(filename)});`
}

function serializeScriptArg(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function runOtoolsPluginPreload(source: string, filename: string) {
  const safeFilename = String(filename || "preload.js")
  const sourceUrl = safeFilename.replace(/[\r\n]/g, " ")
  const module = { exports: {} }
  const dirname = sourceUrl.includes("/")
    ? sourceUrl.slice(0, sourceUrl.lastIndexOf("/"))
    : ""
  const requireCompat = (specifier) => {
    const noder = window.__OTOOLS_NODER__
    if (noder && typeof noder.require === "function") {
      return noder.require(specifier)
    }
    throw new Error(`OTools preload require is not available: ${specifier}`)
  }

  if (
    window.__OTOOLS_NODER__ &&
    typeof window.__OTOOLS_NODER__.runEntryModule === "function"
  ) {
    window.__OTOOLS_NODER__.runEntryModule(
      safeFilename,
      function (exports, require, module, __filename, __dirname, process, Buffer, global) {
        return new Function(
          "exports",
          "require",
          "module",
          "__filename",
          "__dirname",
          "process",
          "Buffer",
          "global",
          `${source}\n//# sourceURL=${sourceUrl}`
        )(exports, require, module, __filename, __dirname, process, Buffer, global)
      }
    )
    return
  }

  new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    "process",
    "Buffer",
    "global",
    `${source}\n//# sourceURL=${sourceUrl}`
  )(
    module.exports,
    requireCompat,
    module,
    safeFilename,
    dirname,
    null,
    window.Buffer,
    window
  )
}

function buildCompatBridgeScript(
  plugin: OtoolsPluginInfo,
  hostInfo?: OtoolsHostInfo | null,
  options?: {
    currentBrowserUrl?: string | null
    initialLocaleSync?: { locale?: string | null } | null
    initialThemeSync?: {
      themeMode?: string | null
      themeAccent?: string | null
      resolvedTheme?: string | null
    } | null
    windowLabel?: string | null
  }
): string {
  return `;(${otoolsCompatBootstrap.toString()})(${JSON.stringify({
    appName: hostInfo?.appName || "codeg-plus",
    appVersion: hostInfo?.appVersion || "0",
    isDev: hostInfo?.isDev === true,
    currentFolderPath: "",
    currentBrowserUrl:
      options?.currentBrowserUrl ||
      (typeof window !== "undefined" ? window.location.href : ""),
    nativeId: hostInfo?.nativeId || plugin.uuid,
    pluginPermissions: Array.isArray(plugin.permissions)
      ? plugin.permissions
      : [],
    paths: hostInfo?.paths ?? {},
    platform: hostInfo?.platform,
    pluginUuid: plugin.uuid,
    hostFileAuthToken: getActiveRemoteToken() || getCodegToken(),
    hostFileBaseUrl: getServerBaseUrl(),
    noderBridgeAuthToken: getActiveRemoteToken() || getCodegToken(),
    noderBridgeBaseUrl: resolveNoderBridgeBaseUrl(),
    useTauriAssetProtocol:
      isDesktop() && getActiveRemoteConnectionId() === null,
    initialLocaleSync: options?.initialLocaleSync ?? null,
    initialThemeSync: options?.initialThemeSync ?? null,
    windowLabel: String(options?.windowLabel || "").trim() || WINDOW_LABEL,
  })});`
}

function resolveNoderBridgeBaseUrl(): string {
  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    return ""
  }
  const baseUrl = getServerBaseUrl().replace(/\/+$/, "")
  return baseUrl ? `${baseUrl}/api/otools-noder` : "/api/otools-noder"
}

function otoolsCompatBootstrap(config: {
  appName: string
  appVersion: string
  currentFolderPath?: string
  currentBrowserUrl: string
  isDev?: boolean
  initialLocaleSync?: {
    locale?: string | null
  } | null
  initialThemeSync?: {
    themeMode?: string | null
    themeAccent?: string | null
    resolvedTheme?: string | null
  } | null
  nativeId?: string
  pluginPermissions?: string[]
  paths: Record<string, string>
  platform?: string
  pluginUuid: string
  hostFileAuthToken?: string
  hostFileBaseUrl?: string
  noderBridgeAuthToken?: string
  noderBridgeBaseUrl?: string
  useTauriAssetProtocol?: boolean
  windowLabel: string
}) {
  if (typeof window === "undefined" || window.otools) {
    return
  }

  const pluginUuid = String(config.pluginUuid || "").trim()
  const windowLabel = String(config.windowLabel || "otools")
  const currentPlatform = (() => {
    const hostPlatform = String(config.platform || "")
      .trim()
      .toLowerCase()
    if (
      hostPlatform === "macos" ||
      hostPlatform === "windows" ||
      hostPlatform === "linux"
    ) {
      return hostPlatform
    }
    const platform = String(navigator.platform || "").toLowerCase()
    if (platform.includes("mac")) return "macos"
    if (platform.includes("win")) return "windows"
    if (platform.includes("linux")) return "linux"
    return "unknown"
  })()

  const pending = new Map()
  const transformCallbacks = new Map()
  const eventListeners = new Map()
  const nativeListeners = new Set()
  const nativeListenerIntervals = new Map()
  const nativeListenerPluginRefs = new Map()
  let requestSeq = 0
  let callbackSeq = 0
  let eventSeq = 0
  let polling = false
  const defaultNativePollIntervalMs = 200
  const minNativePollIntervalMs = 50
  const maxNativePollIntervalMs = 10000
  const tauriSerializeToIpcKey = "__TAURI_TO_IPC_KEY__"
  const crossWindowEventBusName = "codeg:otools:event-bus"
  const crossWindowEventSourceId = `${windowLabel}:${Math.random()
    .toString(36)
    .slice(2)}`
  let crossWindowEventChannel = null

  const env = {
    appName: String(config.appName || "codeg-plus"),
    appVersion: String(config.appVersion || "0"),
    nativeId: String(config.nativeId || pluginUuid),
    pluginUuid,
    pluginPermissions: Array.isArray(config.pluginPermissions)
      ? config.pluginPermissions
      : undefined,
    platform: currentPlatform,
    isDev: config.isDev === true,
    currentFolderPath: String(config.currentFolderPath || "").trim(),
    currentBrowserUrl:
      String(config.currentBrowserUrl || "").trim() || window.location.href,
    noderBridgeAuthToken: String(config.noderBridgeAuthToken || "").trim(),
    noderBridgeBaseUrl: String(config.noderBridgeBaseUrl || "").trim(),
    paths: config.paths && typeof config.paths === "object" ? config.paths : {},
  }

  const toStringSafe = (value) => {
    if (value === null || value === undefined) {
      return ""
    }
    return String(value)
  }

  const trimRightSlash = (value) => toStringSafe(value).replace(/\/+$/, "")

  const normalizeLocalFilePath = (value) => {
    const raw = toStringSafe(value).trim()
    if (!raw) {
      return raw
    }

    if (raw.startsWith("file://")) {
      try {
        const url = new URL(raw)
        let path = decodeURIComponent(url.pathname)
        if (path.startsWith("/") && /^[A-Za-z]:/.test(path.slice(1))) {
          path = path.slice(1)
        }
        return path
      } catch {
        return raw
      }
    }

    return raw
  }

  const isLocalFilePath = (value) => {
    const raw = toStringSafe(value)
    return raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)
  }

  const convertHostFileSrc = (filePath, protocol = "asset") => {
    const normalized = normalizeLocalFilePath(filePath)
    if (!isLocalFilePath(normalized)) {
      return toStringSafe(filePath)
    }

    if (config.useTauriAssetProtocol === true) {
      const encoded = encodeURIComponent(normalized)
      return currentPlatform === "windows"
        ? `http://${protocol}.localhost/${encoded}`
        : `${protocol}://localhost/${encoded}`
    }

    const baseUrl =
      trimRightSlash(config.hostFileBaseUrl) || trimRightSlash(window.location.origin)
    if (!baseUrl) {
      return normalized
    }

    const params = new URLSearchParams()
    params.set("path", normalized)
    const token = toStringSafe(config.hostFileAuthToken).trim()
    if (token) {
      params.set("codegToken", token)
    }
    return `${baseUrl}/__tauri_remote_service_file__?${params.toString()}`
  }

  const OTOOLS_HOST_CHILD_THEME_SYNC_EVENT_NAME =
    "codeg:otools-child-theme-sync"
  const OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT_NAME =
    "codeg:otools-child-locale-sync"
  const OTOOLS_HOST_CHILD_THEME_SYNC_STORAGE_KEY =
    "codeg:otools-child-theme-sync:detail"
  const OTOOLS_HOST_CHILD_LOCALE_SYNC_STORAGE_KEY =
    "codeg:otools-child-locale-sync:detail"
  const OTOOLS_THEME_SYNC_BRIDGE_EVENT = "otools-theme-sync-requested"
  const OTOOLS_LOCALE_SYNC_BRIDGE_EVENT = "otools-locale-changed"
  const themeAccentToHostColor = {
    classic: "blue",
    violet: "violet",
    emerald: "green",
    amber: "orange",
    pink: "rose",
  }

  const applyInitialThemeSync = (detail) => {
    const themeMode = toStringSafe(detail && detail.themeMode).trim() || "system"
    const themeAccent =
      toStringSafe(detail && detail.themeAccent).trim() || "classic"
    const resolvedTheme =
      toStringSafe(detail && detail.resolvedTheme).trim() === "dark"
        ? "dark"
        : "light"

    const root = document.documentElement
    if (root) {
      root.classList.toggle("dark", resolvedTheme === "dark")
      root.classList.toggle("light", resolvedTheme === "light")
      root.style.colorScheme = resolvedTheme
      root.setAttribute("data-theme-mode", themeMode)
      root.setAttribute("data-theme-accent", themeAccent)
      root.setAttribute(
        "data-theme",
        themeAccentToHostColor[themeAccent] || themeAccentToHostColor.classic
      )
    }

    window.__OTOOLS_THEME__ = {
      themeMode,
      themeAccent,
      resolvedTheme,
    }
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(OTOOLS_THEME_SYNC_BRIDGE_EVENT, {
          detail: {
            themeMode,
            themeAccent,
            resolvedTheme,
          },
        })
      )
    }, 0)
  }

  const applyInitialLocaleSync = (detail) => {
    const locale = toStringSafe(detail && detail.locale).trim() || "en"
    const root = document.documentElement
    if (root) {
      root.setAttribute("lang", locale)
    }

    window.__OTOOLS_LOCALE__ = {
      locale,
    }
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(OTOOLS_LOCALE_SYNC_BRIDGE_EVENT, {
          detail: {
            locale,
          },
        })
      )
    }, 0)
  }

  window.addEventListener(OTOOLS_HOST_CHILD_THEME_SYNC_EVENT_NAME, (event) => {
    applyInitialThemeSync(event && event.detail)
  })
  window.addEventListener(OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT_NAME, (event) => {
    applyInitialLocaleSync(event && event.detail)
  })
  window.addEventListener("storage", (event) => {
    if (typeof event.newValue !== "string" || !event.newValue) {
      return
    }

    try {
      const parsed = JSON.parse(event.newValue)
      if (event.key === OTOOLS_HOST_CHILD_THEME_SYNC_STORAGE_KEY) {
        applyInitialThemeSync(parsed && parsed.detail)
        return
      }
      if (event.key === OTOOLS_HOST_CHILD_LOCALE_SYNC_STORAGE_KEY) {
        applyInitialLocaleSync(parsed && parsed.detail)
      }
    } catch {}
  })
  applyInitialThemeSync(config.initialThemeSync)
  applyInitialLocaleSync(config.initialLocaleSync)

  const normalizePluginUuid = (value) => {
    const raw = toStringSafe(value).trim()
    if (!raw) {
      return ""
    }

    const splitAt = raw.lastIndexOf(":")
    if (splitAt <= 0 || splitAt >= raw.length - 1) {
      return raw
    }

    const source = raw.slice(0, splitAt).trim().toLowerCase()
    const pluginId = raw.slice(splitAt + 1).trim()
    if (!pluginId) {
      return raw
    }

    if (
      source === "builtin" ||
      source === "market" ||
      source === "dev-debug" ||
      source === "dev-workspace"
    ) {
      return pluginId
    }

    return raw
  }

  const resolvePluginUuidFromLocation = () => {
    try {
      const params = new URLSearchParams(window.location.search || "")
      return normalizePluginUuid(
        params.get("plugin") ||
          params.get("pluginUuid") ||
          params.get("plugin_uuid") ||
          ""
      )
    } catch {
      return ""
    }
  }

  const resolvePluginUuid = (value) => {
    const direct = normalizePluginUuid(value)
    if (direct) return direct
    const fromEnv = normalizePluginUuid(env.pluginUuid)
    if (fromEnv) return fromEnv
    return resolvePluginUuidFromLocation()
  }

  const normalizeStateScheme = (scheme) => {
    const value = toStringSafe(scheme).trim()
    return value || null
  }

  const normalizeFileList = (input) => {
    if (!input) return []
    if (Array.isArray(input)) {
      return input.map((item) => toStringSafe(item).trim()).filter(Boolean)
    }
    const text = toStringSafe(input).trim()
    return text ? [text] : []
  }

  const toImagePayload = (image) => {
    if (!image) return null
    if (typeof image === "string") {
      const text = image.trim()
      if (!text) return null
      if (text.startsWith("data:")) {
        return { dataUrl: text }
      }
      return { dataBase64: text }
    }
    if (typeof image === "object") {
      return image
    }
    return null
  }

  const serializeIpcValue = (value, seen) => {
    if (value === null || value === undefined || typeof value !== "object") {
      return value
    }

    const serializer =
      typeof value[tauriSerializeToIpcKey] === "function"
        ? value[tauriSerializeToIpcKey]
        : typeof value.toJSON === "function"
          ? value.toJSON
          : null
    if (serializer) {
      return serializeIpcValue(serializer.call(value), seen)
    }

    const refs = seen || new WeakSet()
    if (refs.has(value)) {
      return null
    }
    refs.add(value)

    if (Array.isArray(value)) {
      const list = value.map((item) => serializeIpcValue(item, refs))
      refs.delete(value)
      return list
    }

    const record = {}
    for (const key of Object.keys(value)) {
      const serialized = serializeIpcValue(value[key], refs)
      if (serialized !== undefined) {
        record[key] = serialized
      }
    }
    refs.delete(value)
    return record
  }

  const postInvoke = (command, payload) => {
    const id = `${pluginUuid || "otools"}:${++requestSeq}`
    const serializedPayload = serializeIpcValue(payload ?? {})
    const directInvoke =
      typeof window.__OToolsBridgePostInvoke === "function"
        ? window.__OToolsBridgePostInvoke
        : null
    if (directInvoke) {
      return Promise.resolve(directInvoke(command, serializedPayload))
    }
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      window.parent.postMessage(
        {
          id,
          type: "otools:invoke",
          command,
          payload: serializedPayload,
        },
        "*"
      )
    })
  }

  const resolvePopupUrl = (path) => {
    const raw = toStringSafe(path).trim()
    if (!raw) {
      return ""
    }
    try {
      return new URL(raw).toString()
    } catch {
      return new URL(raw, window.location.origin).toString()
    }
  }

  const openOtoolsPopup = (path, command, payloadValue) => {
    const url = resolvePopupUrl(path)
    if (!url) {
      return
    }

    const popupId = `otools-popup-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
    const root = document.createElement("div")
    root.dataset.otoolsPopupId = popupId
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(15,23,42,0.45)",
      "backdrop-filter:blur(6px)",
    ].join(";")

    const panel = document.createElement("div")
    panel.style.cssText = [
      "position:relative",
      "display:flex",
      "flex-direction:column",
      "width:min(1120px,100%)",
      "height:min(760px,100%)",
      "overflow:hidden",
      "border-radius:16px",
      "border:1px solid rgba(148,163,184,0.28)",
      "background:#fff",
      "box-shadow:0 24px 80px rgba(15,23,42,0.28)",
    ].join(";")

    const closeButton = document.createElement("button")
    closeButton.type = "button"
    closeButton.textContent = "Close"
    closeButton.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "z-index:2",
      "border:0",
      "border-radius:999px",
      "padding:8px 12px",
      "background:rgba(15,23,42,0.72)",
      "color:#fff",
      "cursor:pointer",
    ].join(";")
    closeButton.addEventListener("click", () => root.remove())

    const iframe = document.createElement("iframe")
    iframe.dataset.otoolsPopupId = popupId
    iframe.dataset.otoolsPopupTarget = toStringSafe(command)
    iframe.src = url
    iframe.setAttribute(
      "sandbox",
      "allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
    )
    iframe.style.cssText = [
      "width:100%",
      "height:100%",
      "border:0",
      "background:#fff",
    ].join(";")
    if (payloadValue !== undefined) {
      iframe.dataset.otoolsPopupPayload = JSON.stringify(payloadValue)
    }

    panel.append(closeButton, iframe)
    root.append(panel)
    document.body.append(root)
  }

  const invokeOtoolsPopupCommand = async (command, payloadValue) => {
    const result = await postInvoke(command, payloadValue ?? {})
    const record = result && typeof result === "object" ? result : null
    const path = toStringSafe(record && record.path).trim()
    if (path) {
      openOtoolsPopup(path, command, payloadValue)
      return
    }
    return result
  }

  window.addEventListener("message", (event) => {
    const message = event.data
    if (message && message.type === "otools:host-event") {
      emitLocalEvent({
        event: toStringSafe(message.event).trim(),
        payload: message.payload ?? null,
      })
      return
    }
    if (message && message.type === "otools:native-event") {
      dispatchNativeEnvelope(message.payload)
      return
    }
    if (!message || message.type !== "otools:invoke-result") {
      return
    }
    const entry = pending.get(message.id)
    if (!entry) {
      return
    }
    pending.delete(message.id)
    if (message.ok) {
      entry.resolve(message.data)
    } else {
      entry.reject(new Error(message.error || "OTools invoke failed"))
    }
  })

  const transformCallback = (callback, once) => {
    const id = ++callbackSeq
    transformCallbacks.set(id, {
      callback,
      once: Boolean(once),
    })
    return id
  }

  const unregisterCallback = (id) => {
    const callbackId = parseCallbackChannelId(id)
    if (Number.isFinite(callbackId)) {
      transformCallbacks.delete(callbackId)
    }
  }

  const parseCallbackChannelId = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string") {
      const text = value.trim()
      if (!text) return Number.NaN
      const direct = Number(text)
      if (Number.isFinite(direct)) return direct
      const matched = text.match(/(?:__CHANNEL__|__TAURI_CHANNEL__):(\d+)$/)
      if (matched) return Number(matched[1])
    }
    if (value && typeof value === "object") {
      const serialized =
        typeof value.toJSON === "function"
          ? value.toJSON()
          : typeof value.__TAURI_TO_IPC_KEY__ === "function"
            ? value.__TAURI_TO_IPC_KEY__()
            : null
      return parseCallbackChannelId(serialized)
    }
    return Number.NaN
  }

  const fireTransformCallback = (id, payload) => {
    const entry = transformCallbacks.get(Number(id))
    if (!entry) {
      return
    }
    try {
      entry.callback(payload)
    } finally {
      if (entry.once) {
        transformCallbacks.delete(Number(id))
      }
    }
  }

  const readEventPayload = (payload) => {
    if (payload && typeof payload === "object" && "payload" in payload) {
      return payload.payload ?? null
    }
    return null
  }

  const normalizeEventTarget = (target) => {
    if (!target) {
      return null
    }
    if (typeof target === "string") {
      return {
        kind: "AnyLabel",
        label: target,
      }
    }
    if (typeof target === "object") {
      return target
    }
    return null
  }

  const matchesEventTarget = (target) => {
    const normalized = normalizeEventTarget(target)
    if (!normalized) {
      return true
    }

    const kind = toStringSafe(normalized.kind).trim()
    const label = toStringSafe(normalized.label).trim()

    if (!kind || kind === "Any" || kind === "App" || kind === "AnyLabel") {
      return !label || label === windowLabel
    }

    if (kind === "Current") {
      return true
    }

    if (
      kind === "Window" ||
      kind === "Webview" ||
      kind === "WebviewWindow"
    ) {
      return !label || label === windowLabel
    }

    return true
  }

  const dispatchLocalOtoolsEvent = (event, payloadValue, target) => {
    const name = toStringSafe(event).trim()
    if (!name || !matchesEventTarget(target)) {
      return
    }

    const data = {
      event: name,
      id: -1,
      payload: payloadValue ?? null,
    }

    for (const listener of eventListeners.values()) {
      if (listener.event !== name) continue
      if (listener.target && !matchesEventTarget(listener.target)) continue
      fireTransformCallback(listener.handlerId, data)
    }
  }

  const dispatchNativeEnvelope = (item) => {
    for (const listener of nativeListeners) {
      try {
        listener({ payload: item })
      } catch {}
    }

    const topic =
      item && typeof item === "object" && "topic" in item
        ? toStringSafe(item.topic)
        : ""

    if (!topic) {
      return
    }

    const pluginUuidFromPayload =
      item &&
      typeof item === "object" &&
      "pluginUuid" in item &&
      toStringSafe(item.pluginUuid).trim()
        ? toStringSafe(item.pluginUuid).trim()
        : pluginUuid
    const nativeEventName = pluginUuidFromPayload
      ? `otools-native:${pluginUuidFromPayload}`
      : ""

    for (const listener of eventListeners.values()) {
      if (listener.event !== topic && listener.event !== nativeEventName) {
        continue
      }
      fireTransformCallback(listener.handlerId, {
        event: listener.event,
        id: listener.id,
        payload:
          listener.event === nativeEventName
            ? {
                topic,
                payload:
                  item && typeof item === "object" && "payload" in item
                    ? item.payload
                    : null,
              }
            : item && typeof item === "object" && "payload" in item
              ? item.payload
              : null,
      })
    }
  }

  const retainNativePluginPoll = (uuid) => {
    const targetUuid = resolvePluginUuid(uuid)
    if (!targetUuid) {
      return ""
    }
    nativeListenerPluginRefs.set(
      targetUuid,
      Number(nativeListenerPluginRefs.get(targetUuid) || 0) + 1
    )
    return targetUuid
  }

  const releaseNativePluginPoll = (uuid) => {
    const targetUuid = resolvePluginUuid(uuid)
    if (!targetUuid) {
      return
    }
    const nextCount = Number(nativeListenerPluginRefs.get(targetUuid) || 0) - 1
    if (nextCount > 0) {
      nativeListenerPluginRefs.set(targetUuid, nextCount)
    } else {
      nativeListenerPluginRefs.delete(targetUuid)
    }
  }

  const normalizeNativePollInterval = (options) => {
    const value =
      options && typeof options === "object" && options.intervalMs != null
        ? Number(options.intervalMs)
        : defaultNativePollIntervalMs
    if (!Number.isFinite(value)) {
      return defaultNativePollIntervalMs
    }
    return Math.min(
      maxNativePollIntervalMs,
      Math.max(minNativePollIntervalMs, Math.floor(value))
    )
  }

  const currentNativePollInterval = () => {
    let interval = defaultNativePollIntervalMs
    for (const value of nativeListenerIntervals.values()) {
      interval = Math.min(interval, value)
    }
    return interval
  }

  const handleCrossWindowEventRecord = (record) => {
    if (!record || typeof record !== "object") {
      return
    }

    if (record.sourceId === crossWindowEventSourceId) {
      return
    }

    if (record.type !== "otools:event") {
      return
    }

    dispatchLocalOtoolsEvent(record.event, record.payload ?? null, record.target)
  }

  if (typeof BroadcastChannel === "function") {
    try {
      crossWindowEventChannel = new BroadcastChannel(crossWindowEventBusName)
      crossWindowEventChannel.addEventListener("message", (event) => {
        handleCrossWindowEventRecord(event.data)
      })
    } catch {}
  }

  if (!crossWindowEventChannel) {
    window.addEventListener("storage", (event) => {
      if (
        event.key !== crossWindowEventBusName ||
        typeof event.newValue !== "string" ||
        !event.newValue
      ) {
        return
      }

      try {
        handleCrossWindowEventRecord(JSON.parse(event.newValue))
      } catch {}
    })
  }

  const broadcastCrossWindowEvent = (event, payloadValue, target) => {
    const name = toStringSafe(event).trim()
    if (!name) {
      return
    }

    const record = {
      type: "otools:event",
      sourceId: crossWindowEventSourceId,
      event: name,
      payload: payloadValue ?? null,
      target: normalizeEventTarget(target),
    }

    if (crossWindowEventChannel) {
      try {
        crossWindowEventChannel.postMessage(record)
        return
      } catch {}
    }

    try {
      window.localStorage.setItem(crossWindowEventBusName, JSON.stringify(record))
      window.localStorage.removeItem(crossWindowEventBusName)
    } catch {}
  }

  const pollNativeLoop = async () => {
    if (polling) return
    polling = true

    while (nativeListeners.size > 0 || eventListeners.size > 0) {
      try {
        const [bridgeEvents, ...nativeEventGroups] = await Promise.all([
          postInvoke("__otools_poll_events", {}).catch(() => []),
          ...Array.from(nativeListenerPluginRefs.keys()).map((pluginUuid) =>
            postInvoke("native_plugin_poll_events", {
              uuid: pluginUuid,
            }).catch(() => [])
          ),
        ])

        for (const events of [bridgeEvents, ...nativeEventGroups]) {
          if (!Array.isArray(events)) {
            continue
          }
          for (const item of events) {
            dispatchNativeEnvelope(item)
          }
        }
      } catch {}

      await new Promise((resolve) =>
        window.setTimeout(resolve, currentNativePollInterval())
      )
    }

    polling = false
  }

  const acquireNativeListener = async (uuid, handler, options, filter) => {
    const targetUuid = resolvePluginUuid(uuid)
    if (typeof handler !== "function") {
      throw new Error("listenNative handler required")
    }

    const wrappedHandler = (event) => {
      if (typeof filter === "function" && !filter(event)) {
        return
      }
      handler(event)
    }
    nativeListeners.add(wrappedHandler)
    const intervalMs = normalizeNativePollInterval(options)
    nativeListenerIntervals.set(wrappedHandler, intervalMs)
    let useHostListen = false
    if (targetUuid) {
      try {
        await postInvoke("native_plugin_listen_acquire", {
          uuid: targetUuid,
          intervalMs,
        })
        useHostListen = true
      } catch {
        retainNativePluginPoll(targetUuid)
        void pollNativeLoop()
      }
    } else {
      void pollNativeLoop()
    }

    return async () => {
      nativeListeners.delete(wrappedHandler)
      nativeListenerIntervals.delete(wrappedHandler)
      if (useHostListen) {
        await postInvoke("native_plugin_listen_release", {
          uuid: targetUuid,
        }).catch(() => {})
      } else {
        releaseNativePluginPoll(targetUuid)
      }
    }
  }

  const registerEventListener = (payload) => {
    const event = toStringSafe(payload && payload.event).trim()
    const handlerId = parseCallbackChannelId(
      payload && (payload.handler || payload.channelId)
    )
    if (!event || !Number.isFinite(handlerId)) {
      throw new Error("plugin:event|listen requires event and handler")
    }

    const id = ++eventSeq
    const nativePluginUuid = retainNativePluginPoll(pluginUuid)
    eventListeners.set(id, {
      event,
      handlerId,
      id,
      nativePluginUuid,
      target: normalizeEventTarget(payload && payload.target),
    })
    void pollNativeLoop()
    return id
  }

  const unregisterEventListener = (payload) => {
    const eventId = Number(payload && (payload.eventId || payload.id))
    if (Number.isFinite(eventId)) {
      const listener = eventListeners.get(eventId)
      if (listener) {
        releaseNativePluginPoll(listener.nativePluginUuid)
        eventListeners.delete(eventId)
      }
      return
    }

    const handlerId = parseCallbackChannelId(payload && payload.channelId)
    if (!Number.isFinite(handlerId)) {
      return
    }
    for (const [id, listener] of eventListeners.entries()) {
      if (listener.handlerId !== handlerId) {
        continue
      }
      releaseNativePluginPoll(listener.nativePluginUuid)
      eventListeners.delete(id)
    }
  }

  const emitLocalEvent = (payload) => {
    dispatchLocalOtoolsEvent(
      payload && payload.event,
      readEventPayload(payload),
      payload && payload.target
    )
  }

  const emitSharedEvent = (payload) => {
    const event = toStringSafe(payload && payload.event).trim()
    if (!event) {
      return
    }

    const eventPayload = readEventPayload(payload)
    const target = payload && payload.target
    dispatchLocalOtoolsEvent(event, eventPayload, target)
    broadcastCrossWindowEvent(event, eventPayload, target)
  }

  const tauriInvoke = async (command, payload) => {
    if (command === "plugin:resources|close") {
      return
    }

    if (command === "get_init_error") {
      return null
    }

    if (DIRECT_TAURI_NOOP_COMMANDS.has(command)) {
      return true
    }

    if (OTOOLS_POPUP_COMMANDS.has(command)) {
      return invokeOtoolsPopupCommand(command, payload)
    }

    const legacyPluginCommand =
      typeof command === "string"
        ? command.match(/^plugin:([^|]+)\|(.+)$/)
        : null
    if (legacyPluginCommand) {
      const action = legacyPluginCommand[2]
      switch (action) {
        case "check_permissions":
        case "request_permissions":
          return []
        case "register_listener":
        case "registerListener":
          return registerEventListener(payload)
        case "remove_listener":
        case "removeListener":
          unregisterEventListener(payload)
          return
        default:
          break
      }
    }

    switch (command) {
      case "native_plugin_invoke": {
        const method = toStringSafe(payload && payload.method).trim()
        if (method === "get_init_error") {
          return null
        }
        if (DIRECT_TAURI_NOOP_COMMANDS.has(method)) {
          return true
        }
        if (OTOOLS_POPUP_COMMANDS.has(method)) {
          return invokeOtoolsPopupCommand(method, payload?.payload ?? {})
        }
        return postInvoke(command, payload ?? {})
      }
      case "native_plugin_listen_acquire": {
        const targetUuid = retainNativePluginPoll(
          payload && (payload.uuid || payload.pluginUuid || payload.plugin)
        )
        if (targetUuid) {
          try {
            releaseNativePluginPoll(targetUuid)
            return await postInvoke(command, payload ?? {})
          } catch {
            retainNativePluginPoll(targetUuid)
          }
        }
        void pollNativeLoop()
        return {
          ok: true,
          pluginUuid: targetUuid || pluginUuid,
        }
      }
      case "native_plugin_listen_release":
        try {
          return await postInvoke(command, payload ?? {})
        } catch {
          releaseNativePluginPoll(
            payload && (payload.uuid || payload.pluginUuid || payload.plugin)
          )
        }
        return {
          ok: true,
          pluginUuid,
        }
      case "plugin:event|listen":
        return registerEventListener(payload)
      case "plugin:event|unlisten":
        unregisterEventListener(payload)
        return
      case "plugin:event|emit":
      case "plugin:event|emit_to":
        emitSharedEvent(payload)
        return
      default:
        return postInvoke(command, payload ?? {})
    }
  }

  const installOtoolsBrowserBehaviorBridge = () => {
    if (window.__CODEG_OTOOLS_BROWSER_BEHAVIOR_BRIDGE__) {
      return
    }
    window.__CODEG_OTOOLS_BROWSER_BEHAVIOR_BRIDGE__ = true

    const log = (message) => {
      tauriInvoke("tools_webview_log", { message: toStringSafe(message) }).catch(
        () => {
          try {
            console.debug("[OTools][Bridge]", message)
          } catch {}
        }
      )
    }
    const isEditableKeyboardTarget = (target) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      if (target.isContentEditable) {
        return true
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return true
      }
      return Boolean(
        target.closest(".el-input, .el-textarea, [contenteditable='true']")
      )
    }
    const emitToolsShellShortcut = (action) => {
      tauriInvoke("otools_emit_tools_shell_shortcut", { action }).catch(() => {})
    }
    const originalWindowOpen = window.open
    window.open = function (url, target, features) {
      try {
        const opened = originalWindowOpen
          ? originalWindowOpen.call(window, url, target, features)
          : null
        if (opened) {
          return opened
        }
      } catch (error) {
        log(`window.open blocked: ${error}`)
      }
      try {
        const href = toStringSafe(url).trim()
        if (
          href &&
          href !== "about:blank" &&
          !href.toLowerCase().startsWith("javascript:")
        ) {
          window.location.href = href
        }
      } catch (error) {
        log(`window.open fallback failed: ${error}`)
      }
      return null
    }
    const shouldIgnoreAnchorHref = (href) => {
      const value = toStringSafe(href).trim()
      if (!value) return true
      const lower = value.toLowerCase()
      return (
        lower === "#" ||
        lower.startsWith("javascript:") ||
        lower.startsWith("about:") ||
        lower.startsWith("mailto:") ||
        lower.startsWith("tel:")
      )
    }
    document.addEventListener(
      "click",
      (event) => {
        try {
          if (event.defaultPrevented || event.button !== 0) return
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return
          }
          const target = event.target
          if (!target || typeof target.closest !== "function") return
          const anchor = target.closest("a")
          if (!anchor) return
          const href = anchor.getAttribute("href") || ""
          if (shouldIgnoreAnchorHref(href)) return
          const resolved = anchor.href || href
          if (shouldIgnoreAnchorHref(resolved)) return
          const targetAttr = (
            anchor.getAttribute("target") || ""
          ).toLowerCase()
          if (targetAttr && targetAttr !== "_self") {
            event.preventDefault()
            window.location.href = resolved
          }
        } catch (error) {
          log(`anchor click intercept failed: ${error}`)
        }
      },
      true
    )
    document.addEventListener(
      "keydown",
      (event) => {
        try {
          const hasPrimaryModifier = event.ctrlKey || event.metaKey
          if (!hasPrimaryModifier || event.altKey) return
          if (!event.shiftKey && toStringSafe(event.key).toLowerCase() === "w") {
            event.preventDefault()
            emitToolsShellShortcut("closeActiveTab")
            return
          }
          if (event.shiftKey || isEditableKeyboardTarget(event.target)) return
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            emitToolsShellShortcut("activatePrevTab")
            return
          }
          if (event.key === "ArrowRight") {
            event.preventDefault()
            emitToolsShellShortcut("activateNextTab")
          }
        } catch (error) {
          log(`keyboard shortcut intercept failed: ${error}`)
        }
      },
      true
    )
  }

  const installClipboardCompat = () => {
    const existing = navigator.clipboard || {}
    const originalWriteText =
      typeof existing.writeText === "function"
        ? existing.writeText.bind(existing)
        : null
    const originalWrite =
      typeof existing.write === "function" ? existing.write.bind(existing) : null
    const originalReadText =
      typeof existing.readText === "function"
        ? existing.readText.bind(existing)
        : null

    const arrayBufferToBase64 = (buffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ""
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      return btoa(binary)
    }
    const blobToDataUrl = (blob) => {
      if (typeof FileReader === "undefined") {
        return blob
          .arrayBuffer()
          .then(
            (buffer) =>
              `data:${blob.type || "application/octet-stream"};base64,${arrayBufferToBase64(buffer)}`
          )
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error)
        reader.onload = () => resolve(toStringSafe(reader.result))
        reader.readAsDataURL(blob)
      })
    }
    const writeTextCompat = async (text) => {
      const value = toStringSafe(text)
      try {
        if (originalWriteText) {
          await originalWriteText(value)
          return
        }
      } catch {}
      await tauriInvoke("__otools_copy_text", { text: value })
    }
    const writeCompat = async (items) => {
      let originalError = null
      try {
        if (originalWrite) {
          await originalWrite(items)
          return
        }
      } catch (error) {
        originalError = error
      }

      const list = Array.from(items || [])
      for (const item of list) {
        const types = Array.isArray(item?.types) ? item.types : []
        const textType = types.find((type) => /^text\//i.test(type))
        if (textType && typeof item.getType === "function") {
          const blob = await item.getType(textType)
          await writeTextCompat(await blob.text())
          return
        }

        const imageType = types.find((type) => /^image\//i.test(type))
        if (imageType && typeof item.getType === "function") {
          const blob = await item.getType(imageType)
          await tauriInvoke("otools_copy_image", {
            image: { dataUrl: await blobToDataUrl(blob) },
          })
          return
        }
      }

      throw originalError || new Error("Unsupported clipboard data")
    }
    const clipboard = Object.assign(Object.create(existing), {
      readText: originalReadText || (() => Promise.resolve("")),
      write: writeCompat,
      writeText: writeTextCompat,
    })

    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      })
    } catch {
      try {
        navigator.clipboard = clipboard
      } catch {}
    }
  }

  const installHostFileSystemAccessPolyfill = () => {
    if (window.__CODEG_OTOOLS_FS_ACCESS_POLYFILL__) {
      return
    }
    window.__CODEG_OTOOLS_FS_ACCESS_POLYFILL__ = true

    const textEncoder = new TextEncoder()
    const bytesToBase64 = (bytes) => {
      let binary = ""
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      return btoa(binary)
    }
    const base64ToBytes = (base64) => {
      const binary = atob(toStringSafe(base64))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }
    const joinPath = (base, name) => {
      const parent = toStringSafe(base).replace(/[\\/]+$/, "")
      const safeName = toStringSafe(name).replace(/[\\/]+/g, "")
      const sep = parent.includes("\\") ? "\\" : "/"
      return parent ? `${parent}${sep}${safeName}` : safeName
    }
    const normalizeAcceptFilters = (options) => {
      const filters = []
      const types = Array.isArray(options?.types) ? options.types : []
      for (const type of types) {
        const accept = type && typeof type === "object" ? type.accept : null
        if (!accept || typeof accept !== "object") {
          continue
        }
        const extensions = []
        for (const list of Object.values(accept)) {
          if (!Array.isArray(list)) continue
          for (const item of list) {
            const ext = toStringSafe(item).trim().replace(/^\./, "")
            if (ext) extensions.push(ext)
          }
        }
        if (extensions.length) {
          filters.push({
            name: toStringSafe(type.description).trim() || "Files",
            extensions,
          })
        }
      }
      const accept = toStringSafe(options?.accept).trim()
      if (accept && !filters.length) {
        const extensions = accept
          .split(",")
          .map((item) => item.trim().replace(/^\./, ""))
          .filter((item) => item && !item.includes("/"))
        if (extensions.length) {
          filters.push({ name: "Files", extensions })
        }
      }
      return filters
    }
    const normalizePickOptions = (options) => {
      const filters = normalizeAcceptFilters(options)
      return {
        directory:
          toStringSafe(options?.directory).trim() ||
          toStringSafe(options?.startIn).trim() ||
          undefined,
        filters: filters.length ? filters : undefined,
        multiple: options?.multiple === true,
        suggestedName: toStringSafe(options?.suggestedName).trim() || undefined,
        title: toStringSafe(options?.title).trim() || undefined,
      }
    }
    const readFilePayload = async (path) =>
      tauriInvoke("tools_webview_read_file", { path: toStringSafe(path) })
    const createFileFromMeta = async (meta) => {
      const record = meta && typeof meta === "object" ? meta : {}
      const payload = record.dataBase64 ? record : await readFilePayload(record.path)
      const bytes = base64ToBytes(payload?.dataBase64 || "")
      return new File([bytes], toStringSafe(payload?.name) || "file", {
        lastModified: Number(payload?.lastModified) || Date.now(),
        type: toStringSafe(payload?.mime),
      })
    }
    const createWritable = async (meta, options = {}) => {
      let buffer = new Uint8Array(0)
      let size = 0
      let position = 0
      const path = toStringSafe(meta?.path)
      if (options.keepExistingData && path) {
        try {
          const payload = await readFilePayload(path)
          buffer = base64ToBytes(payload?.dataBase64 || "")
          size = buffer.length
          position = size
        } catch {}
      }
      const ensureCapacity = (targetSize) => {
        if (targetSize <= buffer.length) return
        const next = new Uint8Array(Math.max(targetSize, buffer.length * 2, 1024))
        next.set(buffer.subarray(0, size))
        buffer = next
      }
      const writeBytes = (bytes, offset) => {
        const start =
          typeof offset === "number" && Number.isFinite(offset)
            ? Math.max(0, offset)
            : position
        const end = start + bytes.length
        ensureCapacity(end)
        buffer.set(bytes, start)
        size = Math.max(size, end)
        position = end
      }
      const toBytes = async (data) => {
        if (data instanceof Uint8Array) return data
        if (data instanceof ArrayBuffer) return new Uint8Array(data)
        if (ArrayBuffer.isView(data)) {
          return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        }
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          return new Uint8Array(await data.arrayBuffer())
        }
        if (typeof data === "string") return textEncoder.encode(data)
        return textEncoder.encode(toStringSafe(data))
      }
      const write = async (data) => {
        if (data && typeof data === "object" && "type" in data) {
          if (data.type === "seek") {
            position = Math.max(0, Number(data.position || 0))
            return
          }
          if (data.type === "truncate") {
            size = Math.max(0, Number(data.size || 0))
            ensureCapacity(size)
            position = Math.min(position, size)
            return
          }
          if (data.type === "write") {
            writeBytes(await toBytes(data.data ?? ""), data.position)
            return
          }
        }
        writeBytes(await toBytes(data))
      }
      const close = async () => {
        await tauriInvoke("tools_webview_write_file", {
          path,
          dataBase64: bytesToBase64(buffer.subarray(0, size)),
        })
      }
      const stream = new WritableStream({
        async write(chunk) {
          await write(chunk)
        },
        async close() {
          await close()
        },
      })
      stream.write = write
      stream.seek = async (nextPosition) => {
        position = Math.max(0, Number(nextPosition || 0))
      }
      stream.truncate = async (nextSize) => {
        size = Math.max(0, Number(nextSize || 0))
        ensureCapacity(size)
        position = Math.min(position, size)
      }
      stream.close = close
      return stream
    }

    class OtoolsFileSystemHandle {
      constructor(kind, name, path) {
        this.kind = kind
        this.name = toStringSafe(name)
        this._otools_path = toStringSafe(path)
      }

      async isSameEntry(other) {
        return Boolean(other && other._otools_path === this._otools_path)
      }
    }
    class OtoolsFileSystemFileHandle extends OtoolsFileSystemHandle {
      constructor(meta) {
        const record = meta && typeof meta === "object" ? meta : {}
        super("file", record.name || "file", record.path || "")
        this._otools_meta = { ...record, path: this._otools_path }
      }

      async getFile() {
        return createFileFromMeta(this._otools_meta)
      }

      async createWritable(options = {}) {
        return createWritable(this._otools_meta, options)
      }
    }
    class OtoolsFileSystemDirectoryHandle extends OtoolsFileSystemHandle {
      constructor(name, path) {
        super("directory", name || "folder", path || "")
      }

      async getFileHandle(name, options = {}) {
        const path = joinPath(this._otools_path, name)
        if (options.create === true) {
          await tauriInvoke("tools_webview_touch_file", { path })
        } else {
          await tauriInvoke("tools_webview_file_meta", { path })
        }
        return new OtoolsFileSystemFileHandle({ path, name: toStringSafe(name) })
      }

      async getDirectoryHandle(name, options = {}) {
        const path = joinPath(this._otools_path, name)
        if (options.create === true) {
          await tauriInvoke("tools_webview_create_dir", { path })
        } else {
          await tauriInvoke("tools_webview_list_dir", { path })
        }
        return new OtoolsFileSystemDirectoryHandle(name, path)
      }

      async removeEntry(name, options = {}) {
        await tauriInvoke("tools_webview_remove_entry", {
          path: joinPath(this._otools_path, name),
          recursive: options.recursive === true,
        })
      }

      async resolve(possibleDescendant) {
        const target = toStringSafe(possibleDescendant?._otools_path)
        if (!target || !target.startsWith(this._otools_path)) return null
        const relative = target.slice(this._otools_path.length).replace(/^[\\/]+/, "")
        return relative ? relative.split(/[\\/]+/) : []
      }

      async *entries() {
        const items = await tauriInvoke("tools_webview_list_dir", {
          path: this._otools_path,
        })
        for (const entry of Array.isArray(items) ? items : []) {
          const handle =
            entry.kind === "directory"
              ? new OtoolsFileSystemDirectoryHandle(entry.name, entry.path)
              : new OtoolsFileSystemFileHandle(entry)
          yield [entry.name, handle]
        }
      }

      async *keys() {
        for await (const [name] of this.entries()) yield name
      }

      async *values() {
        for await (const [, handle] of this.entries()) yield handle
      }

      [Symbol.asyncIterator]() {
        return this.entries()
      }
    }

    const defineGlobal = (key, value) => {
      try {
        Object.defineProperty(window, key, {
          configurable: true,
          value,
          writable: true,
        })
      } catch {
        window[key] = value
      }
    }
    defineGlobal("FileSystemHandle", OtoolsFileSystemHandle)
    defineGlobal("FileSystemFileHandle", OtoolsFileSystemFileHandle)
    defineGlobal("FileSystemDirectoryHandle", OtoolsFileSystemDirectoryHandle)
    defineGlobal("FileSystemWritableFileStream", WritableStream)

    const showOpenFilePicker = async (options = {}) => {
      const payload = normalizePickOptions(options)
      payload.multiple = options.multiple === true
      const result = await tauriInvoke("tools_webview_pick_files", {
        options: payload,
      })
      return (Array.isArray(result) ? result : []).map(
        (meta) => new OtoolsFileSystemFileHandle(meta)
      )
    }
    const showSaveFilePicker = async (options = {}) => {
      const result = await tauriInvoke("tools_webview_pick_save_path", {
        options: normalizePickOptions(options),
      })
      if (!result || !result.path) {
        throw new DOMException("Save cancelled", "AbortError")
      }
      return new OtoolsFileSystemFileHandle(result)
    }
    const showDirectoryPicker = async (options = {}) => {
      const result = await tauriInvoke("tools_webview_pick_folder", {
        options: normalizePickOptions(options),
      })
      if (!result || !result.path) {
        throw new DOMException("Directory selection cancelled", "AbortError")
      }
      return new OtoolsFileSystemDirectoryHandle(result.name, result.path)
    }
    const chooseFileSystemEntries = async (options = {}) => {
      if (options.type === "save-file") return showSaveFilePicker(options)
      if (options.type === "open-directory") return showDirectoryPicker(options)
      const handles = await showOpenFilePicker({
        ...options,
        multiple: options.multiple === true,
      })
      return options.multiple === true ? handles : handles[0]
    }
    defineGlobal("showOpenFilePicker", showOpenFilePicker)
    defineGlobal("showSaveFilePicker", showSaveFilePicker)
    defineGlobal("showDirectoryPicker", showDirectoryPicker)
    defineGlobal("chooseFileSystemEntries", chooseFileSystemEntries)

    try {
      const storage = navigator.storage || {}
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: storage,
      })
      Object.defineProperty(storage, "getDirectory", {
        configurable: true,
        value: async () => {
          const key = "__codeg_otools_fs_root"
          const stored = localStorage.getItem(key)
          if (stored) {
            const value = JSON.parse(stored)
            return new OtoolsFileSystemDirectoryHandle(value.name, value.path)
          }
          const handle = await showDirectoryPicker({ title: "Select storage root" })
          localStorage.setItem(
            key,
            JSON.stringify({ name: handle.name, path: handle._otools_path })
          )
          return handle
        },
      })
    } catch {}

    try {
      const permissions = navigator.permissions || {}
      Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: permissions,
      })
      const originalQuery =
        typeof permissions.query === "function"
          ? permissions.query.bind(permissions)
          : null
      Object.defineProperty(permissions, "query", {
        configurable: true,
        value: (descriptor) => {
          const name = toStringSafe(descriptor?.name)
          if (name === "file-system-read" || name === "file-system-write") {
            return Promise.resolve({ onchange: null, state: "granted" })
          }
          return originalQuery
            ? originalQuery(descriptor)
            : Promise.resolve({ onchange: null, state: "prompt" })
        },
      })
    } catch {}

    const originalInputClick = HTMLInputElement.prototype.click
    HTMLInputElement.prototype.click = function (...args) {
      if (this.type !== "file" || this.__codegOtoolsPickingFile) {
        return originalInputClick.apply(this, args)
      }
      this.__codegOtoolsPickingFile = true
      showOpenFilePicker({
        accept: this.accept,
        multiple: this.multiple,
      })
        .then(async (handles) => {
          if (typeof DataTransfer === "undefined") return
          const dataTransfer = new DataTransfer()
          for (const handle of handles) {
            dataTransfer.items.add(await handle.getFile())
          }
          Object.defineProperty(this, "files", {
            configurable: true,
            value: dataTransfer.files,
          })
          this.dispatchEvent(new Event("input", { bubbles: true }))
          this.dispatchEvent(new Event("change", { bubbles: true }))
        })
        .finally(() => {
          this.__codegOtoolsPickingFile = false
        })
      return undefined
    }
  }

  const dialog = {
    open(options) {
      return tauriInvoke("plugin:dialog|open", { options: options || {} })
    },
    save(options) {
      return tauriInvoke("plugin:dialog|save", { options: options || {} })
    },
    message(messageText, options) {
      const okButtonLabel =
        typeof options === "string"
          ? undefined
          : options && (options.okLabel ?? options.buttons?.ok)
      return tauriInvoke("plugin:dialog|message", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel: okButtonLabel,
        okButtonLabel,
      })
    },
    confirm(messageText, options) {
      const okButtonLabel =
        typeof options === "string" ? undefined : options && options.okLabel
      const cancelButtonLabel =
        typeof options === "string" ? undefined : options && options.cancelLabel
      return tauriInvoke("plugin:dialog|confirm", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel: okButtonLabel,
        cancelLabel: cancelButtonLabel,
        okButtonLabel,
        cancelButtonLabel,
      })
    },
    ask(messageText, options) {
      const yesButtonLabel =
        typeof options === "string" ? undefined : options && options.okLabel
      const noButtonLabel =
        typeof options === "string" ? undefined : options && options.cancelLabel
      return tauriInvoke("plugin:dialog|ask", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel: yesButtonLabel,
        cancelLabel: noButtonLabel,
        yesButtonLabel,
        noButtonLabel,
      })
    },
  }

  const shell = {
    open(path, openWith) {
      return tauriInvoke("__otools_shell_open", {
        path: toStringSafe(path),
        with: openWith ? toStringSafe(openWith) : undefined,
      })
    },
    openPath(path) {
      return tauriInvoke("__otools_open_path", { path: toStringSafe(path) })
    },
    showItemInFolder(path) {
      return tauriInvoke("__otools_reveal_item", { path: toStringSafe(path) })
    },
    trashItem(path) {
      return tauriInvoke("__otools_trash_item", { path: toStringSafe(path) })
    },
    openExternal(url) {
      return tauriInvoke("__otools_open_external", { url: toStringSafe(url) })
    },
    beep() {
      return tauriInvoke("__otools_shell_beep", {})
    },
  }

  const invokeStateCommand = (command, plugin, payload) => {
    const targetPlugin = resolvePluginUuid(plugin)
    if (!targetPlugin) {
      return Promise.reject(new Error("Plugin id missing"))
    }
    return tauriInvoke(command, {
      plugin: targetPlugin,
      ...(payload && typeof payload === "object" ? payload : {}),
    })
  }

  const permissions = Array.isArray(env.pluginPermissions)
    ? env.pluginPermissions.map((item) => toStringSafe(item).trim()).filter(Boolean)
    : []
  const fileIconCache =
    window.__OToolsFileIconCache &&
    typeof window.__OToolsFileIconCache === "object"
      ? window.__OToolsFileIconCache
      : {}
  window.__OToolsFileIconCache = fileIconCache
  if (!Array.isArray(window.__OToolsCopiedFiles)) {
    window.__OToolsCopiedFiles = []
  }
  const permissionSet = new Set(permissions.map((item) => item.toLowerCase()))
  const hasPermission = (name) => {
    const key = toStringSafe(name).trim().toLowerCase()
    return !key || permissionSet.has(key) || permissionSet.has("*")
  }
  const nodeRequire = (specifier) => {
    throw new Error(
      `Node require is unavailable in the codeg-plus OTools web runtime: ${toStringSafe(
        specifier
      )}`
    )
  }
  nodeRequire.resolve = (specifier) => toStringSafe(specifier)
  nodeRequire.cache = {}
  const createRequire = () => nodeRequire
  const tauriPathInternals = {
    sep: currentPlatform === "windows" ? "\\" : "/",
    delimiter: currentPlatform === "windows" ? ";" : ":",
  }
  const runtimeInfo = {
    isNoder: false,
    isNativeTauri: config.useTauriAssetProtocol === true,
    hasHostBridge: true,
    platform: currentPlatform,
    appName: toStringSafe(env.appName || "OTools"),
    appVersion: toStringSafe(env.appVersion || ""),
    pluginUuid: resolvePluginUuid(pluginUuid),
    env,
    permissionsRestricted: permissions.length > 0,
    permissions,
    hasPermission,
    versions: {
      app: toStringSafe(env.appVersion || ""),
      tauri: "2",
      otools: toStringSafe(env.appVersion || ""),
      codeg: toStringSafe(env.appVersion || ""),
    },
    dialog,
    shell,
    fs: null,
    path: tauriPathInternals,
    os: null,
    process: null,
    childProcess: null,
    require: nodeRequire,
    createRequire,
    builtinModules: [],
  }

  const baseApi = {
    dialog,
    runtime: runtimeInfo,
    shell,
    fs: null,
    path: tauriPathInternals,
    os: null,
    process: null,
    childProcess: null,
    require: nodeRequire,
    createRequire,
    listHostDir(path) {
      const target = toStringSafe(path).trim()
      if (!target) {
        return Promise.reject(new Error("path required"))
      }
      return tauriInvoke("tools_webview_list_dir", { path: target })
    },
    readHostFile(path) {
      const target = toStringSafe(path).trim()
      if (!target) {
        return Promise.reject(new Error("path required"))
      }
      return tauriInvoke("tools_webview_read_file", { path: target })
    },
    writeHostFile(request) {
      const body = request && typeof request === "object" ? request : {}
      const path = toStringSafe(body.path).trim()
      const dataBase64 = toStringSafe(body.dataBase64)
      if (!path) {
        return Promise.reject(new Error("path required"))
      }
      if (!dataBase64) {
        return Promise.reject(new Error("dataBase64 required"))
      }
      return tauriInvoke("tools_webview_write_file", { path, dataBase64 })
    },
    copyText(text) {
      void tauriInvoke("__otools_copy_text", {
        text: toStringSafe(text),
      }).catch(() => {})
      return true
    },
    copyFile(file) {
      const list = normalizeFileList(file)
      if (!list.length) {
        return false
      }
      window.__OToolsCopiedFiles = list
      void tauriInvoke("otools_copy_file", { paths: list }).catch(() => {})
      return true
    },
    copyImage(image) {
      const payload = toImagePayload(image)
      if (!payload) {
        return false
      }
      void tauriInvoke("otools_copy_image", { image: payload }).catch(() => {})
      return true
    },
    getCopyedFiles() {
      const cache = Array.isArray(window.__OToolsCopiedFiles)
        ? window.__OToolsCopiedFiles
        : []
      void tauriInvoke("otools_get_copied_files", {})
        .then((list) => {
          if (Array.isArray(list)) {
            window.__OToolsCopiedFiles = list
          }
        })
        .catch(() => {})
      return cache
    },
    getCopiedFiles() {
      return baseApi.getCopyedFiles()
    },
    showNotification(body, clickFeatureCode) {
      void tauriInvoke("__otools_show_notification", {
        body: toStringSafe(body),
        clickFeatureCode: clickFeatureCode
          ? toStringSafe(clickFeatureCode)
          : null,
      }).catch(() => {})
    },
    shellOpen(path, openWith) {
      return shell.open(path, openWith)
    },
    shellOpenPath(path) {
      const value = toStringSafe(path).trim()
      if (!value) return
      void tauriInvoke("__otools_open_path", { path: value }).catch(() => {})
    },
    shellTrashItem(path) {
      const value = toStringSafe(path).trim()
      if (!value) return
      void tauriInvoke("__otools_trash_item", { path: value }).catch(() => {})
    },
    shellShowItemInFolder(path) {
      const value = toStringSafe(path).trim()
      if (!value) return
      void tauriInvoke("__otools_reveal_item", { path: value }).catch(() => {})
    },
    shellOpenExternal(url) {
      const value = toStringSafe(url).trim()
      if (!value) return
      void tauriInvoke("__otools_open_external", { url: value }).catch(() => {})
    },
    shellBeep() {
      void tauriInvoke("__otools_shell_beep", {}).catch(() => {})
    },
    hostRunWingetInstall(packageName, options) {
      const target = toStringSafe(packageName).trim()
      if (!target) {
        return Promise.reject(new Error("packageName required"))
      }
      return tauriInvoke("otools_host_run_winget_install", {
        packageName: target,
        options: options && typeof options === "object" ? options : {},
      })
    },
    hostRunPackageAction(packageName, options) {
      const target = toStringSafe(packageName).trim()
      const payload = options && typeof options === "object" ? options : {}
      if (!target) {
        return Promise.reject(new Error("packageName required"))
      }
      return tauriInvoke("otools_host_run_package_action", {
        manager: payload.manager ?? null,
        packageName: target,
        action: payload.action ?? "install",
        version: payload.version ?? null,
      })
    },
    hostGetPackageStatus(packageName, options) {
      const target = toStringSafe(packageName).trim()
      const payload = options && typeof options === "object" ? options : {}
      if (!target) {
        return Promise.reject(new Error("packageName required"))
      }
      return tauriInvoke("otools_host_get_package_status", {
        manager: payload.manager ?? null,
        packageName: target,
        cask: payload.cask ?? null,
      })
    },
    hostGetPackagesStatus(packageNames, options) {
      const names = Array.isArray(packageNames)
        ? packageNames.map((item) => toStringSafe(item).trim()).filter(Boolean)
        : []
      const payload = options && typeof options === "object" ? options : {}
      if (!names.length) {
        return Promise.resolve([])
      }
      return tauriInvoke("otools_host_get_packages_status", {
        manager: payload.manager ?? null,
        packageNames: names,
        cask: payload.cask ?? null,
      })
    },
    statusBarAttach(payload) {
      return tauriInvoke("otools_set_status_bar_state", {
        payload: payload && typeof payload === "object" ? payload : {},
      })
    },
    getPluginUuid() {
      return resolvePluginUuid(pluginUuid)
    },
    getNativeId() {
      return toStringSafe(env.nativeId || "")
    },
    getAppName() {
      return toStringSafe(env.appName || "OTools")
    },
    getAppVersion() {
      return toStringSafe(env.appVersion || "")
    },
    getPath(name) {
      const key = toStringSafe(name)
      return toStringSafe(env.paths[key] || "")
    },
    getFileIcon(filePath) {
      const target = toStringSafe(filePath).trim()
      if (!target) {
        return ""
      }
      if (fileIconCache[target]) {
        return fileIconCache[target]
      }
      void tauriInvoke("otools_get_file_icon", { path: target })
        .then((icon) => {
          if (icon) {
            fileIconCache[target] = icon
          }
        })
        .catch(() => {})
      return ""
    },
    readCurrentFolderPath() {
      return toStringSafe(env.currentFolderPath || "")
    },
    readCurrentBrowserUrl() {
      return toStringSafe(env.currentBrowserUrl || window.location.href)
    },
    isDev() {
      return Boolean(env.isDev)
    },
    isMacOS() {
      return currentPlatform === "macos"
    },
    isWindows() {
      return currentPlatform === "windows"
    },
    isLinux() {
      return currentPlatform === "linux"
    },
    invokeNative(method, payload) {
      return tauriInvoke("native_plugin_invoke", {
        uuid: resolvePluginUuid(pluginUuid),
        method: toStringSafe(method).trim(),
        payload: payload ?? null,
      })
    },
    invokeNativeRaw(method, payload) {
      return tauriInvoke("native_plugin_invoke", {
        uuid: resolvePluginUuid(pluginUuid),
        method: toStringSafe(method).trim(),
        payload: payload ?? null,
      })
    },
    reloadNative() {
      return tauriInvoke("native_plugin_reload", {
        uuid: resolvePluginUuid(pluginUuid),
      })
    },
    probeNative() {
      return tauriInvoke("native_plugin_probe", {
        uuid: resolvePluginUuid(pluginUuid),
      })
    },
    invokeNativePlugin(uuid, method, payload) {
      return tauriInvoke("native_plugin_invoke", {
        uuid: resolvePluginUuid(uuid),
        method: toStringSafe(method).trim(),
        payload: payload ?? null,
      })
    },
    invokeNativePluginRaw(uuid, method, payload) {
      return tauriInvoke("native_plugin_invoke", {
        uuid: resolvePluginUuid(uuid),
        method: toStringSafe(method).trim(),
        payload: payload ?? null,
      })
    },
    reloadNativePlugin(uuid) {
      return tauriInvoke("native_plugin_reload", {
        uuid: resolvePluginUuid(uuid),
      })
    },
    probeNativePlugin(uuid) {
      return tauriInvoke("native_plugin_probe", {
        uuid: resolvePluginUuid(uuid),
      })
    },
    listenNative(handler, options) {
      return acquireNativeListener(pluginUuid, handler, options)
    },
    listenNativePlugin(uuid, handler, options) {
      const targetUuid = resolvePluginUuid(uuid)
      return acquireNativeListener(targetUuid, handler, options, (event) => {
        const eventPluginUuid =
          event &&
          event.payload &&
          typeof event.payload === "object" &&
          "pluginUuid" in event.payload
            ? toStringSafe(event.payload.pluginUuid)
            : ""
        if (eventPluginUuid && targetUuid) {
          return eventPluginUuid === targetUuid
        }
        const topic =
          event &&
          event.payload &&
          typeof event.payload === "object" &&
          "topic" in event.payload
            ? toStringSafe(event.payload.topic)
            : ""
        return !targetUuid || !topic || topic.includes(targetUuid)
      })
    },
    getPluginLocalState(plugin, scheme) {
      return invokeStateCommand(
        "get_otools_plugin_localstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
        }
      )
    },
    savePluginLocalState(plugin, state, scheme) {
      return invokeStateCommand(
        "save_otools_plugin_localstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          state: state ?? null,
        }
      )
    },
    getPluginLocalStateValue(plugin, key, scheme) {
      return invokeStateCommand(
        "get_otools_plugin_localstate_value_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          key: toStringSafe(key),
        }
      )
    },
    savePluginLocalStateValue(plugin, key, value, scheme) {
      return invokeStateCommand(
        "save_otools_plugin_localstate_value_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          key: toStringSafe(key),
          value: value ?? null,
        }
      )
    },
    patchPluginLocalState(plugin, patch, scheme) {
      return invokeStateCommand(
        "patch_otools_plugin_localstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          patch: patch ?? {},
        }
      )
    },
    getPluginSyncState(plugin, scheme) {
      return invokeStateCommand(
        "get_otools_plugin_syncstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
        }
      )
    },
    savePluginSyncState(plugin, state, scheme) {
      return invokeStateCommand(
        "save_otools_plugin_syncstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          state: state ?? null,
        }
      )
    },
    getPluginSyncStateValue(plugin, key, scheme) {
      return invokeStateCommand(
        "get_otools_plugin_syncstate_value_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          key: toStringSafe(key),
        }
      )
    },
    savePluginSyncStateValue(plugin, key, value, scheme) {
      return invokeStateCommand(
        "save_otools_plugin_syncstate_value_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          key: toStringSafe(key),
          value: value ?? null,
        }
      )
    },
    patchPluginSyncState(plugin, patch, scheme) {
      return invokeStateCommand(
        "patch_otools_plugin_syncstate_with_scheme",
        plugin,
        {
          scheme: normalizeStateScheme(scheme),
          patch: patch ?? {},
        }
      )
    },
    aiGenerateText(request) {
      return tauriInvoke("otools_ai_generate_text", {
        request: request && typeof request === "object" ? request : {},
      })
    },
    hostRepairJsonText(rawText) {
      return tauriInvoke("otools_host_repair_json_text", {
        rawText: toStringSafe(rawText),
      })
    },
    hostListListenProcesses() {
      return tauriInvoke("otools_host_list_listen_processes", {})
    },
    hostKillProcess(pid) {
      const id = Number(pid)
      if (!Number.isFinite(id) || id <= 0) {
        return Promise.reject(new Error("Invalid pid"))
      }
      return tauriInvoke("otools_host_kill_process", { pid: id })
    },
    hostScanStorageCatalog(catalog) {
      const list = Array.isArray(catalog) ? catalog : []
      if (!list.length) {
        return Promise.reject(new Error("catalog required"))
      }
      return tauriInvoke("otools_host_scan_storage_catalog", { catalog: list })
    },
    hostCleanStorageItems(catalog, ids) {
      const cat = Array.isArray(catalog) ? catalog : []
      const idList = Array.isArray(ids)
        ? ids.map((item) => toStringSafe(item).trim()).filter(Boolean)
        : []
      if (!cat.length) {
        return Promise.reject(new Error("catalog required"))
      }
      if (!idList.length) {
        return Promise.reject(new Error("ids required"))
      }
      return tauriInvoke("otools_host_clean_storage_items", {
        catalog: cat,
        ids: idList,
      })
    },
    hostCleanStoragePaths(entriesOrPaths) {
      if (Array.isArray(entriesOrPaths) && entriesOrPaths.length) {
        const first = entriesOrPaths[0]
        if (typeof first === "string") {
          const list = normalizeFileList(entriesOrPaths)
          if (!list.length) {
            return Promise.reject(new Error("paths required"))
          }
          return tauriInvoke("otools_host_clean_storage_paths", {
            entries: list.map((path) => ({
              itemId: "",
              itemName: "",
              path,
            })),
          })
        }
        return tauriInvoke("otools_host_clean_storage_paths", {
          entries: entriesOrPaths,
        })
      }
      return Promise.reject(new Error("entries required"))
    },
  }

  const api = new Proxy(baseApi, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver)
      }
      return undefined
    },
  })

  window.__OToolsEnv = env
  window.__OTOOLS_REMOTE_SERVICE__ = config.useTauriAssetProtocol !== true
  window.__TAURI_REMOTE_SERVICE__ = config.useTauriAssetProtocol !== true
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  window.__TAURI_INTERNALS__.plugins = window.__TAURI_INTERNALS__.plugins || {}
  window.__TAURI_INTERNALS__.plugins.path =
    window.__TAURI_INTERNALS__.plugins.path || tauriPathInternals
  window.__TAURI_INTERNALS__.invoke = tauriInvoke
  window.__TAURI_INTERNALS__.transformCallback = transformCallback
  window.__TAURI_INTERNALS__.unregisterCallback = unregisterCallback
  window.__TAURI_INTERNALS__.convertFileSrc = convertHostFileSrc
  window.__TAURI_INTERNALS__.metadata = {
    currentWebview: { label: windowLabel },
    currentWindow: { label: windowLabel },
  }
  const localTauriEvents = new Set(["tauri://created", "tauri://error"])
  class OtoolsCompatChannel {
    constructor(onmessage) {
      this.onmessage = typeof onmessage === "function" ? onmessage : () => {}
      this.id = transformCallback((message) => this.onmessage(message))
    }

    cleanupCallback() {
      unregisterCallback(this.id)
    }

    [tauriSerializeToIpcKey]() {
      return `__CHANNEL__:${this.id}`
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatResource {
    constructor(rid) {
      this.rid = rid
    }

    close() {
      return tauriInvoke("plugin:resources|close", { rid: this.rid })
    }
  }
  class OtoolsCompatPluginListener {
    constructor(plugin, event, channelId) {
      this.plugin = toStringSafe(plugin)
      this.event = toStringSafe(event)
      this.channelId = channelId
    }

    unregister() {
      return tauriInvoke(`plugin:${this.plugin}|remove_listener`, {
        event: this.event,
        channelId: this.channelId,
      })
    }
  }
  const addPluginListener = async (plugin, event, cb) => {
    const handler = new OtoolsCompatChannel(cb)
    try {
      await tauriInvoke(`plugin:${plugin}|register_listener`, {
        event,
        handler,
      })
    } catch {
      await tauriInvoke(`plugin:${plugin}|registerListener`, {
        event,
        handler,
      })
    }
    return new OtoolsCompatPluginListener(plugin, event, handler.id)
  }
  class OtoolsCompatLogicalSize {
    constructor(...args) {
      this.type = "Logical"
      const source = args.length === 1 ? args[0] : null
      const value = source && source.Logical ? source.Logical : source
      this.width = args.length === 1 ? value.width : args[0]
      this.height = args.length === 1 ? value.height : args[1]
    }

    toPhysical(scaleFactor) {
      return new OtoolsCompatPhysicalSize(
        this.width * scaleFactor,
        this.height * scaleFactor
      )
    }

    [tauriSerializeToIpcKey]() {
      return {
        width: this.width,
        height: this.height,
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatPhysicalSize {
    constructor(...args) {
      this.type = "Physical"
      const source = args.length === 1 ? args[0] : null
      const value = source && source.Physical ? source.Physical : source
      this.width = args.length === 1 ? value.width : args[0]
      this.height = args.length === 1 ? value.height : args[1]
    }

    toLogical(scaleFactor) {
      return new OtoolsCompatLogicalSize(
        this.width / scaleFactor,
        this.height / scaleFactor
      )
    }

    [tauriSerializeToIpcKey]() {
      return {
        width: this.width,
        height: this.height,
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatSize {
    constructor(size) {
      if (size && size.Logical) {
        this.size = new OtoolsCompatLogicalSize(size)
      } else if (size && size.Physical) {
        this.size = new OtoolsCompatPhysicalSize(size)
      } else {
        this.size = size
      }
    }

    toLogical(scaleFactor) {
      return this.size instanceof OtoolsCompatLogicalSize
        ? this.size
        : this.size.toLogical(scaleFactor)
    }

    toPhysical(scaleFactor) {
      return this.size instanceof OtoolsCompatPhysicalSize
        ? this.size
        : this.size.toPhysical(scaleFactor)
    }

    [tauriSerializeToIpcKey]() {
      return {
        [this.size.type]: {
          width: this.size.width,
          height: this.size.height,
        },
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatLogicalPosition {
    constructor(...args) {
      this.type = "Logical"
      const source = args.length === 1 ? args[0] : null
      const value = source && source.Logical ? source.Logical : source
      this.x = args.length === 1 ? value.x : args[0]
      this.y = args.length === 1 ? value.y : args[1]
    }

    toPhysical(scaleFactor) {
      return new OtoolsCompatPhysicalPosition(
        this.x * scaleFactor,
        this.y * scaleFactor
      )
    }

    [tauriSerializeToIpcKey]() {
      return {
        x: this.x,
        y: this.y,
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatPhysicalPosition {
    constructor(...args) {
      this.type = "Physical"
      const source = args.length === 1 ? args[0] : null
      const value = source && source.Physical ? source.Physical : source
      this.x = args.length === 1 ? value.x : args[0]
      this.y = args.length === 1 ? value.y : args[1]
    }

    toLogical(scaleFactor) {
      return new OtoolsCompatLogicalPosition(
        this.x / scaleFactor,
        this.y / scaleFactor
      )
    }

    [tauriSerializeToIpcKey]() {
      return {
        x: this.x,
        y: this.y,
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  class OtoolsCompatPosition {
    constructor(position) {
      if (position && position.Logical) {
        this.position = new OtoolsCompatLogicalPosition(position)
      } else if (position && position.Physical) {
        this.position = new OtoolsCompatPhysicalPosition(position)
      } else {
        this.position = position
      }
    }

    toLogical(scaleFactor) {
      return this.position instanceof OtoolsCompatLogicalPosition
        ? this.position
        : this.position.toLogical(scaleFactor)
    }

    toPhysical(scaleFactor) {
      return this.position instanceof OtoolsCompatPhysicalPosition
        ? this.position
        : this.position.toPhysical(scaleFactor)
    }

    [tauriSerializeToIpcKey]() {
      return {
        [this.position.type]: {
          x: this.position.x,
          y: this.position.y,
        },
      }
    }

    toJSON() {
      return this[tauriSerializeToIpcKey]()
    }
  }
  function buildLabelPayload(label, value) {
    const payload = { label: toStringSafe(label || windowLabel) }
    if (arguments.length >= 2) {
      payload.value = value
    }
    return payload
  }
  function shouldCreateTauriHandle(options) {
    return !(options && typeof options === "object" && options.skip)
  }
  function buildTauriCreateOptions(label, options) {
    const createOptions =
      options && typeof options === "object" ? { ...options } : {}
    if (
      createOptions.parent &&
      typeof createOptions.parent === "object" &&
      "label" in createOptions.parent
    ) {
      createOptions.parent = createOptions.parent.label
    }
    createOptions.label = toStringSafe(label || windowLabel)
    return { options: createOptions }
  }
  function readTauriHandleLabel(item) {
    if (typeof item === "string") return item
    if (item && typeof item === "object" && typeof item.label === "string") {
      return item.label
    }
    return windowLabel
  }
  class OtoolsCompatWindow {
    constructor(label, options = {}) {
      this.label = toStringSafe(label || windowLabel)
      this.listeners = Object.create(null)
      this.targetKind = "Window"
      if (shouldCreateTauriHandle(options)) {
        this.createPromise = tauriInvoke(
          "plugin:window|create",
          buildTauriCreateOptions(this.label, options)
        )
          .then(() => this.emit("tauri://created"))
          .catch((error) => this.emit("tauri://error", error))
      }
    }

    static async getByLabel(label) {
      const windows = await OtoolsCompatWindow.getAll()
      return windows.find((item) => item.label === label) || null
    }

    static async getAll() {
      const items = await tauriInvoke("plugin:window|get_all_windows", {})
      if (Array.isArray(items) && items.length) {
        return items.map(
          (item) => new OtoolsCompatWindow(readTauriHandleLabel(item), { skip: true })
        )
      }
      return [new OtoolsCompatWindow(windowLabel, { skip: true })]
    }

    static getCurrent() {
      return new OtoolsCompatWindow(windowLabel, { skip: true })
    }

    static async getFocusedWindow() {
      for (const item of await OtoolsCompatWindow.getAll()) {
        if (await item.isFocused()) {
          return item
        }
      }
      return null
    }

    _emitLocalTauriEvent(event, payloadValue) {
      for (const handler of [...(this.listeners[event] || [])]) {
        handler({
          event,
          id: -1,
          payload: payloadValue,
        })
      }
    }

    _handleTauriEvent(event, handler) {
      if (!localTauriEvents.has(event)) {
        return false
      }
      if (!(event in this.listeners)) {
        this.listeners[event] = [handler]
      } else {
        this.listeners[event].push(handler)
      }
      return true
    }

    listen(event, handler, options) {
      if (this._handleTauriEvent(event, handler)) {
        return Promise.resolve(() => {
          const listeners = this.listeners[event] || []
          listeners.splice(listeners.indexOf(handler), 1)
        })
      }
      return window.__TAURI__.event.listen(event, handler, {
        ...(options || {}),
        target: { kind: this.targetKind || "Window", label: this.label },
      })
    }

    once(event, handler, options) {
      if (localTauriEvents.has(event)) {
        let unlisten = null
        const onceHandler = (payloadValue) => {
          if (unlisten) {
            unlisten()
          }
          handler(payloadValue)
        }
        unlisten = () => {
          const listeners = this.listeners[event] || []
          listeners.splice(listeners.indexOf(onceHandler), 1)
        }
        this._handleTauriEvent(event, onceHandler)
        return Promise.resolve(unlisten)
      }
      return window.__TAURI__.event.once(event, handler, {
        ...(options || {}),
        target: { kind: this.targetKind || "Window", label: this.label },
      })
    }

    emit(event, payloadValue) {
      if (localTauriEvents.has(event)) {
        this._emitLocalTauriEvent(event, payloadValue)
        return Promise.resolve()
      }
      return window.__TAURI__.event.emit(event, payloadValue)
    }

    emitTo(target, event, payloadValue) {
      if (localTauriEvents.has(event)) {
        this._emitLocalTauriEvent(event, payloadValue)
        return Promise.resolve()
      }
      return window.__TAURI__.event.emitTo(target, event, payloadValue)
    }

    close() {
      return tauriInvoke("plugin:window|close", buildLabelPayload(this.label))
    }

    destroy() {
      return tauriInvoke("plugin:window|destroy", buildLabelPayload(this.label))
    }

    show() {
      return tauriInvoke("plugin:window|show", buildLabelPayload(this.label))
    }

    hide() {
      return tauriInvoke("plugin:window|hide", buildLabelPayload(this.label))
    }

    minimize() {
      return tauriInvoke("plugin:window|minimize", buildLabelPayload(this.label))
    }

    unminimize() {
      return tauriInvoke(
        "plugin:window|unminimize",
        buildLabelPayload(this.label)
      )
    }

    maximize() {
      return tauriInvoke("plugin:window|maximize", buildLabelPayload(this.label))
    }

    unmaximize() {
      return tauriInvoke(
        "plugin:window|unmaximize",
        buildLabelPayload(this.label)
      )
    }

    toggleMaximize() {
      return tauriInvoke(
        "plugin:window|toggle_maximize",
        buildLabelPayload(this.label)
      )
    }

    isFocused() {
      return tauriInvoke("plugin:window|is_focused", buildLabelPayload(this.label))
    }

    isVisible() {
      return tauriInvoke("plugin:window|is_visible", buildLabelPayload(this.label))
    }

    isEnabled() {
      return tauriInvoke("plugin:window|is_enabled", buildLabelPayload(this.label))
    }

    isFullscreen() {
      return tauriInvoke(
        "plugin:window|is_fullscreen",
        buildLabelPayload(this.label)
      )
    }

    isMaximized() {
      return tauriInvoke(
        "plugin:window|is_maximized",
        buildLabelPayload(this.label)
      )
    }

    isMinimized() {
      return tauriInvoke(
        "plugin:window|is_minimized",
        buildLabelPayload(this.label)
      )
    }

    isDecorated() {
      return tauriInvoke(
        "plugin:window|is_decorated",
        buildLabelPayload(this.label)
      )
    }

    isResizable() {
      return tauriInvoke(
        "plugin:window|is_resizable",
        buildLabelPayload(this.label)
      )
    }

    isMaximizable() {
      return tauriInvoke(
        "plugin:window|is_maximizable",
        buildLabelPayload(this.label)
      )
    }

    isMinimizable() {
      return tauriInvoke(
        "plugin:window|is_minimizable",
        buildLabelPayload(this.label)
      )
    }

    isClosable() {
      return tauriInvoke(
        "plugin:window|is_closable",
        buildLabelPayload(this.label)
      )
    }

    isAlwaysOnTop() {
      return tauriInvoke(
        "plugin:window|is_always_on_top",
        buildLabelPayload(this.label)
      )
    }

    scaleFactor() {
      return tauriInvoke("plugin:window|scale_factor", buildLabelPayload(this.label))
    }

    innerPosition() {
      return tauriInvoke(
        "plugin:window|inner_position",
        buildLabelPayload(this.label)
      )
    }

    outerPosition() {
      return tauriInvoke(
        "plugin:window|outer_position",
        buildLabelPayload(this.label)
      )
    }

    innerSize() {
      return tauriInvoke("plugin:window|inner_size", buildLabelPayload(this.label))
    }

    outerSize() {
      return tauriInvoke("plugin:window|outer_size", buildLabelPayload(this.label))
    }

    title() {
      return tauriInvoke("plugin:window|title", buildLabelPayload(this.label))
    }

    theme() {
      return tauriInvoke("plugin:window|theme", buildLabelPayload(this.label))
    }

    center() {
      return tauriInvoke("plugin:window|center", buildLabelPayload(this.label))
    }

    setFocus() {
      return tauriInvoke("plugin:window|set_focus", buildLabelPayload(this.label))
    }

    setTitle(value) {
      return tauriInvoke(
        "plugin:window|set_title",
        buildLabelPayload(this.label, value)
      )
    }

    setResizable(value) {
      return tauriInvoke(
        "plugin:window|set_resizable",
        buildLabelPayload(this.label, value)
      )
    }

    setEnabled(value) {
      return tauriInvoke(
        "plugin:window|set_enabled",
        buildLabelPayload(this.label, value)
      )
    }

    setMaximizable(value) {
      return tauriInvoke(
        "plugin:window|set_maximizable",
        buildLabelPayload(this.label, value)
      )
    }

    setMinimizable(value) {
      return tauriInvoke(
        "plugin:window|set_minimizable",
        buildLabelPayload(this.label, value)
      )
    }

    setClosable(value) {
      return tauriInvoke(
        "plugin:window|set_closable",
        buildLabelPayload(this.label, value)
      )
    }

    setSize(value) {
      return tauriInvoke(
        "plugin:window|set_size",
        buildLabelPayload(this.label, value)
      )
    }

    setMinSize(value) {
      return tauriInvoke(
        "plugin:window|set_min_size",
        buildLabelPayload(this.label, value)
      )
    }

    setMaxSize(value) {
      return tauriInvoke(
        "plugin:window|set_max_size",
        buildLabelPayload(this.label, value)
      )
    }

    setSizeConstraints(value) {
      return tauriInvoke(
        "plugin:window|set_size_constraints",
        buildLabelPayload(this.label, value)
      )
    }

    setPosition(value) {
      return tauriInvoke(
        "plugin:window|set_position",
        buildLabelPayload(this.label, value)
      )
    }

    setFullscreen(value) {
      return tauriInvoke(
        "plugin:window|set_fullscreen",
        buildLabelPayload(this.label, value)
      )
    }

    setSimpleFullscreen(value) {
      return tauriInvoke(
        "plugin:window|set_simple_fullscreen",
        buildLabelPayload(this.label, value)
      )
    }

    setAlwaysOnTop(value) {
      return tauriInvoke(
        "plugin:window|set_always_on_top",
        buildLabelPayload(this.label, value)
      )
    }

    setAlwaysOnBottom(value) {
      return tauriInvoke(
        "plugin:window|set_always_on_bottom",
        buildLabelPayload(this.label, value)
      )
    }

    setVisibleOnAllWorkspaces(value) {
      return tauriInvoke(
        "plugin:window|set_visible_on_all_workspaces",
        buildLabelPayload(this.label, value)
      )
    }

    setDecorations(value) {
      return tauriInvoke(
        "plugin:window|set_decorations",
        buildLabelPayload(this.label, value)
      )
    }

    setShadow(value) {
      return tauriInvoke(
        "plugin:window|set_shadow",
        buildLabelPayload(this.label, value)
      )
    }

    setContentProtected(value) {
      return tauriInvoke(
        "plugin:window|set_content_protected",
        buildLabelPayload(this.label, value)
      )
    }

    setFocusable(value) {
      return tauriInvoke(
        "plugin:window|set_focusable",
        buildLabelPayload(this.label, value)
      )
    }

    setSkipTaskbar(value) {
      return tauriInvoke(
        "plugin:window|set_skip_taskbar",
        buildLabelPayload(this.label, value)
      )
    }

    setIgnoreCursorEvents(value) {
      return tauriInvoke(
        "plugin:window|set_ignore_cursor_events",
        buildLabelPayload(this.label, value)
      )
    }

    setBackgroundColor(value) {
      return tauriInvoke(
        "plugin:window|set_background_color",
        buildLabelPayload(this.label, value)
      )
    }

    setTheme(value) {
      return tauriInvoke(
        "plugin:window|set_theme",
        buildLabelPayload(this.label, value)
      )
    }

    requestUserAttention(value) {
      return tauriInvoke(
        "plugin:window|request_user_attention",
        buildLabelPayload(this.label, value)
      )
    }

    startDragging() {
      return tauriInvoke(
        "plugin:window|start_dragging",
        buildLabelPayload(this.label)
      )
    }

    startResizeDragging(value) {
      return tauriInvoke(
        "plugin:window|start_resize_dragging",
        buildLabelPayload(this.label, value)
      )
    }
  }
  class OtoolsCompatWebview extends OtoolsCompatWindow {
    constructor(windowHandle, label, options) {
      const targetWindow =
        windowHandle && typeof windowHandle === "object"
          ? windowHandle
          : new OtoolsCompatWindow(windowLabel, { skip: true })
      const webviewLabel =
        typeof label === "string"
          ? label
          : typeof windowHandle === "string"
            ? windowHandle
            : windowLabel
      const createOptions = typeof label === "string" ? options : label
      super(webviewLabel, { skip: true })
      this.window = targetWindow
      this.targetKind = "Webview"
      if (shouldCreateTauriHandle(createOptions)) {
        this.createPromise = tauriInvoke("plugin:webview|create_webview", {
          windowLabel: toStringSafe(targetWindow.label || windowLabel),
          ...buildTauriCreateOptions(this.label, createOptions),
        })
          .then(() => this.emit("tauri://created"))
          .catch((error) => this.emit("tauri://error", error))
      }
    }

    static async getByLabel(label) {
      const webviews = await OtoolsCompatWebview.getAll()
      return webviews.find((item) => item.label === label) || null
    }

    static getCurrent() {
      return new OtoolsCompatWebview(
        new OtoolsCompatWindow(windowLabel, { skip: true }),
        windowLabel,
        { skip: true }
      )
    }

    static async getAll() {
      const items = await tauriInvoke("plugin:webview|get_all_webviews", {})
      if (Array.isArray(items) && items.length) {
        return items.map((item) => {
          const record = item && typeof item === "object" ? item : {}
          return new OtoolsCompatWebview(
            new OtoolsCompatWindow(record.windowLabel || windowLabel, {
              skip: true,
            }),
            readTauriHandleLabel(item),
            { skip: true }
          )
        })
      }
      return [OtoolsCompatWebview.getCurrent()]
    }

    position() {
      return tauriInvoke(
        "plugin:webview|webview_position",
        buildLabelPayload(this.label)
      )
    }

    size() {
      return tauriInvoke(
        "plugin:webview|webview_size",
        buildLabelPayload(this.label)
      )
    }

    setPosition(value) {
      return tauriInvoke(
        "plugin:webview|set_webview_position",
        buildLabelPayload(this.label, value)
      )
    }

    setSize(value) {
      return tauriInvoke(
        "plugin:webview|set_webview_size",
        buildLabelPayload(this.label, value)
      )
    }

    setFocus() {
      return tauriInvoke(
        "plugin:webview|set_webview_focus",
        buildLabelPayload(this.label)
      )
    }

    close() {
      return tauriInvoke(
        "plugin:webview|webview_close",
        buildLabelPayload(this.label)
      )
    }

    hide() {
      return tauriInvoke(
        "plugin:webview|webview_hide",
        buildLabelPayload(this.label)
      )
    }

    show() {
      return tauriInvoke(
        "plugin:webview|webview_show",
        buildLabelPayload(this.label)
      )
    }

    setAutoResize(value) {
      return tauriInvoke(
        "plugin:webview|set_webview_auto_resize",
        buildLabelPayload(this.label, value)
      )
    }

    setZoom(value) {
      return tauriInvoke(
        "plugin:webview|set_webview_zoom",
        buildLabelPayload(this.label, value)
      )
    }

    reparent(value) {
      return tauriInvoke(
        "plugin:webview|reparent",
        buildLabelPayload(this.label, value)
      )
    }

    clearAllBrowsingData() {
      return tauriInvoke(
        "plugin:webview|clear_all_browsing_data",
        buildLabelPayload(this.label)
      )
    }

    setBackgroundColor(value) {
      return tauriInvoke(
        "plugin:webview|set_webview_background_color",
        buildLabelPayload(this.label, value)
      )
    }
  }
  class OtoolsCompatWebviewWindow extends OtoolsCompatWindow {
    constructor(label, options = {}) {
      super(label, { skip: true })
      this.targetKind = "WebviewWindow"
      if (shouldCreateTauriHandle(options)) {
        this.createPromise = tauriInvoke(
          "plugin:webview|create_webview_window",
          buildTauriCreateOptions(this.label, options)
        )
          .then(() => this.emit("tauri://created"))
          .catch((error) => this.emit("tauri://error", error))
      }
    }

    static async getByLabel(label) {
      const windows = await OtoolsCompatWebviewWindow.getAll()
      return windows.find((item) => item.label === label) || null
    }

    static getCurrent() {
      return new OtoolsCompatWebviewWindow(windowLabel, { skip: true })
    }

    static async getAll() {
      const items = await tauriInvoke("plugin:window|get_all_windows", {})
      if (Array.isArray(items) && items.length) {
        return items.map(
          (item) =>
            new OtoolsCompatWebviewWindow(readTauriHandleLabel(item), {
              skip: true,
            })
        )
      }
      return [OtoolsCompatWebviewWindow.getCurrent()]
    }

    position() {
      return tauriInvoke(
        "plugin:webview|webview_position",
        buildLabelPayload(this.label)
      )
    }

    size() {
      return tauriInvoke(
        "plugin:webview|webview_size",
        buildLabelPayload(this.label)
      )
    }

    setBackgroundColor(value) {
      return tauriInvoke(
        "plugin:window|set_background_color",
        buildLabelPayload(this.label, value)
      ).then(() =>
        tauriInvoke(
          "plugin:webview|set_webview_background_color",
          buildLabelPayload(this.label, value)
        )
      )
    }
  }
  const currentWindowHandle = new OtoolsCompatWindow(windowLabel, { skip: true })
  const currentWebviewHandle = new OtoolsCompatWebview(
    currentWindowHandle,
    windowLabel,
    { skip: true }
  )
  const currentWebviewWindowHandle = new OtoolsCompatWebviewWindow(windowLabel, {
    skip: true,
  })
  const tauriEventConstants = {
    WINDOW_RESIZED: "tauri://resize",
    WINDOW_MOVED: "tauri://move",
    WINDOW_CLOSE_REQUESTED: "tauri://close-requested",
    WINDOW_DESTROYED: "tauri://destroyed",
    WINDOW_FOCUS: "tauri://focus",
    WINDOW_BLUR: "tauri://blur",
    WINDOW_SCALE_FACTOR_CHANGED: "tauri://scale-change",
    WINDOW_THEME_CHANGED: "tauri://theme-changed",
    WINDOW_CREATED: "tauri://window-created",
    WEBVIEW_CREATED: "tauri://webview-created",
    DRAG_ENTER: "tauri://drag-enter",
    DRAG_OVER: "tauri://drag-over",
    DRAG_DROP: "tauri://drag-drop",
    DRAG_LEAVE: "tauri://drag-leave",
  }
  const bundleType = {
    Nsis: "nsis",
    Msi: "msi",
    Deb: "deb",
    Rpm: "rpm",
    AppImage: "appimage",
    App: "app",
  }
  const baseDirectory = {
    1: "Audio",
    2: "Cache",
    3: "Config",
    4: "Data",
    5: "LocalData",
    6: "Document",
    7: "Download",
    8: "Picture",
    9: "Public",
    10: "Video",
    11: "Resource",
    12: "Temp",
    13: "AppConfig",
    14: "AppData",
    15: "AppLocalData",
    16: "AppCache",
    17: "AppLog",
    18: "Desktop",
    19: "Executable",
    20: "Font",
    21: "Home",
    22: "Runtime",
    23: "Template",
    Audio: 1,
    Cache: 2,
    Config: 3,
    Data: 4,
    LocalData: 5,
    Document: 6,
    Download: 7,
    Picture: 8,
    Public: 9,
    Video: 10,
    Resource: 11,
    Temp: 12,
    AppConfig: 13,
    AppData: 14,
    AppLocalData: 15,
    AppCache: 16,
    AppLog: 17,
    Desktop: 18,
    Executable: 19,
    Font: 20,
    Home: 21,
    Runtime: 22,
    Template: 23,
  }
  const resolveBaseDir = (directory) =>
    tauriInvoke("plugin:path|resolve_directory", { directory })
  const userAttentionType = {
    1: "Critical",
    2: "Informational",
    Critical: 1,
    Informational: 2,
  }
  const progressBarStatus = {
    None: "none",
    Normal: "normal",
    Indeterminate: "indeterminate",
    Paused: "paused",
    Error: "error",
  }
  window.__TAURI__ = window.__TAURI__ || {}
  window.__TAURI__.invoke = window.__TAURI__.invoke || tauriInvoke
  window.__TAURI__.convertFileSrc =
    window.__TAURI__.convertFileSrc || convertHostFileSrc
  window.__TAURI__.isTauri = window.__TAURI__.isTauri || (() => true)
  window.__TAURI__.transformCallback =
    window.__TAURI__.transformCallback || transformCallback
  window.__TAURI__.unregisterCallback =
    window.__TAURI__.unregisterCallback || unregisterCallback
  window.__TAURI__.core = {
    ...(window.__TAURI__.core || {}),
    SERIALIZE_TO_IPC_FN: tauriSerializeToIpcKey,
    Channel: window.__TAURI__.core?.Channel || OtoolsCompatChannel,
    Resource: window.__TAURI__.core?.Resource || OtoolsCompatResource,
    PluginListener:
      window.__TAURI__.core?.PluginListener || OtoolsCompatPluginListener,
    invoke: tauriInvoke,
    convertFileSrc: convertHostFileSrc,
    isTauri: () => true,
    transformCallback,
    addPluginListener,
    checkPermissions: (plugin) =>
      tauriInvoke(`plugin:${plugin}|check_permissions`, {}),
    requestPermissions: (plugin) =>
      tauriInvoke(`plugin:${plugin}|request_permissions`, {}),
  }
  window.__TAURI__.event = {
    ...(window.__TAURI__.event || {}),
    TauriEvent: window.__TAURI__.event?.TauriEvent || tauriEventConstants,
    listen: (event, handler, options) => {
      const handlerId = transformCallback(handler)
      return tauriInvoke("plugin:event|listen", {
        event: toStringSafe(event),
        target:
          options && typeof options === "object" && "target" in options
            ? options.target
            : { kind: "Any" },
        handler: handlerId,
      }).then((eventId) => async () => {
        unregisterCallback(handlerId)
        unregisterEventListener({ eventId })
        await tauriInvoke("plugin:event|unlisten", {
          event: toStringSafe(event),
          eventId,
        })
      })
    },
    once: (event, handler, options) => {
      let unlisten = null
      return window.__TAURI__.event
        .listen(
          event,
          async (payload) => {
            if (unlisten) {
              await unlisten()
            }
            handler(payload)
          },
          options
        )
        .then((nextUnlisten) => {
          unlisten = nextUnlisten
          return nextUnlisten
        })
    },
    emit: (event, payloadValue) =>
      tauriInvoke("plugin:event|emit", {
        event: toStringSafe(event),
        payload: payloadValue ?? null,
      }),
    emitTo: (target, event, payloadValue) =>
      tauriInvoke("plugin:event|emit_to", {
        target,
        event: toStringSafe(event),
        payload: payloadValue ?? null,
      }),
  }
  window.__TAURI__.dialog = {
    ...(window.__TAURI__.dialog || {}),
    ...dialog,
  }
  window.__TAURI__.shell = {
    ...(window.__TAURI__.shell || {}),
    ...shell,
  }
  window.__TAURI__.opener = {
    ...(window.__TAURI__.opener || {}),
    openUrl: (url) =>
      tauriInvoke("plugin:opener|open_url", { url: toStringSafe(url) }),
    open_url: (url) =>
      tauriInvoke("plugin:opener|open_url", { url: toStringSafe(url) }),
    openPath: (path) =>
      tauriInvoke("plugin:opener|open_path", { path: toStringSafe(path) }),
    open_path: (path) =>
      tauriInvoke("plugin:opener|open_path", { path: toStringSafe(path) }),
    revealItemInDir: (path) =>
      tauriInvoke("plugin:opener|reveal_item_in_dir", {
        path: toStringSafe(path),
      }),
    reveal_item_in_dir: (path) =>
      tauriInvoke("plugin:opener|reveal_item_in_dir", {
        path: toStringSafe(path),
      }),
  }
  window.__TAURI__.notification = {
    ...(window.__TAURI__.notification || {}),
    isPermissionGranted: () =>
      tauriInvoke("plugin:notification|is_permission_granted", {}),
    requestPermission: () =>
      typeof Notification !== "undefined" &&
      typeof Notification.requestPermission === "function"
        ? Notification.requestPermission()
        : Promise.resolve("granted"),
    sendNotification: (options) =>
      tauriInvoke("plugin:notification|notify", {
        title:
          typeof options === "string"
            ? options
            : toStringSafe(options && options.title),
        body:
          typeof options === "string"
            ? ""
            : toStringSafe(options && options.body),
      }),
    pending: () => tauriInvoke("plugin:notification|get_pending", {}),
    active: () => tauriInvoke("plugin:notification|get_active", {}),
    cancel: (notifications) =>
      tauriInvoke("plugin:notification|cancel", { notifications }),
    cancelAll: () => tauriInvoke("plugin:notification|cancel", {}),
    removeActive: (notifications) =>
      tauriInvoke("plugin:notification|remove_active", { notifications }),
    removeAllActive: () =>
      tauriInvoke("plugin:notification|remove_active", {}),
    channels: () => tauriInvoke("plugin:notification|listChannels", {}),
  }
  window.__TAURI__.process = {
    ...(window.__TAURI__.process || {}),
    exit: (code) => tauriInvoke("plugin:process|exit", { code }),
    relaunch: () => tauriInvoke("plugin:process|restart", {}),
    restart: () => tauriInvoke("plugin:process|restart", {}),
  }
  window.__TAURI__.updater = {
    ...(window.__TAURI__.updater || {}),
    check: () => tauriInvoke("plugin:updater|check", {}),
  }
  window.__TAURI__.globalShortcut = {
    ...(window.__TAURI__.globalShortcut || {}),
    register: (shortcuts, handler) =>
      tauriInvoke("plugin:global-shortcut|register", {
        shortcuts: Array.isArray(shortcuts) ? shortcuts : [shortcuts],
        handler: new OtoolsCompatChannel(handler),
      }),
    unregister: (shortcuts) =>
      tauriInvoke("plugin:global-shortcut|unregister", {
        shortcuts: Array.isArray(shortcuts) ? shortcuts : [shortcuts],
      }),
    unregisterAll: () =>
      tauriInvoke("plugin:global-shortcut|unregister_all", {}),
    isRegistered: (shortcut) =>
      tauriInvoke("plugin:global-shortcut|is_registered", { shortcut }),
  }
  window.__TAURI__.app = {
    ...(window.__TAURI__.app || {}),
    BundleType: window.__TAURI__.app?.BundleType || bundleType,
    getName: () => tauriInvoke("plugin:app|name", {}),
    getVersion: () => tauriInvoke("plugin:app|version", {}),
    getTauriVersion: () => tauriInvoke("plugin:app|tauri_version", {}),
    getIdentifier: () => tauriInvoke("plugin:app|identifier", {}),
    getBundleType: () => tauriInvoke("plugin:app|bundle_type", {}),
    show: () => tauriInvoke("plugin:app|app_show", {}),
    hide: () => tauriInvoke("plugin:app|app_hide", {}),
    defaultWindowIcon: () => tauriInvoke("plugin:app|default_window_icon", {}),
    setTheme: (theme) => tauriInvoke("plugin:app|set_app_theme", { theme }),
    setDockVisibility: (visible) =>
      tauriInvoke("plugin:app|set_dock_visibility", { visible }),
    fetchDataStoreIdentifiers: () =>
      tauriInvoke("plugin:app|fetch_data_store_identifiers", {}),
    removeDataStore: (uuid) =>
      tauriInvoke("plugin:app|remove_data_store", { uuid }),
    onBackButtonPress: (handler) =>
      addPluginListener("app", "back-button", handler),
  }
  window.__TAURI__.window = {
    ...(window.__TAURI__.window || {}),
    UserAttentionType:
      window.__TAURI__.window?.UserAttentionType || userAttentionType,
    ProgressBarStatus:
      window.__TAURI__.window?.ProgressBarStatus || progressBarStatus,
    Window: window.__TAURI__.window?.Window || OtoolsCompatWindow,
    getCurrentWindow: () => currentWindowHandle,
    getAllWindows: () => OtoolsCompatWindow.getAll(),
    getFocusedWindow: () => OtoolsCompatWindow.getFocusedWindow(),
    appWindow: currentWindowHandle,
  }
  window.__TAURI__.webview = {
    ...(window.__TAURI__.webview || {}),
    Webview: window.__TAURI__.webview?.Webview || OtoolsCompatWebview,
    getCurrentWebview: () => currentWebviewHandle,
    getAllWebviews: () => OtoolsCompatWebview.getAll(),
  }
  window.__TAURI__.webviewWindow = {
    ...(window.__TAURI__.webviewWindow || {}),
    WebviewWindow:
      window.__TAURI__.webviewWindow?.WebviewWindow || OtoolsCompatWebviewWindow,
    getCurrentWebviewWindow: () => currentWebviewWindowHandle,
    getAllWebviewWindows: () => OtoolsCompatWebviewWindow.getAll(),
  }
  window.__TAURI__.dpi = {
    ...(window.__TAURI__.dpi || {}),
    LogicalSize: window.__TAURI__.dpi?.LogicalSize || OtoolsCompatLogicalSize,
    PhysicalSize:
      window.__TAURI__.dpi?.PhysicalSize || OtoolsCompatPhysicalSize,
    Size: window.__TAURI__.dpi?.Size || OtoolsCompatSize,
    LogicalPosition:
      window.__TAURI__.dpi?.LogicalPosition || OtoolsCompatLogicalPosition,
    PhysicalPosition:
      window.__TAURI__.dpi?.PhysicalPosition || OtoolsCompatPhysicalPosition,
    Position: window.__TAURI__.dpi?.Position || OtoolsCompatPosition,
  }
  window.__TAURI__.path = {
    ...(window.__TAURI__.path || {}),
    BaseDirectory: window.__TAURI__.path?.BaseDirectory || baseDirectory,
    sep: () => window.__TAURI_INTERNALS__.plugins.path.sep,
    delimiter: () => window.__TAURI_INTERNALS__.plugins.path.delimiter,
    appConfigDir: () => resolveBaseDir(13),
    appDataDir: () => resolveBaseDir(14),
    appLocalDataDir: () => resolveBaseDir(15),
    appCacheDir: () => resolveBaseDir(16),
    appLogDir: () => resolveBaseDir(17),
    audioDir: () => resolveBaseDir(1),
    cacheDir: () => resolveBaseDir(2),
    configDir: () => resolveBaseDir(3),
    dataDir: () => resolveBaseDir(4),
    desktopDir: () => resolveBaseDir(18),
    documentDir: () => resolveBaseDir(6),
    downloadDir: () => resolveBaseDir(7),
    executableDir: () => resolveBaseDir(19),
    fontDir: () => resolveBaseDir(20),
    homeDir: () => resolveBaseDir(21),
    localDataDir: () => resolveBaseDir(5),
    pictureDir: () => resolveBaseDir(8),
    publicDir: () => resolveBaseDir(9),
    resourceDir: () => resolveBaseDir(11),
    runtimeDir: () => resolveBaseDir(22),
    tempDir: () => resolveBaseDir(12),
    templateDir: () => resolveBaseDir(23),
    videoDir: () => resolveBaseDir(10),
    join: (...paths) => tauriInvoke("plugin:path|join", { paths }),
    resolve: (...paths) => tauriInvoke("plugin:path|resolve", { paths }),
    normalize: (path) =>
      tauriInvoke("plugin:path|normalize", { path: toStringSafe(path) }),
    dirname: (path) =>
      tauriInvoke("plugin:path|dirname", { path: toStringSafe(path) }),
    extname: (path) =>
      tauriInvoke("plugin:path|extname", { path: toStringSafe(path) }),
    basename: (path, ext) =>
      tauriInvoke("plugin:path|basename", {
        path: toStringSafe(path),
        ext: ext === undefined ? undefined : toStringSafe(ext),
      }),
    isAbsolute: (path) =>
      tauriInvoke("plugin:path|is_absolute", { path: toStringSafe(path) }),
    resolveResource: (resourcePath) =>
      tauriInvoke("plugin:path|resolve_directory", {
        directory: 11,
        path: toStringSafe(resourcePath),
      }),
  }
  window.__CODEG_OTOOLS_WINDOW_LABEL__ = windowLabel
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ =
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {}
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = (
    _event,
    eventId
  ) => {
    unregisterEventListener({ eventId })
  }

  window.__OToolsHostInvoke = tauriInvoke
  window.isTauri = true
  installClipboardCompat()
  installOtoolsBrowserBehaviorBridge()
  installHostFileSystemAccessPolyfill()

  try {
    Object.defineProperty(window, "otools", {
      configurable: true,
      enumerable: false,
      writable: false,
      value: api,
    })
  } catch {
    window.otools = api
  }

  if (!window.utools) {
    window.utools = api
  }
}

function extractStatePayload(payload: unknown): unknown {
  const value = payload as { state?: unknown; value?: unknown } | null
  if (value && "state" in value) return value.state
  if (value && "value" in value) return value.value
  return payload
}

function extractPatchPayload(payload: unknown): unknown {
  const value = payload as { patch?: unknown } | null
  if (value && "patch" in value) return value.patch
  return payload
}

function extractKey(payload: unknown): string | null {
  const value = payload as { key?: unknown } | null
  return typeof value?.key === "string" && value.key ? value.key : null
}

function extractValuePayload(payload: unknown): unknown {
  const value = payload as { value?: unknown } | null
  return value?.value
}

function buildStateCommandPayload(
  pluginUuid: string,
  payload: unknown
): Record<string, unknown> {
  return {
    ...(asRecord(payload) ?? {}),
    plugin: pluginUuid,
  }
}

function resolvePayloadPluginUuid(fallback: string, payload: unknown): string {
  const value = asRecord(payload)
  const candidate = value?.pluginUuid ?? value?.plugin ?? value?.uuid
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function dispatchHostCustomEvent<T>(name: string, detail: T) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function readHostWindowState(): OtoolsHostWindowState {
  const raw = (
    window as Window & { __CODEG_OTOOLS_HOST_STATE__?: OtoolsHostWindowState }
  ).__CODEG_OTOOLS_HOST_STATE__

  if (!raw || typeof raw !== "object") {
    return {
      tabLabels: [],
      activeLabel: null,
    }
  }

  return {
    tabLabels: Array.isArray(raw.tabLabels)
      ? raw.tabLabels.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    activeLabel:
      typeof raw.activeLabel === "string" && raw.activeLabel.trim()
        ? raw.activeLabel.trim()
        : null,
  }
}

function readCurrentOtoolsWindowLabel(): string {
  const raw = (
    window as Window & { __CODEG_OTOOLS_WINDOW_LABEL__?: string }
  ).__CODEG_OTOOLS_WINDOW_LABEL__

  return typeof raw === "string" && raw.trim() ? raw.trim() : WINDOW_LABEL
}

function listCurrentOtoolsWindowLabels(): string[] {
  return Array.from(
    new Set([
      ...readHostWindowState().tabLabels,
      readCurrentOtoolsWindowLabel(),
    ].filter(Boolean))
  )
}

function readWindowOptions(payload: unknown): Record<string, unknown> {
  return asRecord(asRecord(payload)?.options ?? payload) ?? {}
}

function readOptionalNumberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readWindowNumberOption(payload: unknown, field: string): number | null {
  const options = readWindowOptions(payload)
  return readOptionalNumberValue(options[field])
}

function readWindowBooleanOption(
  payload: unknown,
  field: string
): boolean | null {
  const options = readWindowOptions(payload)
  const raw = options[field]

  if (typeof raw === "boolean") {
    return raw
  }

  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase()
    if (normalized === "true" || normalized === "1") {
      return true
    }
    if (normalized === "false" || normalized === "0") {
      return false
    }
  }

  return null
}

function readWindowStringOption(payload: unknown, field: string): string | null {
  const options = readWindowOptions(payload)
  const raw = options[field]
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

function buildOtoolsRuntimeWindowUrl(
  pluginUuid: string,
  payload: unknown
): string | null {
  const label = readWindowStringOption(payload, "label")
  const title = readWindowStringOption(payload, "title")
  const rawUrl = readWindowStringOption(payload, "url")

  if (rawUrl && /^(data|blob|file):/i.test(rawUrl)) {
    return rawUrl
  }

  const params = new URLSearchParams()
  params.set("pluginUuid", pluginUuid)

  if (label) {
    params.set("windowLabel", label)
  }
  if (title) {
    params.set("title", title)
  }

  if (!rawUrl) {
    return `/otools/runtime?${params.toString()}`
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin)
    if (!/^https?:$/i.test(parsed.protocol) || parsed.origin !== window.location.origin) {
      return rawUrl
    }

    if (parsed.pathname.startsWith("/otools/runtime")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }

    const marker = `/otools-assets/${pluginUuid}/`
    const index = parsed.pathname.indexOf(marker)
    if (index >= 0) {
      params.set(
        "entryPath",
        decodeURIComponent(parsed.pathname.slice(index + marker.length))
      )
    }

    params.set("sourceUrl", parsed.toString())
    parsed.searchParams.forEach((value, key) => {
      if (!OTOOLS_RUNTIME_RESERVED_QUERY_KEYS.has(key)) {
        params.append(key, value)
      }
    })

    return `/otools/runtime?${params.toString()}`
  } catch {
    return rawUrl
  }
}

async function openOtoolsShimWindow(
  pluginUuid: string,
  payload: unknown
): Promise<boolean> {
  const label =
    readWindowStringOption(payload, "label") ||
    `otools-${pluginUuid}-${Date.now()}`
  const title =
    readWindowStringOption(payload, "title") || document.title || "OTools"
  const url = buildOtoolsRuntimeWindowUrl(pluginUuid, payload)

  if (!url) {
    throw new Error("window url is required")
  }

  if (isDesktop()) {
    await getShellTransport().call("open_otools_webview_window", {
      remoteConnectionId: getActiveRemoteConnectionId(),
      request: {
        label,
        title,
        url,
        width: readWindowNumberOption(payload, "width"),
        height: readWindowNumberOption(payload, "height"),
        minWidth: readWindowNumberOption(payload, "minWidth"),
        minHeight: readWindowNumberOption(payload, "minHeight"),
        center: readWindowBooleanOption(payload, "center"),
        resizable: readWindowBooleanOption(payload, "resizable"),
        focus: readWindowBooleanOption(payload, "focus"),
        decorations: readWindowBooleanOption(payload, "decorations"),
        transparent: readWindowBooleanOption(payload, "transparent"),
        alwaysOnTop: readWindowBooleanOption(payload, "alwaysOnTop"),
        titleBarStyle: readWindowStringOption(payload, "titleBarStyle"),
        hiddenTitle: readWindowBooleanOption(payload, "hiddenTitle"),
        trafficLightPosition:
          asRecord(readWindowOptions(payload).trafficLightPosition) ?? null,
      },
    })
    return true
  }

  const features = ["noopener=yes", "noreferrer=yes"]
  const width = readWindowNumberOption(payload, "width")
  const height = readWindowNumberOption(payload, "height")
  const resizable = readWindowBooleanOption(payload, "resizable")

  if (width !== null && width > 0) {
    features.push(`width=${Math.round(width)}`)
  }
  if (height !== null && height > 0) {
    features.push(`height=${Math.round(height)}`)
  }
  if (resizable !== null) {
    features.push(`resizable=${resizable ? "yes" : "no"}`)
  }

  const opened = window.open(url, label, features.join(","))
  if (!opened) {
    window.location.href = url
  }

  return true
}

function extractInvokeValue(payload: unknown): unknown {
  const record = asRecord(payload)
  return record && "value" in record ? record.value : payload
}

type OtoolsWindowMethod = (...args: unknown[]) => unknown
type OtoolsWindowHandle = Record<string, unknown>
type OtoolsWindowCallResult = {
  handled: boolean
  value: unknown
}

async function getOtoolsWindowHandle(
  payload?: unknown
): Promise<OtoolsWindowHandle | null> {
  const label = readStringField(payload, "label").trim()
  if (label && isDesktop() && getActiveRemoteConnectionId() === null) {
    try {
      const { Window: TauriWindow } = await import("@tauri-apps/api/window")
      const targetWindow = await TauriWindow.getByLabel(label)
      if (targetWindow) {
        return targetWindow as unknown as OtoolsWindowHandle
      }
    } catch {}
  }

  const currentWindow = await getCurrentWindow()
  return currentWindow
    ? (currentWindow as unknown as OtoolsWindowHandle)
    : null
}

async function callOtoolsWindowMethod(
  payload: unknown,
  methodName: string,
  ...args: unknown[]
): Promise<OtoolsWindowCallResult> {
  const targetWindow = await getOtoolsWindowHandle(payload)
  const method = targetWindow?.[methodName]
  if (typeof method === "function") {
    return {
      handled: true,
      value: await (method as OtoolsWindowMethod).apply(targetWindow, args),
    }
  }
  return {
    handled: false,
    value: undefined,
  }
}

async function showCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  const result = await callOtoolsWindowMethod(payload, "show")
  if (!result.handled) {
    window.focus()
  }
}

async function hideCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "hide")
}

async function minimizeCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "minimize")
}

async function unminimizeCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "unminimize")
}

async function maximizeCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "maximize")
}

async function unmaximizeCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "unmaximize")
}

async function toggleCurrentOtoolsWindowMaximize(
  payload?: unknown
): Promise<void> {
  await callOtoolsWindowMethod(payload, "toggleMaximize")
}

async function focusCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  const result = await callOtoolsWindowMethod(payload, "setFocus")
  if (!result.handled) {
    window.focus()
  }
}

async function closeCurrentOtoolsWindow(
  payload?: unknown,
  force = false
): Promise<void> {
  if (!isDesktop()) {
    try {
      window.close()
    } catch {}
    if (window.closed) {
      return
    }
  }

  const result = await callOtoolsWindowMethod(
    payload,
    force ? "destroy" : "close"
  )
  if (!result.handled) {
    await closeCurrentWindow()
  }
}

async function centerCurrentOtoolsWindow(payload?: unknown): Promise<void> {
  await callOtoolsWindowMethod(payload, "center")
}

async function getCurrentOtoolsWindowScaleFactor(
  payload?: unknown
): Promise<number> {
  const { value: scale } = await callOtoolsWindowMethod(payload, "scaleFactor")
  return Number(scale || window.devicePixelRatio || 1)
}

async function getCurrentOtoolsWindowOuterPosition(payload?: unknown): Promise<{
  x: number
  y: number
}> {
  const result = await callOtoolsWindowMethod(payload, "outerPosition")
  const position = asRecord(result.value)
  if (position) {
    return {
      x: Number(position.x || 0),
      y: Number(position.y || 0),
    }
  }
  return {
    x: Number(
      window.screenX ||
        (window as Window & { screenLeft?: number }).screenLeft ||
        0
    ),
    y: Number(
      window.screenY || (window as Window & { screenTop?: number }).screenTop || 0
    ),
  }
}

async function getCurrentOtoolsWindowInnerPosition(payload?: unknown): Promise<{
  x: number
  y: number
}> {
  const result = await callOtoolsWindowMethod(payload, "innerPosition")
  const position = asRecord(result.value)
  if (position) {
    return {
      x: Number(position.x || 0),
      y: Number(position.y || 0),
    }
  }
  return getCurrentOtoolsWindowOuterPosition(payload)
}

async function getCurrentOtoolsWindowInnerSize(payload?: unknown): Promise<{
  width: number
  height: number
}> {
  const result = await callOtoolsWindowMethod(payload, "innerSize")
  const size = asRecord(result.value)
  if (size) {
    return {
      width: Number(size.width || window.innerWidth || 0),
      height: Number(size.height || window.innerHeight || 0),
    }
  }
  return {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  }
}

async function getCurrentOtoolsWindowOuterSize(payload?: unknown): Promise<{
  width: number
  height: number
}> {
  const result = await callOtoolsWindowMethod(payload, "outerSize")
  const size = asRecord(result.value)
  if (size) {
    return {
      width: Number(size.width || window.outerWidth || window.innerWidth || 0),
      height: Number(size.height || window.outerHeight || window.innerHeight || 0),
    }
  }
  return {
    width: window.outerWidth || window.innerWidth || 0,
    height: window.outerHeight || window.innerHeight || 0,
  }
}

function readInvokeBooleanValue(payload: unknown): boolean {
  return readBooleanField(extractInvokeValue(payload), "value")
}

async function setCurrentOtoolsWindowBooleanMethod(
  payload: unknown,
  methodName: string
): Promise<void> {
  await callOtoolsWindowMethod(payload, methodName, readInvokeBooleanValue(payload))
}

async function setCurrentOtoolsWindowAlwaysOnTop(payload: unknown): Promise<void> {
  await setCurrentOtoolsWindowBooleanMethod(payload, "setAlwaysOnTop")
}

async function setCurrentOtoolsWindowIgnoreCursorEvents(
  payload: unknown
): Promise<void> {
  await setCurrentOtoolsWindowBooleanMethod(payload, "setIgnoreCursorEvents")
}

async function setCurrentOtoolsWindowPosition(payload: unknown): Promise<void> {
  const value = extractInvokeValue(payload)
  if (value && typeof value === "object") {
    await callOtoolsWindowMethod(payload, "setPosition", value)
  }
}

async function setCurrentOtoolsWindowSize(payload: unknown): Promise<void> {
  const value = extractInvokeValue(payload)
  if (value && typeof value === "object") {
    await callOtoolsWindowMethod(payload, "setSize", value)
  }
}

async function setCurrentOtoolsWindowTitle(payload: unknown): Promise<void> {
  const title = String(extractInvokeValue(payload) ?? "").trim()
  if (!title) {
    return
  }
  if (
    !readStringField(payload, "label").trim() ||
    readStringField(payload, "label").trim() === readCurrentOtoolsWindowLabel()
  ) {
    document.title = title
  }
  await callOtoolsWindowMethod(payload, "setTitle", title)
}

async function setCurrentOtoolsWindowVisibleOnAllWorkspaces(
  payload: unknown
): Promise<void> {
  await setCurrentOtoolsWindowBooleanMethod(
    payload,
    "setVisibleOnAllWorkspaces"
  )
}

function getCurrentOtoolsWindowTheme(): "dark" | "light" {
  if (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.dataset.theme === "dark"
  ) {
    return "dark"
  }
  return "light"
}

async function requestCurrentOtoolsWindowAttention(
  payload: unknown
): Promise<void> {
  await callOtoolsWindowMethod(
    payload,
    "requestUserAttention",
    extractInvokeValue(payload)
  )
}

async function setCurrentOtoolsWindowNoopMethod(
  payload: unknown,
  methodName: string
): Promise<void> {
  await callOtoolsWindowMethod(payload, methodName, extractInvokeValue(payload))
}

function normalizeNotificationDetail(
  pluginUuid: string,
  payload: unknown
): OtoolsHostNotificationDetail {
  return {
    pluginUuid: resolvePluginUuid(pluginUuid) || null,
    title:
      readOptionalStringField(payload, "title") ||
      readOptionalStringField(payload, "clickFeatureCode") ||
      "OTools",
    body:
      readOptionalStringField(payload, "body") ||
      readOptionalStringField(payload, "message"),
    clickFeatureCode: readOptionalStringField(payload, "clickFeatureCode"),
  }
}

function normalizeStatusBarDetail(
  pluginUuid: string,
  payload: unknown
): OtoolsHostStatusBarDetail {
  const body = asRecord(asRecord(payload)?.payload ?? payload)
  const visible = typeof body?.visible === "boolean" ? body.visible : true
  return {
    pluginUuid: resolvePluginUuid(pluginUuid) || null,
    title:
      typeof body?.title === "string" && body.title.trim()
        ? body.title.trim()
        : null,
    tooltip:
      typeof body?.tooltip === "string" && body.tooltip.trim()
        ? body.tooltip.trim()
        : null,
    visible,
  }
}

function hostTabExists(label: string): boolean {
  const normalized = String(label || "").trim()
  if (!normalized) return false
  return readHostWindowState().tabLabels.includes(normalized)
}

function normalizeUploadSavedImage(saved: unknown): unknown {
  const record = asRecord(saved)
  if (!record) return saved
  const relativePath = String(record.relativePath || "").trim()
  if (
    !relativePath ||
    (isDesktop() && getActiveRemoteConnectionId() === null)
  ) {
    return saved
  }
  return {
    ...record,
    staticUrl: `${getServerBaseUrl()}/otools-static/${encodePathSegments(
      relativePath
    )}`,
  }
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

function readStringField(payload: unknown, field: string): string {
  const record = asRecord(payload)
  const direct = record?.[field]
  if (typeof direct === "string") return direct
  return typeof payload === "string" ? payload : ""
}

function readOptionalStringField(
  payload: unknown,
  field: string
): string | null {
  const value = readStringField(payload, field).trim()
  return value || null
}

function readNumberField(
  payload: unknown,
  field: string,
  fallback: number
): number {
  const record = asRecord(payload)
  const direct = record?.[field]
  const raw =
    typeof direct === "number" || typeof direct === "string"
      ? Number(direct)
      : typeof payload === "number" || typeof payload === "string"
        ? Number(payload)
        : Number.NaN

  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(1, Math.floor(raw))
}

function readOptionalIntervalMs(payload: unknown): number | null {
  const record = asRecord(payload)
  const raw = record?.intervalMs ?? record?.interval_ms
  const value =
    typeof raw === "number" || typeof raw === "string"
      ? Number(raw)
      : Number.NaN
  return Number.isFinite(value) ? Math.floor(value) : null
}

function readBooleanField(payload: unknown, field: string): boolean {
  const record = asRecord(payload)
  const direct = record?.[field]

  if (typeof direct === "boolean") {
    return direct
  }

  if (typeof direct === "string") {
    const normalized = direct.trim().toLowerCase()
    if (normalized === "true" || normalized === "1") {
      return true
    }
    if (normalized === "false" || normalized === "0") {
      return false
    }
  }

  if (typeof payload === "boolean") {
    return payload
  }

  return false
}

function readStringArrayField(payload: unknown, field: string): string[] {
  const record = asRecord(payload)
  const direct = record?.[field]
  const value = Array.isArray(direct)
    ? direct
    : Array.isArray(payload)
      ? payload
      : []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

function readArrayField(payload: unknown, field: string): unknown[] {
  const record = asRecord(payload)
  const direct = record?.[field]
  if (Array.isArray(direct)) {
    return direct
  }
  return Array.isArray(payload) ? payload : []
}

function readDialogFilters(
  value: unknown
): Array<{ name: string; extensions: string[] }> | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const filters = value
    .map((item) => {
      const record = asRecord(item)
      const extensions = Array.isArray(record?.extensions)
        ? record.extensions
            .map((extension) =>
              String(extension || "")
                .trim()
                .replace(/^\./, "")
            )
            .filter(Boolean)
        : []
      return {
        name:
          typeof record?.name === "string" && record.name.trim()
            ? record.name.trim()
            : "Files",
        extensions,
      }
    })
    .filter((item) => item.extensions.length)
  return filters.length ? filters : undefined
}

function normalizeToolsShellShortcutAction(
  value: string
): OtoolsHostShellShortcutDetail["action"] | null {
  switch (value.trim()) {
    case "closeActiveTab":
    case "activatePrevTab":
    case "activateNextTab":
      return value.trim()
    default:
      return null
  }
}

function extractDialogOpenOptions(payload: unknown): {
  directory?: boolean
  filters?: Array<{ name: string; extensions: string[] }>
  multiple?: boolean
  title?: string
  defaultPath?: string
} {
  const record = asRecord(payload)
  const options = asRecord(record?.options ?? payload)
  return {
    defaultPath:
      typeof options?.defaultPath === "string"
        ? options.defaultPath
        : undefined,
    directory: options?.directory === true,
    filters: readDialogFilters(options?.filters),
    multiple: options?.multiple === true,
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

function extractDialogSaveOptions(payload: unknown): {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
  title?: string
} {
  const record = asRecord(payload)
  const options = asRecord(record?.options ?? payload)
  return {
    defaultPath:
      typeof options?.defaultPath === "string"
        ? options.defaultPath
        : undefined,
    filters: readDialogFilters(options?.filters),
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

function extractWebviewPickOptions(payload: unknown): {
  directory?: string
  filters?: Array<{ name: string; extensions: string[] }>
  multiple?: boolean
  title?: string
  suggestedName?: string
} {
  const record = asRecord(payload)
  const options = asRecord(record?.options ?? payload)
  return {
    directory:
      typeof options?.directory === "string" ? options.directory : undefined,
    filters: readDialogFilters(options?.filters),
    multiple: options?.multiple === true,
    suggestedName:
      typeof options?.suggestedName === "string"
        ? options.suggestedName
        : undefined,
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

async function pickHostFiles(payload: unknown): Promise<unknown[]> {
  const options = extractWebviewPickOptions(payload)
  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    try {
      const result = await getTransport().call("tools_webview_pick_files", {
        options,
      })
      if (Array.isArray(result)) {
        return result
      }
    } catch {}
  }

  const paths = await pickHostFilePaths(payload)
  const files: unknown[] = []
  for (const path of paths) {
    files.push(await getHostFileMeta(path))
  }
  return files
}

async function pickHostFilePaths(payload: unknown): Promise<string[]> {
  const options = extractWebviewPickOptions(payload)
  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    try {
      const result = await getTransport().call("tools_webview_pick_files", {
        options,
      })
      if (Array.isArray(result)) {
        return normalizePickedPathList(
          result
            .map((item) => {
              const record = asRecord(item)
              return typeof record?.path === "string" ? record.path : ""
            })
            .filter(Boolean),
          options.multiple === true
        )
      }
    } catch {}
    return normalizePickedPathList(
      await openFileDialog({
        defaultPath: options.directory,
        filters: options.filters,
        multiple: options.multiple,
        title: options.title,
      }),
      options.multiple === true
    )
  }

  try {
    const result = await getTransport().call("tools_webview_pick_files", {
      options,
    })
    if (Array.isArray(result)) {
      return normalizePickedPathList(
        result
          .map((item) => {
            const record = asRecord(item)
            return typeof record?.path === "string" ? record.path : ""
          })
          .filter(Boolean),
        options.multiple === true
      )
    }
  } catch {}

  const raw = window.prompt(
    options.title ?? "Enter host file path",
    options.directory ?? ""
  )
  const paths = splitPromptPaths(raw)
  return options.multiple ? paths : paths.slice(0, 1)
}

async function pickHostFolder(
  payload: unknown
): Promise<{ path: string; name: string } | null> {
  const options = extractWebviewPickOptions(payload)
  try {
    const result = await getTransport().call("tools_webview_pick_folder", {
      options,
    })
    const record = asRecord(result)
    if (record && typeof record.path === "string" && record.path.trim()) {
      return buildHostPathEntry(
        record.path,
        typeof record.name === "string" ? record.name : "folder"
      )
    }
    if (result === null) {
      return null
    }
  } catch {}

  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    const result = await openFileDialog({
      defaultPath: options.directory,
      directory: true,
      title: options.title,
    })
    const path = normalizePickedPathList(result, false)[0]
    return path ? buildHostPathEntry(path, "folder") : null
  }

  const prompted = window.prompt(
    options.title ?? "Enter host folder path",
    options.directory ?? ""
  )
  const path = normalizePickedPathList(prompted, false)[0]
  return path ? buildHostPathEntry(path, "folder") : null
}

async function pickHostSavePath(
  payload: unknown
): Promise<{ path: string; name: string } | null> {
  const options = extractWebviewPickOptions(payload)
  try {
    const result = await getTransport().call("tools_webview_pick_save_path", {
      options,
    })
    const record = asRecord(result)
    if (record && typeof record.path === "string" && record.path.trim()) {
      return buildHostPathEntry(
        record.path,
        typeof record.name === "string" ? record.name : "file"
      )
    }
    if (result === null) {
      return null
    }
  } catch {}

  const defaultPath = options.suggestedName
    ? [options.directory, options.suggestedName].filter(Boolean).join("/")
    : options.directory
  const path = await saveDialog({
    defaultPath,
    filters: options.filters,
    title: options.title,
  })
  return path ? buildHostPathEntry(path, "file") : null
}

function normalizePickedPathList(
  result: string | string[] | null,
  multiple: boolean
): string[] {
  const paths = Array.isArray(result)
    ? result
    : typeof result === "string"
      ? [result]
      : []
  const normalized = paths.map((item) => item.trim()).filter(Boolean)
  return multiple ? normalized : normalized.slice(0, 1)
}

function splitPromptPaths(raw: string | null): string[] {
  return String(raw || "")
    .split(/[\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function getHostFileMeta(path: string): Promise<unknown> {
  try {
    const meta = await getTransport().call("tools_webview_file_meta", { path })
    const record = asRecord(meta)
    if (record && typeof record.path === "string" && record.path.trim()) {
      return {
        path: record.path,
        name:
          typeof record.name === "string" && record.name.trim()
            ? record.name
            : readHostPathName(path, "file"),
        size: typeof record.size === "number" ? record.size : 0,
        mime:
          typeof record.mime === "string" && record.mime.trim()
            ? record.mime
            : "application/octet-stream",
        lastModified:
          typeof record.lastModified === "number" ? record.lastModified : null,
      }
    }
  } catch {}

  return {
    path,
    name: readHostPathName(path, "file"),
    size: 0,
    mime: "application/octet-stream",
    lastModified: null,
  }
}

function buildHostPathEntry(
  path: string,
  fallbackName: string
): { path: string; name: string } {
  return {
    path,
    name: readHostPathName(path, fallbackName),
  }
}

function readHostPathName(path: string, fallbackName: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "")
  const parts = normalized.split(/[\\/]+/)
  return parts[parts.length - 1]?.trim() || normalized || fallbackName
}

async function openOtoolsFileDialog(
  payload: unknown
): Promise<string | string[] | null> {
  const options = extractDialogOpenOptions(payload)
  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    return openFileDialog(options)
  }

  const label = options.directory ? "directory" : "file"
  const raw = window.prompt(
    options.title ?? `Enter host ${label} path`,
    options.defaultPath ?? ""
  )
  if (!raw?.trim()) {
    return null
  }

  const paths = raw
    .split(/[\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!paths.length) {
    return null
  }

  return options.multiple ? paths : paths[0]
}

function readShellOpenTarget(payload: unknown): string {
  return (
    readStringField(payload, "path") ||
    readStringField(payload, "url") ||
    readStringField(payload, "href")
  ).trim()
}

function readFirstPathField(payload: unknown): string {
  const direct = readStringField(payload, "path").trim()
  if (direct) {
    return direct
  }
  return readStringArrayField(payload, "paths")[0]?.trim() || ""
}

function isExternalShellTarget(target: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(target)) {
    return false
  }

  return /^[a-z][a-z0-9+.-]*:/i.test(target)
}

async function openOtoolsShellExternal(url: string): Promise<void> {
  const target = url.trim()
  if (!target) {
    throw new Error("url is required")
  }

  try {
    await getTransport().call("otools_shell_open_external", { url: target })
  } catch {
    await openUrl(target)
  }
}

async function openOtoolsShellPath(path: string): Promise<void> {
  const target = path.trim()
  if (!target) {
    throw new Error("path is required")
  }

  try {
    await getTransport().call("otools_shell_open_path", { path: target })
  } catch {
    await openPath(target)
  }
}

async function revealOtoolsShellPath(path: string): Promise<void> {
  const target = path.trim()
  if (!target) {
    throw new Error("path is required")
  }

  try {
    await getTransport().call("otools_shell_show_item_in_folder", {
      path: target,
    })
  } catch {
    await revealItemInDir(target)
  }
}

async function trashOtoolsShellPath(path: string): Promise<boolean> {
  const target = path.trim()
  if (!target) {
    throw new Error("path is required")
  }

  await getTransport().call("otools_shell_trash_item", { path: target })
  return true
}

async function beepOtoolsShell(): Promise<void> {
  try {
    await getTransport().call("otools_shell_beep")
  } catch {
    return
  }
}

async function openOtoolsShellTarget(payload: unknown): Promise<void> {
  const target = readShellOpenTarget(payload)
  if (!target) {
    throw new Error("path is required")
  }

  if (isExternalShellTarget(target)) {
    await openOtoolsShellExternal(target)
    return
  }

  await openOtoolsShellPath(target)
}

async function saveDialog(options: {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
  title?: string
}): Promise<string | null> {
  if (isDesktop() && getActiveRemoteConnectionId() === null) {
    const { save } = await import("@tauri-apps/plugin-dialog")
    return save(options)
  }
  const result = window.prompt(
    options.title ?? "Save path",
    options.defaultPath ?? ""
  )
  return result?.trim() ? result : null
}

async function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return false
  try {
    return Boolean(await getTransport().call("otools_copy_text", { text }))
  } catch {}
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  return false
}

function readImagePayloadString(payload: unknown): string {
  const record = asRecord(payload)
  const image = record?.image ?? payload
  const imageRecord = asRecord(image)
  if (typeof image === "string") return image.trim()
  if (typeof imageRecord?.dataUrl === "string") return imageRecord.dataUrl
  if (typeof imageRecord?.dataBase64 === "string") {
    const mime =
      typeof imageRecord.mime === "string" ? imageRecord.mime : "image/png"
    return `data:${mime};base64,${imageRecord.dataBase64}`
  }
  return ""
}

async function copyImagePayload(payload: unknown): Promise<boolean> {
  const record = asRecord(payload)
  const image = record?.image ?? payload
  const imageRecord = asRecord(image)
  const dataUrl =
    typeof image === "string" && image.trim().startsWith("data:")
      ? image.trim()
      : typeof imageRecord?.dataUrl === "string"
        ? imageRecord.dataUrl
        : ""
  const dataBase64 =
    typeof imageRecord?.dataBase64 === "string" ? imageRecord.dataBase64 : ""
  const mime =
    typeof imageRecord?.mime === "string" ? imageRecord.mime : "image/png"
  const sourceUrl =
    dataUrl || (dataBase64 ? `data:${mime};base64,${dataBase64}` : "")
  if (
    !sourceUrl ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    return false
  }

  try {
    const response = await fetch(sourceUrl)
    const blob = await response.blob()
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || "image/png"]: blob,
      }),
    ])
    return true
  } catch {
    return false
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { sendSystemNotification } from "@/lib/notification"
import {
  closeCurrentWindow,
  openFileDialog,
  openPath,
  openUrl,
  revealItemInDir,
} from "@/lib/platform"
import {
  getActiveRemoteConnectionId,
  getTransport,
  isDesktop,
} from "@/lib/transport"
import {
  listOtoolsPlugins,
  getOtoolsConfig,
  getOtoolsConfigValue,
  getOtoolsPluginAsset,
  getOtoolsPluginState,
  invokeOtoolsNative,
  saveOtoolsConfig,
  saveOtoolsConfigValue,
  setOtoolsPluginState,
} from "./api"
import {
  normalizeConfigValueForSave,
  OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
  syncBasicSettingsToHost,
} from "./config-runtime"
import {
  OTOOLS_HOST_CLOSE_TAB_EVENT,
  OTOOLS_HOST_CREATE_TAB_EVENT,
  OTOOLS_HOST_RELOAD_PLUGINS_EVENT,
  OTOOLS_HOST_SWITCH_TAB_EVENT,
  type OtoolsHostCloseTabDetail,
  type OtoolsHostCreateTabDetail,
  type OtoolsHostSwitchTabDetail,
  type OtoolsHostWindowState,
} from "./host-events"
import type {
  OtoolsBridgeRequest,
  OtoolsBridgeResponse,
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

const OPEN_EXTERNAL_COMMANDS = new Set([
  "__otools_open_external",
  "remote_service_shell_open_external",
  "otools_shell_open_external",
])

const OPEN_PATH_COMMANDS = new Set([
  "__otools_open_path",
  "remote_service_shell_open_path",
  "otools_shell_open_path",
])

const REVEAL_ITEM_COMMANDS = new Set([
  "__otools_reveal_item",
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

const NOTIFICATION_COMMANDS = new Set([
  "__otools_show_notification",
  "otools_show_notification",
])

const CONFIG_COMMANDS = new Set([
  "get_otools_config",
  "save_otools_config",
  "get_otools_config_value",
  "save_otools_config_value",
])
const HOST_FORWARD_PREFIXES = ["dev_", "park_"]

const WINDOW_LABEL = "otools"
let copiedHostFiles: string[] = []

export function installOtoolsFrameBridge(
  frame: HTMLIFrameElement,
  pluginUuid: string
): () => void {
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
      response.data = await dispatchOtoolsCommand(
        pluginUuid,
        request.command,
        request.payload
      )
    } catch (error) {
      response.ok = false
      response.error = error instanceof Error ? error.message : String(error)
    }

    frame.contentWindow?.postMessage(response, "*")
  }

  window.addEventListener("message", handleMessage)
  return () => window.removeEventListener("message", handleMessage)
}

export async function loadOtoolsPluginDocument(
  entryUrl: string,
  plugin: OtoolsPluginInfo
): Promise<string> {
  const html = await loadPluginAssetText(plugin.uuid, plugin.entry, entryUrl)
  const inlinedHtml = await inlinePluginDocumentAssets(html, entryUrl, plugin)
  return injectCompatBridge(inlinedHtml, entryUrl, plugin.uuid)
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

async function inlinePluginDocumentAssets(
  html: string,
  entryUrl: string,
  plugin: OtoolsPluginInfo
): Promise<string> {
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

async function dispatchOtoolsCommand(
  pluginUuid: string,
  command: string,
  payload: unknown
): Promise<unknown> {
  const targetPluginUuid = resolvePayloadPluginUuid(pluginUuid, payload)

  if (STATE_GET_COMMANDS.has(command)) {
    return getOtoolsPluginState(targetPluginUuid, inferScheme(command, payload))
  }
  if (STATE_SET_COMMANDS.has(command)) {
    return setOtoolsPluginState(
      targetPluginUuid,
      extractStatePayload(payload),
      inferScheme(command, payload)
    )
  }
  if (STATE_VALUE_GET_COMMANDS.has(command)) {
    const state = (await getOtoolsPluginState(
      targetPluginUuid,
      inferScheme(command, payload)
    )) as Record<string, unknown> | null
    const key = extractKey(payload)
    return state && key ? (state[key] ?? null) : null
  }
  if (STATE_VALUE_SET_COMMANDS.has(command)) {
    const state = ((await getOtoolsPluginState(
      targetPluginUuid,
      inferScheme(command, payload)
    )) ?? {}) as Record<string, unknown>
    const key = extractKey(payload)
    if (key) state[key] = extractValuePayload(payload)
    return setOtoolsPluginState(
      targetPluginUuid,
      state,
      inferScheme(command, payload)
    )
  }
  if (STATE_PATCH_COMMANDS.has(command)) {
    const current = ((await getOtoolsPluginState(
      targetPluginUuid,
      inferScheme(command, payload)
    )) ?? {}) as Record<string, unknown>
    const patch = (extractPatchPayload(payload) ?? {}) as Record<
      string,
      unknown
    >
    return setOtoolsPluginState(
      targetPluginUuid,
      { ...current, ...patch },
      inferScheme(command, payload)
    )
  }

  if (HOST_FORWARD_PREFIXES.some((prefix) => command.startsWith(prefix))) {
    return getTransport().call(command, asRecord(payload) ?? {})
  }

  if (CONFIG_COMMANDS.has(command)) {
    return dispatchConfigCommand(command, payload)
  }

  if (OPEN_EXTERNAL_COMMANDS.has(command)) {
    return openUrl(readStringField(payload, "url"))
  }

  if (OPEN_PATH_COMMANDS.has(command)) {
    return openPath(readStringField(payload, "path"))
  }

  if (command === "open_directory" || command === "openWslUnc") {
    return openPath(readStringField(payload, "path"))
  }

  if (REVEAL_ITEM_COMMANDS.has(command)) {
    return revealItemInDir(readStringField(payload, "path"))
  }

  if (TRASH_ITEM_COMMANDS.has(command)) {
    const path = readStringField(payload, "path")
    if (path) await revealItemInDir(path)
    return false
  }

  if (BEEP_COMMANDS.has(command)) {
    return
  }

  if (COPY_TEXT_COMMANDS.has(command)) {
    return copyText(readStringField(payload, "text"))
  }

  if (COPY_FILE_COMMANDS.has(command)) {
    copiedHostFiles = readStringArrayField(payload, "paths")
    return copiedHostFiles.length > 0
  }

  if (COPY_IMAGE_COMMANDS.has(command)) {
    return copyImagePayload(payload)
  }

  if (GET_COPIED_FILES_COMMANDS.has(command)) {
    return copiedHostFiles
  }

  if (FILE_ICON_COMMANDS.has(command)) {
    return ""
  }

  if (NOTIFICATION_COMMANDS.has(command)) {
    const body = asRecord(payload)
    return sendSystemNotification(
      body?.title ? String(body.title) : "OTools",
      body?.body ? String(body.body) : body?.message ? String(body.message) : ""
    )
  }

  switch (command) {
    case "bridge_ping":
      return "invoke-ok"
    case "otools_get_all_plugins":
      return listOtoolsPlugins()
    case "otools_reload_all_plugins":
      window.dispatchEvent(new Event(OTOOLS_HOST_RELOAD_PLUGINS_EVENT))
      return true
    case "otools_request_app_exit":
      return closeCurrentWindow()
    case "show_main_window":
      if (isDesktop()) {
        return getTransport().call("otools_show_main_window")
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
    case "tools_sync_child_webview_locale":
    case "create_embedded_webview":
    case "close_embedded_webview":
    case "switch_and_position_embedded_webviews":
      return true
    case "__otools_dialog_open":
    case "plugin:dialog|open":
      return openFileDialog(extractDialogOpenOptions(payload))
    case "__otools_dialog_save":
    case "plugin:dialog|save":
      return saveDialog(extractDialogSaveOptions(payload))
    case "tools_webview_pick_files":
      return pickFiles(payload)
    case "tools_webview_pick_folder":
      return pickFolder(payload)
    case "tools_webview_pick_save_path":
      return pickSavePath(payload)
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
    case "__otools_poll_events":
      return getTransport().call("otools_poll_events")
    case "__otools_close_window":
    case "plugin:window|close":
      return closeCurrentWindow()
    case "plugin:window|is_focused":
      return document.hasFocus()
    case "plugin:window|is_visible":
      return !document.hidden
    case "plugin:window|is_maximized":
    case "plugin:window|is_minimized":
      return false
    case "plugin:window|title":
      return document.title || "OTools"
    case "plugin:window|set_focus":
      window.focus()
      return
    case "plugin:window|get_all_windows":
      return [WINDOW_LABEL]
    case "otools_get_launch_at_startup":
      return false
    case "otools_set_launch_at_startup":
      if (readBooleanField(payload, "enabled")) {
        throw new Error("codeg-plus 暂未实现 launch-at-startup 宿主能力")
      }
      return false
    default:
      break
  }

  if (command === "native_plugin_invoke") {
    const native = asRecord(payload)
    return invokeOtoolsNative(
      resolvePayloadPluginUuid(targetPluginUuid, native),
      native?.method ? String(native.method) : command,
      native?.payload
    )
  }

  if (command === "native_plugin_reload") {
    return {
      ok: true,
      pluginUuid: targetPluginUuid,
    }
  }

  if (command === "native_plugin_probe") {
    return {
      ok: true,
      pluginUuid: targetPluginUuid,
      runtime: "codeg-plus",
      windowLabel: WINDOW_LABEL,
    }
  }

  if (
    command === "native_plugin_listen_acquire" ||
    command === "native_plugin_listen_release"
  ) {
    return {
      ok: true,
      pluginUuid: targetPluginUuid,
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
  pluginUuid: string
): string {
  const baseHref = new URL(".", entryUrl).toString()
  const script = `<script id="codeg-otools-bridge">${buildCompatBridgeScript(pluginUuid)}</script>`
  const base = `<base href="${escapeHtml(baseHref)}" />`
  const marker = `<meta name="codeg-otools-plugin" content="${escapeHtml(pluginUuid)}" />`
  const injected = `${base}${marker}${script}`

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

function buildCompatBridgeScript(pluginUuid: string): string {
  return `;(${otoolsCompatBootstrap.toString()})(${JSON.stringify({
    appName: "codeg-plus",
    appVersion: "0",
    currentBrowserUrl:
      typeof window !== "undefined" ? window.location.href : "",
    paths: {
      home: "/",
      desktop: "/desktop",
      documents: "/documents",
      downloads: "/downloads",
      temp: "/tmp",
      logs: "/logs",
    },
    pluginUuid,
    windowLabel: WINDOW_LABEL,
  })});`
}

function otoolsCompatBootstrap(config: {
  appName: string
  appVersion: string
  currentBrowserUrl: string
  paths: Record<string, string>
  pluginUuid: string
  windowLabel: string
}) {
  if (typeof window === "undefined" || window.otools) {
    return
  }

  const pluginUuid = String(config.pluginUuid || "").trim()
  const windowLabel = String(config.windowLabel || "otools")
  const currentPlatform = (() => {
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
  let requestSeq = 0
  let callbackSeq = 0
  let eventSeq = 0
  let polling = false

  const env = {
    appName: String(config.appName || "codeg-plus"),
    appVersion: String(config.appVersion || "0"),
    nativeId: pluginUuid,
    pluginUuid,
    platform: currentPlatform,
    isDev: false,
    currentBrowserUrl:
      String(config.currentBrowserUrl || "").trim() || window.location.href,
    paths: config.paths && typeof config.paths === "object" ? config.paths : {},
  }

  const toStringSafe = (value) => {
    if (value === null || value === undefined) {
      return ""
    }
    return String(value)
  }

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

  const postInvoke = (command, payload) => {
    const id = `${pluginUuid || "otools"}:${++requestSeq}`
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      window.parent.postMessage(
        {
          id,
          type: "otools:invoke",
          command,
          payload: payload ?? {},
        },
        "*"
      )
    })
  }

  window.addEventListener("message", (event) => {
    const message = event.data
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
    transformCallbacks.delete(Number(id))
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

    for (const listener of eventListeners.values()) {
      if (listener.event !== topic) {
        continue
      }
      fireTransformCallback(listener.handlerId, {
        event: listener.event,
        id: listener.id,
        payload:
          item && typeof item === "object" && "payload" in item
            ? item.payload
            : null,
      })
    }
  }

  const pollNativeLoop = async () => {
    if (polling) return
    polling = true

    while (nativeListeners.size > 0 || eventListeners.size > 0) {
      try {
        const events = await postInvoke("__otools_poll_events", {})
        if (Array.isArray(events)) {
          for (const item of events) {
            dispatchNativeEnvelope(item)
          }
        }
      } catch {}

      await new Promise((resolve) => window.setTimeout(resolve, 600))
    }

    polling = false
  }

  const acquireNativeListener = async (uuid, handler, filter) => {
    const targetUuid = resolvePluginUuid(uuid)
    if (typeof handler !== "function") {
      throw new Error("listenNative handler required")
    }

    await postInvoke("native_plugin_listen_acquire", {
      uuid: targetUuid,
    }).catch(() => null)

    const wrappedHandler = (event) => {
      if (typeof filter === "function" && !filter(event)) {
        return
      }
      handler(event)
    }
    nativeListeners.add(wrappedHandler)
    void pollNativeLoop()

    return async () => {
      nativeListeners.delete(wrappedHandler)
      await postInvoke("native_plugin_listen_release", {
        uuid: targetUuid,
      }).catch(() => null)
    }
  }

  const registerEventListener = (payload) => {
    const event = toStringSafe(payload && payload.event).trim()
    const handlerId = Number(payload && payload.handler)
    if (!event || !Number.isFinite(handlerId)) {
      throw new Error("plugin:event|listen requires event and handler")
    }

    const id = ++eventSeq
    eventListeners.set(id, {
      event,
      handlerId,
      id,
    })
    void pollNativeLoop()
    return id
  }

  const unregisterEventListener = (payload) => {
    const eventId = Number(payload && payload.eventId)
    if (Number.isFinite(eventId)) {
      eventListeners.delete(eventId)
    }
  }

  const emitLocalEvent = (payload) => {
    const event = toStringSafe(payload && payload.event).trim()
    if (!event) return
    const data = {
      event,
      id: -1,
      payload: payload ? (payload.payload ?? null) : null,
    }
    for (const listener of eventListeners.values()) {
      if (listener.event !== event) continue
      fireTransformCallback(listener.handlerId, data)
    }
  }

  const tauriInvoke = async (command, payload) => {
    switch (command) {
      case "plugin:event|listen":
        return registerEventListener(payload)
      case "plugin:event|unlisten":
        unregisterEventListener(payload)
        return
      case "plugin:event|emit":
      case "plugin:event|emit_to":
        emitLocalEvent(payload)
        return
      default:
        return postInvoke(command, payload ?? {})
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
      return tauriInvoke("plugin:dialog|message", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel:
          typeof options === "string" ? undefined : options && options.okLabel,
      })
    },
    confirm(messageText, options) {
      return tauriInvoke("plugin:dialog|confirm", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel:
          typeof options === "string" ? undefined : options && options.okLabel,
        cancelLabel:
          typeof options === "string"
            ? undefined
            : options && options.cancelLabel,
      })
    },
    ask(messageText, options) {
      return tauriInvoke("plugin:dialog|ask", {
        message: toStringSafe(messageText),
        title: typeof options === "string" ? options : options && options.title,
        kind: typeof options === "string" ? undefined : options && options.kind,
        okLabel:
          typeof options === "string" ? undefined : options && options.okLabel,
        cancelLabel:
          typeof options === "string"
            ? undefined
            : options && options.cancelLabel,
      })
    },
  }

  const shell = {
    open(path) {
      return tauriInvoke("__otools_open_path", { path: toStringSafe(path) })
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

  const baseApi = {
    dialog,
    runtime: {
      dialog,
      shell,
    },
    shell,
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
      return pluginUuid
    },
    getAppName() {
      return env.appName
    },
    getAppVersion() {
      return env.appVersion
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
      void tauriInvoke("otools_get_file_icon", { path: target }).catch(() => {})
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
    listenNative(handler) {
      return acquireNativeListener(pluginUuid, handler)
    },
    listenNativePlugin(uuid, handler) {
      const targetUuid = resolvePluginUuid(uuid)
      return acquireNativeListener(targetUuid, handler, (event) => {
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
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {}
  window.__TAURI_INTERNALS__.invoke = tauriInvoke
  window.__TAURI_INTERNALS__.transformCallback = transformCallback
  window.__TAURI_INTERNALS__.unregisterCallback = unregisterCallback
  window.__TAURI_INTERNALS__.convertFileSrc = (filePath) => filePath
  window.__TAURI_INTERNALS__.metadata = {
    currentWebview: { label: windowLabel },
    currentWindow: { label: windowLabel },
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ =
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {}
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = (
    _event,
    eventId
  ) => {
    eventListeners.delete(Number(eventId))
  }

  window.__OToolsHostInvoke = tauriInvoke
  window.isTauri = true

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

function inferScheme(command: string, payload: unknown): "local" | "sync" {
  if (command.includes("syncstate")) return "sync"
  const value = payload as { scheme?: string } | null
  return value?.scheme === "sync" ? "sync" : "local"
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

function hostTabExists(label: string): boolean {
  const normalized = String(label || "").trim()
  if (!normalized) return false
  return readHostWindowState().tabLabels.includes(normalized)
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

function extractDialogOpenOptions(payload: unknown): {
  directory?: boolean
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
    multiple: options?.multiple === true,
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

function extractDialogSaveOptions(payload: unknown): {
  defaultPath?: string
  title?: string
} {
  const record = asRecord(payload)
  const options = asRecord(record?.options ?? payload)
  return {
    defaultPath:
      typeof options?.defaultPath === "string"
        ? options.defaultPath
        : undefined,
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

function extractWebviewPickOptions(payload: unknown): {
  directory?: string
  multiple?: boolean
  title?: string
  suggestedName?: string
} {
  const record = asRecord(payload)
  const options = asRecord(record?.options ?? payload)
  return {
    directory:
      typeof options?.directory === "string" ? options.directory : undefined,
    multiple: options?.multiple === true,
    suggestedName:
      typeof options?.suggestedName === "string"
        ? options.suggestedName
        : undefined,
    title: typeof options?.title === "string" ? options.title : undefined,
  }
}

async function pickFiles(payload: unknown): Promise<string | string[] | null> {
  const options = extractWebviewPickOptions(payload)
  return openFileDialog({
    defaultPath: options.directory,
    multiple: options.multiple,
    title: options.title,
  })
}

async function pickFolder(payload: unknown): Promise<{ path: string } | null> {
  const options = extractWebviewPickOptions(payload)
  const result = await openFileDialog({
    defaultPath: options.directory,
    directory: true,
    title: options.title,
  })
  const path = Array.isArray(result) ? result[0] : result
  return typeof path === "string" && path.trim() ? { path: path.trim() } : null
}

async function pickSavePath(
  payload: unknown
): Promise<{ path: string } | null> {
  const options = extractWebviewPickOptions(payload)
  const defaultPath = options.suggestedName
    ? [options.directory, options.suggestedName].filter(Boolean).join("/")
    : options.directory
  const path = await saveDialog({
    defaultPath,
    title: options.title,
  })
  return path ? { path } : null
}

async function saveDialog(options: {
  defaultPath?: string
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

async function copyText(text: string): Promise<void> {
  if (!text.trim()) return
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
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

import type { OToolsAPI, OToolsPlatform } from "./otools-globals";
import {
  createOtoolsNativeEventClient,
  type OtoolsNativeEventHandler,
} from "./remote-service-otools-web-ws-shim";

type PostJson = <T = unknown>(path: string, body?: unknown) => Promise<T>;

export type OtoolsWebRuntimeOptions = {
  appName?: string;
  appVersion?: string;
  baseUrl?: string;
  eventClient?: ReturnType<typeof createOtoolsNativeEventClient>;
  fetchImpl?: typeof fetch;
  isDev?: boolean;
  platform?: OToolsPlatform | string;
  pluginUuid?: string;
  postJson?: PostJson;
  token?: string;
  WebSocketImpl?: typeof WebSocket;
  wsUrl?: string;
};

function getRuntimeGlobal() {
  if (typeof window !== "undefined") {
    return window;
  }
  return globalThis as typeof globalThis & {
    otools?: OToolsAPI;
    utools?: OToolsAPI;
    __OToolsEnv?: Record<string, unknown>;
    __OTOOLS_REMOTE_SERVICE__?: boolean;
    __TAURI_REMOTE_SERVICE__?: boolean;
  };
}

function normalizeBaseUrl(baseUrl = "") {
  return baseUrl.trim().replace(/\/+$/, "");
}

function readCodegToken(options: OtoolsWebRuntimeOptions): string {
  const explicit = String(options.token || "").trim();
  if (explicit) {
    return explicit;
  }
  try {
    return localStorage.getItem("codeg_token") || "";
  } catch {
    return "";
  }
}

function resolveWsUrl(options: OtoolsWebRuntimeOptions): string {
  if (options.wsUrl?.trim()) {
    return options.wsUrl.trim();
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const origin =
    baseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1");
  const url = new URL("/ws", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function normalizeDialogPath(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object") {
    const path = (value as { path?: unknown }).path;
    return typeof path === "string" ? path.trim() || null : null;
  }
  return null;
}

function normalizeDialogPathList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDialogPath(item))
      .filter((item): item is string => Boolean(item));
  }
  const path = normalizeDialogPath(value);
  return path ? [path] : [];
}

function buildFetchPost({
  baseUrl = "",
  token,
  fetchImpl = globalThis.fetch,
}: OtoolsWebRuntimeOptions): PostJson {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const authToken = token || readCodegToken({ token });

  return async (path, body) => {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw payload || new Error(`Request failed: ${path}`);
    }
    if (
      payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      (payload as { ok?: unknown }).ok === false
    ) {
      const error = (payload as { error?: { message?: string } }).error;
      throw new Error(error?.message || `Request failed: ${path}`);
    }
    if (
      payload &&
      typeof payload === "object" &&
      "ok" in payload &&
      "data" in payload
    ) {
      return (payload as { data?: unknown }).data;
    }
    return payload;
  };
}

export function createOtoolsWebFacade(options: OtoolsWebRuntimeOptions): OToolsAPI {
  const postJson = options.postJson || buildFetchPost(options);
  const token = readCodegToken(options);
  const defaultPluginUuid = String(options.pluginUuid || "").trim();
  const call = <T = unknown>(command: string, body?: unknown) =>
    postJson<T>(`/api/${command}`, body);
  const pluginOrDefault = (pluginUuid?: string) =>
    String(pluginUuid || defaultPluginUuid).trim();

  const eventClient =
    options.eventClient ||
    createOtoolsNativeEventClient({
      wsUrl: resolveWsUrl(options),
      token,
      WebSocketImpl: options.WebSocketImpl,
      acquire: (pluginUuid) =>
        call("native_plugin_listen_acquire", { uuid: pluginUuid }),
      release: (pluginUuid) =>
        call("native_plugin_listen_release", { uuid: pluginUuid }),
    });

  const invokeNativeCore = <T = unknown>(
    pluginUuid: string,
    method: string,
    payload: unknown,
  ) =>
    call<T>("native_plugin_invoke", {
      uuid: pluginOrDefault(pluginUuid),
      method,
      payload: payload ?? null,
    });

  const dialog = {
    async open(dialogOptions: {
      directory?: boolean;
      multiple?: boolean;
      defaultPath?: string;
      filters?: unknown;
      title?: string;
    } = {}) {
      if (dialogOptions.directory) {
        const folder = await call("tools_webview_pick_folder", {
          options: {
            directory: dialogOptions.defaultPath,
            title: dialogOptions.title,
          },
        });
        return normalizeDialogPath(folder);
      }

      const files = await call("tools_webview_pick_files", {
        options: {
          directory: dialogOptions.defaultPath,
          filters: dialogOptions.filters,
          multiple: dialogOptions.multiple,
          title: dialogOptions.title,
        },
      });
      const paths = normalizeDialogPathList(files);
      return dialogOptions.multiple ? paths : paths[0] || null;
    },
    async save(dialogOptions: {
      defaultPath?: string;
      filters?: unknown;
      title?: string;
    } = {}) {
      const path = await call("tools_webview_pick_save_path", {
        options: {
          directory: dialogOptions.defaultPath,
          filters: dialogOptions.filters,
          title: dialogOptions.title,
        },
      });
      return normalizeDialogPath(path);
    },
    async message(message: string) {
      if (typeof window !== "undefined") {
        window.alert(message);
      }
    },
    async confirm(message: string) {
      return typeof window !== "undefined" ? window.confirm(message) : false;
    },
    async ask(message: string) {
      return typeof window !== "undefined" ? window.confirm(message) : false;
    },
  };

  const shell = {
    openExternal: (url: string) =>
      call<void>("otools_shell_open_external", { url }),
    openPath: (path: string) => call<void>("otools_shell_open_path", { path }),
    showItemInFolder: (path: string) =>
      call<void>("otools_shell_show_item_in_folder", { path }),
  };

  return {
    isDev: () => Boolean(options.isDev),
    isMacOS: () => options.platform === "macos",
    isWindows: () => options.platform === "windows",
    isLinux: () => options.platform === "linux",
    getAppName: () => options.appName || "Codeg OTools",
    getAppVersion: () => options.appVersion || "",
    getPluginUuid: () => defaultPluginUuid,
    invokeNative: (method, payload) =>
      invokeNativeCore(defaultPluginUuid, method, payload),
    invokeNativeRaw: (method, payload) =>
      invokeNativeCore(defaultPluginUuid, method, payload),
    invokeNativePlugin: (pluginUuid, method, payload) =>
      invokeNativeCore(pluginUuid, method, payload),
    invokeNativePluginRaw: (pluginUuid: string, method: string, payload?: unknown) =>
      invokeNativeCore(pluginUuid, method, payload),
    probeNative: () => call("native_plugin_probe", { uuid: defaultPluginUuid }),
    probeNativePlugin: (pluginUuid: string) =>
      call("native_plugin_probe", { uuid: pluginUuid }),
    reloadNative: () => call("native_plugin_reload", { uuid: defaultPluginUuid }),
    reloadNativePlugin: (pluginUuid: string) =>
      call("native_plugin_reload", { uuid: pluginUuid }),
    listenNative: (handler, optionsArg) =>
      eventClient.listen(defaultPluginUuid, handler, optionsArg),
    listenNativePlugin: (
      pluginUuid: string,
      handler: OtoolsNativeEventHandler,
      optionsArg?: unknown,
    ) =>
      eventClient.listen(pluginUuid, handler, optionsArg),
    getPluginLocalState: (plugin, scheme) =>
      call("get_otools_plugin_localstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
      }),
    savePluginLocalState: (plugin, state, scheme) =>
      call<void>("save_otools_plugin_localstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        state,
      }),
    getPluginLocalStateValue: (plugin, key, scheme) =>
      call("get_otools_plugin_localstate_value_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        key,
      }),
    savePluginLocalStateValue: (plugin, key, value, scheme) =>
      call<void>("save_otools_plugin_localstate_value_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        key,
        value,
      }),
    patchPluginLocalState: (plugin, patch, scheme) =>
      call<void>("patch_otools_plugin_localstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        patch: patch ?? {},
      }),
    shellOpenExternal: (url) => {
      void shell.openExternal(url);
    },
    shellOpenPath: (path) => {
      void shell.openPath(path);
    },
    shellShowItemInFolder: (path) => {
      void shell.showItemInFolder(path);
    },
    dialog,
    runtime: { dialog, shell },
    shell,
  } as OToolsAPI;
}

export function installOtoolsWebRuntime(options: OtoolsWebRuntimeOptions) {
  const facade = createOtoolsWebFacade(options);
  const runtimeGlobal = getRuntimeGlobal();

  runtimeGlobal.__OToolsEnv = {
    ...(runtimeGlobal.__OToolsEnv || {}),
    runtime: "web",
    pluginUuid: options.pluginUuid,
    appName: options.appName,
    appVersion: options.appVersion,
    platform: options.platform,
    isDev: Boolean(options.isDev),
  };
  runtimeGlobal.__OTOOLS_REMOTE_SERVICE__ = true;
  runtimeGlobal.__TAURI_REMOTE_SERVICE__ = true;
  runtimeGlobal.otools = facade;
  runtimeGlobal.utools = facade;
  return facade;
}

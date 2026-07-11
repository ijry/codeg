import {
  attachTransformListener,
  detachTransformListener,
  listenNativeTopic,
} from "./native-event-bridge";
import type {
  OToolsAPI,
  OToolsShellAPI,
  TauriInternals,
} from "./otools-globals";
import { ensurePopupManager } from "./popup-manager";

type InvokePayload = unknown;
type LocalEventDetail = { payload: unknown };
type EventPayload = Record<string, unknown>;

const LOCAL_EVENT_PREFIX = "otools:";
const LOCAL_TAURI_EVENT_PREFIX = "otools-tauri:";
const TAURI_LISTEN_TARGET = { kind: "Any" } as const;

const DIRECT_TAURI_NOOP_COMMANDS = new Set([
  "set_window_theme",
  "update_tray_menu",
]);

const POPUP_COMMANDS = new Set([
  "open_commit_window",
  "open_merge_window",
  "open_settings_window",
  "open_stash_window",
  "open_push_window",
  "open_project_boot_window",
]);

const isBrowserWindowAvailable = () => typeof window !== "undefined";
const isTauriPluginCommand = (command: string) =>
  command.startsWith("plugin:");
const normalizePluginUuid = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const splitAt = raw.lastIndexOf(":");
  if (splitAt <= 0 || splitAt >= raw.length - 1) {
    return raw;
  }

  const source = raw.slice(0, splitAt).trim().toLowerCase();
  const pluginId = raw.slice(splitAt + 1).trim();
  if (!pluginId) {
    return raw;
  }

  if (
    source === "builtin" ||
    source === "market" ||
    source === "dev-debug" ||
    source === "dev-workspace"
  ) {
    return pluginId;
  }

  return raw;
};

const shouldFallbackToNativeInvoke = (error: unknown): boolean => {
  const parts: string[] = [];
  const text = String(error ?? "");
  if (text) {
    parts.push(text);
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = String(record.message ?? "");
    const code = String(record.code ?? "");
    const detail = String(record.detail ?? "");
    if (message) {
      parts.push(message);
    }
    if (code) {
      parts.push(code);
    }
    if (detail) {
      parts.push(detail);
    }
  }
  const merged = parts.join(" | ");
  if (!merged) {
    return false;
  }

  const lower = merged.toLowerCase();
  return (
    lower.includes("not allowed") ||
    lower.includes("command not found") ||
    lower.includes("unknown method") ||
    lower.includes("unknown command")
  );
};

export const getOtoolsApi = (): OToolsAPI | undefined => {
  if (!isBrowserWindowAvailable()) {
    return undefined;
  }
  for (const candidate of resolveOtoolsRuntimeCandidates()) {
    const api = candidate.otools ?? candidate.utools;
    if (api) {
      return api;
    }
  }
  return undefined;
};

export const isOtoolsPluginRuntime = (): boolean =>
  typeof getOtoolsApi()?.invokeNative === "function";

const resolveOtoolsRuntimeCandidates = (): Array<Window & { otools?: OToolsAPI; utools?: OToolsAPI }> => {
  if (!isBrowserWindowAvailable()) {
    return [];
  }

  const candidates: Array<Window & { otools?: OToolsAPI; utools?: OToolsAPI }> = [
    window as Window & { otools?: OToolsAPI; utools?: OToolsAPI },
  ];

  for (const resolver of [() => window.parent, () => window.top]) {
    try {
      const candidate = resolver() as Window & { otools?: OToolsAPI; utools?: OToolsAPI } | null;
      if (!candidate || candidate === window || candidates.includes(candidate)) {
        continue;
      }
      candidates.push(candidate);
    } catch {
      // Ignore cross-origin or sandboxed ancestor access.
    }
  }

  return candidates;
};

const hasPluginRuntimeHint = (): boolean => {
  if (!isBrowserWindowAvailable()) {
    return false;
  }

  try {
    const env = window.__OToolsEnv;
    if (typeof env?.pluginUuid === "string" && env.pluginUuid.trim()) {
      return true;
    }
    const params = new URLSearchParams(window.location.search || "");
    return Boolean(
      params.get("plugin") || params.get("pluginUuid") || params.get("plugin_uuid"),
    );
  } catch {
    return false;
  }
};

const waitForOtoolsApi = async (timeoutMs = 1200): Promise<OToolsAPI | undefined> => {
  if (!isBrowserWindowAvailable()) {
    return undefined;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const candidate of resolveOtoolsRuntimeCandidates()) {
      const api = candidate.otools ?? candidate.utools;
      if (typeof api?.invokeNative === "function" || typeof api?.invokeNativePlugin === "function") {
        return api;
      }
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, 20);
    });
  }

  return getOtoolsApi();
};

const readPluginUuidFromContext = (runtime: OToolsAPI | undefined) => {
  const fromRuntime = normalizePluginUuid(runtime?.getPluginUuid?.());
  if (fromRuntime) {
    return fromRuntime;
  }

  if (!isBrowserWindowAvailable()) {
    return "";
  }

  try {
    const env = window.__OToolsEnv;
    const fromEnv = normalizePluginUuid(env?.pluginUuid);
    if (fromEnv) {
      return fromEnv;
    }
    const params = new URLSearchParams(window.location.search || "");
    return normalizePluginUuid(
      params.get("plugin") ||
      params.get("pluginUuid") ||
      params.get("plugin_uuid") ||
      "",
    );
  } catch {
    return "";
  }
};

const getTauriInternals = (): TauriInternals | undefined => {
  if (!isBrowserWindowAvailable()) {
    return undefined;
  }
  return window.__TAURI_INTERNALS__;
};

const createLocalEventName = (event: string) => `${LOCAL_EVENT_PREFIX}${event}`;
const createLocalTauriEventName = (event: string) =>
  `${LOCAL_TAURI_EVENT_PREFIX}${event}`;

const emitLocalEvent = (event: string, payload: unknown) => {
  if (!isBrowserWindowAvailable()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LocalEventDetail>(createLocalEventName(event), {
      detail: { payload },
    }),
  );
};

const emitLocalTauriEvent = (event: string, payload: unknown) => {
  if (!isBrowserWindowAvailable()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LocalEventDetail>(createLocalTauriEventName(event), {
      detail: { payload },
    }),
  );
};

const asPayloadRecord = (payload: InvokePayload): EventPayload | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as EventPayload;
};

const emitSyntheticEventsAfterInvoke = (
  command: string,
  payload: InvokePayload,
  result: unknown,
) => {
  const body = asPayloadRecord(payload);

  if (command === "switch_provider" && body?.app && body?.id) {
    emitLocalEvent("provider-switched", {
      appType: body.app,
      providerId: body.id,
      source: "native-plugin",
      result,
    });
  }

  if (command === "sync_universal_provider" && body?.id) {
    emitLocalEvent("universal-provider-synced", {
      id: body.id,
      result,
    });
  }
};

const invokeTauri = async <T>(
  command: string,
  payload?: InvokePayload,
): Promise<T> => {
  const internals = getTauriInternals();
  if (!internals?.invoke) {
    throw new Error("Tauri runtime is unavailable");
  }

  return internals.invoke<T>(
    command,
    payload as Record<string, unknown> | undefined,
  );
};

const normalizeTauriCallbackPayload = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "payload" in payload) {
    return ((payload as { payload?: unknown }).payload ?? null) as T;
  }
  return payload as T;
};

async function listenTauri<T>(
  event: string,
  handler: (event: Event<T>) => void | Promise<void>,
): Promise<UnlistenFn> {
  const internals = getTauriInternals();
  if (!internals?.invoke || !internals.transformCallback) {
    throw new Error("Tauri event runtime is unavailable");
  }

  const handlerId = internals.transformCallback((payload) => {
    void handler({
      event,
      id: -1,
      payload: normalizeTauriCallbackPayload<T>(payload),
    });
  }, false);

  const eventId = await internals.invoke<number>("plugin:event|listen", {
    event,
    target: TAURI_LISTEN_TARGET,
    handler: handlerId,
  });

  return async () => {
    try {
      await window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener?.(
        event,
        eventId,
      );
    } catch {
      // The backend unlisten below still clears the server-side listener.
    }

    internals.unregisterCallback?.(handlerId);
    await internals.invoke("plugin:event|unlisten", {
      event,
      eventId,
    });
  };
}

export async function invoke<T = unknown>(
  command: string,
  payload?: InvokePayload,
): Promise<T> {
  let otools = getOtoolsApi();
  const pluginRuntimeHint = hasPluginRuntimeHint();
  if (!isOtoolsPluginRuntime() && pluginRuntimeHint) {
    otools = await waitForOtoolsApi();
  }

  if (typeof otools?.invokeNative !== "function") {
    const pluginUuid = readPluginUuidFromContext(otools);
    if (pluginUuid && typeof otools?.invokeNativePlugin === "function") {
      return otools.invokeNativePlugin<T>(pluginUuid, command, payload ?? null);
    }
    try {
      return await invokeTauri<T>(command, payload);
    } catch (error) {
      if (!pluginRuntimeHint || isTauriPluginCommand(command) || !shouldFallbackToNativeInvoke(error)) {
        throw error;
      }

      const lateOtools = await waitForOtoolsApi();
      const latePluginUuid = readPluginUuidFromContext(lateOtools);
      if (latePluginUuid && typeof lateOtools?.invokeNativePlugin === "function") {
        return lateOtools.invokeNativePlugin<T>(latePluginUuid, command, payload ?? null);
      }
      if (typeof lateOtools?.invokeNative !== "function") {
        throw error;
      }

      return lateOtools.invokeNative<T>(command, payload ?? null);
    }
  }

  if (command === "get_init_error") {
    return null as T;
  }

  if (DIRECT_TAURI_NOOP_COMMANDS.has(command)) {
    return true as T;
  }

  if (command === "plugin:event|listen") {
    const body = asPayloadRecord(payload);
    const event = typeof body?.event === "string" ? body.event : "";
    const handlerId = typeof body?.handler === "number" ? body.handler : NaN;
    if (!event || Number.isNaN(handlerId)) {
      throw new Error("plugin:event|listen requires event and handler");
    }

    return (await attachTransformListener(event, handlerId)) as T;
  }

  if (command === "plugin:event|unlisten") {
    const body = asPayloadRecord(payload);
    const eventId = typeof body?.eventId === "number" ? body.eventId : NaN;
    if (!Number.isNaN(eventId)) {
      await detachTransformListener(eventId);
    }
    return undefined as T;
  }

  if (isTauriPluginCommand(command)) {
    return invokeTauri<T>(command, payload);
  }

  if (POPUP_COMMANDS.has(command)) {
    const result = await otools.invokeNative<{ path?: string }>(
      command,
      payload ?? null,
    );
    const path = typeof result?.path === "string" ? result.path : null;
    if (path) {
      ensurePopupManager().open(path, command, payload);
      return undefined as T;
    }
    return result as T;
  }

  const result = await otools.invokeNative<T>(command, payload ?? null);
  emitSyntheticEventsAfterInvoke(command, payload, result);
  return result;
}

export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

export type UnlistenFn = () => Promise<void> | void;

export async function listen<T>(
  event: string,
  handler: (event: Event<T>) => void | Promise<void>,
): Promise<UnlistenFn> {
  let otools = getOtoolsApi();
  const pluginRuntimeHint = hasPluginRuntimeHint();
  if (!isOtoolsPluginRuntime() && pluginRuntimeHint) {
    otools = await waitForOtoolsApi();
  }

  if (typeof otools?.invokeNative !== "function") {
    return listenTauri<T>(event, handler);
  }

  const localEventListener = (raw: globalThis.Event) => {
    const detail = (raw as CustomEvent<LocalEventDetail>).detail;
    void handler({
      event,
      id: -1,
      payload: (detail?.payload ?? null) as T,
    });
  };

  window.addEventListener(createLocalTauriEventName(event), localEventListener);

  const nativeUnlisten = await listenNativeTopic<T>(event, async (eventPayload) => {
    await handler({
      event,
      id: -1,
      payload: eventPayload,
    });
  });

  return async () => {
    await nativeUnlisten();
    window.removeEventListener(
      createLocalTauriEventName(event),
      localEventListener,
    );
  };
}

export async function emit<T = unknown>(
  event: string,
  payload?: T,
): Promise<void> {
  emitLocalTauriEvent(event, payload ?? null);
}

export async function once<T>(
  event: string,
  handler: (event: Event<T>) => void | Promise<void>,
): Promise<UnlistenFn> {
  let unlisten: UnlistenFn | null = null;
  unlisten = await listen<T>(event, async (eventPayload) => {
    if (unlisten) {
      await unlisten();
    }
    await handler(eventPayload);
  });
  return unlisten;
}

function resolveShellApi(otools: OToolsAPI): OToolsShellAPI | undefined {
  return otools.shell ?? otools.runtime?.shell ?? undefined;
}

export function openExternal(url: string): boolean {
  const otools = getOtoolsApi();
  if (!otools) {
    return false;
  }

  const shell = resolveShellApi(otools);
  if (typeof shell?.openExternal === "function") {
    void shell.openExternal(url);
    return true;
  }

  otools.shellOpenExternal(url);
  return true;
}

export function openPath(fullPath: string): boolean {
  const otools = getOtoolsApi();
  if (!otools) {
    return false;
  }

  const shell = resolveShellApi(otools);
  if (typeof shell?.openPath === "function") {
    void shell.openPath(fullPath);
    return true;
  }

  otools.shellOpenPath(fullPath);
  return true;
}

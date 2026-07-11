import {
  buildRemoteFileUrl,
  isLocalFilePath,
  normalizeLocalFilePath,
} from "../../../remote-service-compat-file-shim";
import {
  emit as emitRuntime,
  invoke as invokeRuntime,
  listen as listenRuntime,
  once as onceRuntime,
} from "../../../runtime";

export type InvokeArgs = Record<string, unknown> | undefined;
export type HostUnlistenFn = () => void | Promise<void>;
export type HostEventTarget =
  | string
  | {
      kind: string;
      label?: string;
    };

export interface HostBridgeConfig {
  includeAncestors?: boolean;
}

export interface HostListenOptions extends HostBridgeConfig {
  target?: HostEventTarget;
}

type NativeInvokeFn = (
  command: string,
  args?: InvokeArgs,
  options?: unknown,
) => Promise<unknown>;
type NativeConvertFileSrcFn = (value: string, protocol?: string) => string;
type NativeTransformCallbackFn = (callback?: unknown, once?: boolean) => number;
type NativeUnregisterCallbackFn = (id: number) => void;
type NativeUnregisterListenerFn = (event: string, eventId: number) => void;

interface NativeTauriContext {
  invoke?: NativeInvokeFn;
  convertFileSrc?: NativeConvertFileSrcFn;
  transformCallback?: NativeTransformCallbackFn;
  unregisterCallback?: NativeUnregisterCallbackFn;
  unregisterListener?: NativeUnregisterListenerFn;
}

type NativeWindowCandidate = Window & {
  __TAURI_INTERNALS__?: NativeTauriContext;
  __TAURI_EVENT_PLUGIN_INTERNALS__?: {
    unregisterListener?: NativeUnregisterListenerFn;
  };
  __TAURI_REMOTE_SERVICE__?: boolean;
  __OTOOLS_REMOTE_SERVICE__?: boolean;
};

const resolveContextCandidates = (
  includeAncestors = false,
): NativeWindowCandidate[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const candidates: NativeWindowCandidate[] = [
    window as NativeWindowCandidate,
  ];
  if (!includeAncestors) {
    return candidates;
  }

  for (const resolver of [() => window.parent, () => window.top]) {
    try {
      const candidate = resolver() as NativeWindowCandidate | null;
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

export const resolveNativeTauriContext = (
  config: HostBridgeConfig = {},
): NativeTauriContext | null => {
  for (const candidate of resolveContextCandidates(config.includeAncestors)) {
    const internals = candidate?.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== "function") {
      continue;
    }

    return {
      invoke: internals.invoke.bind(internals),
      convertFileSrc:
        typeof internals.convertFileSrc === "function"
          ? internals.convertFileSrc.bind(internals)
          : undefined,
      transformCallback:
        typeof internals.transformCallback === "function"
          ? internals.transformCallback.bind(internals)
          : undefined,
      unregisterCallback:
        typeof internals.unregisterCallback === "function"
          ? internals.unregisterCallback.bind(internals)
          : undefined,
      unregisterListener:
        typeof candidate?.__TAURI_EVENT_PLUGIN_INTERNALS__
          ?.unregisterListener === "function"
          ? candidate.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener.bind(
              candidate.__TAURI_EVENT_PLUGIN_INTERNALS__,
            )
          : undefined,
    };
  }

  return null;
};

export const isNativeTauriRuntime = (config: HostBridgeConfig = {}): boolean =>
  typeof resolveNativeTauriContext(config)?.invoke === "function";

export const isRemoteServiceRuntime = (): boolean => {
  if (isNativeTauriRuntime({ includeAncestors: true })) {
    return false;
  }

  return (
    typeof window !== "undefined" &&
    ((window as NativeWindowCandidate).__TAURI_REMOTE_SERVICE__ === true ||
      (window as NativeWindowCandidate).__OTOOLS_REMOTE_SERVICE__ === true)
  );
};

export const hasHostBridgeRuntime = (config: HostBridgeConfig = {}): boolean =>
  isNativeTauriRuntime(config) || isRemoteServiceRuntime();

const normalizeTarget = (target?: HostEventTarget) => {
  if (typeof target === "string") {
    return { kind: "AnyLabel", label: target };
  }
  return target ?? { kind: "Any" };
};

export const hostInvoke = async <T = unknown>(
  command: string,
  args?: InvokeArgs,
  options?: unknown,
  config: HostBridgeConfig = {},
): Promise<T> => {
  const native = resolveNativeTauriContext(config);
  if (native?.invoke) {
    return native.invoke(command, args, options) as Promise<T>;
  }

  return invokeRuntime<T>(command, args);
};

export const hostConvertFileSrc = (
  value: string,
  protocol = "asset",
  config: HostBridgeConfig = {},
): string => {
  const normalized = normalizeLocalFilePath(value);
  if (!isLocalFilePath(normalized)) {
    return value;
  }

  const native = resolveNativeTauriContext(config);
  if (native?.convertFileSrc) {
    return native.convertFileSrc(normalized, protocol);
  }

  return buildRemoteFileUrl(normalized);
};

export const createNativeCallbackChannel = <T = unknown>(
  callback?: (payload: T) => void,
  once = false,
  config: HostBridgeConfig = {},
): number => {
  const native = resolveNativeTauriContext(config);
  if (typeof native?.transformCallback !== "function") {
    throw new Error("Tauri transformCallback is unavailable");
  }

  return native.transformCallback(callback, once);
};

export const unregisterNativeCallbackChannel = (
  id: number,
  config: HostBridgeConfig = {},
) => {
  const native = resolveNativeTauriContext(config);
  native?.unregisterCallback?.(id);
};

export const unregisterNativeEventListener = async (
  event: string,
  eventId: number,
  config: HostBridgeConfig = {},
) => {
  const native = resolveNativeTauriContext(config);
  native?.unregisterListener?.(event, eventId);

  await hostInvoke(
    "plugin:event|unlisten",
    {
      event,
      eventId,
    },
    undefined,
    config,
  );
};

export const hostListen = async <T = unknown>(
  event: string,
  handler: (payload: { event: string; id: number | string; payload: T }) => void,
  options: HostListenOptions = {},
): Promise<HostUnlistenFn> => {
  if (!isNativeTauriRuntime(options)) {
    return listenRuntime(event, handler);
  }

  const callbackId = createNativeCallbackChannel<
    { event: string; id: number | string; payload: T }
  >(handler, false, options);

  const eventId = await hostInvoke<number>(
    "plugin:event|listen",
    {
      event,
      target: normalizeTarget(options.target),
      handler: callbackId,
    },
    undefined,
    options,
  );

  return async () => {
    unregisterNativeCallbackChannel(callbackId, options);
    await unregisterNativeEventListener(event, eventId, options);
  };
};

export const hostOnce = async <T = unknown>(
  event: string,
  handler: (payload: { event: string; id: number | string; payload: T }) => void,
  options: HostListenOptions = {},
): Promise<HostUnlistenFn> => {
  if (!isNativeTauriRuntime(options)) {
    return onceRuntime(event, handler);
  }

  const unlisten = await hostListen<T>(
    event,
    async (payload) => {
      await unlisten();
      handler(payload);
    },
    options,
  );

  return unlisten;
};

export const hostEmit = async (
  event: string,
  payload?: unknown,
  config: HostBridgeConfig = {},
): Promise<void> => {
  if (!isNativeTauriRuntime(config)) {
    await emitRuntime(event, payload);
    return;
  }

  await hostInvoke(
    "plugin:event|emit",
    {
      event,
      payload,
    },
    undefined,
    config,
  );
};

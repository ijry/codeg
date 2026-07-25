export type OtoolsNativeEvent = {
  payload: {
    pluginUuid?: string;
    topic?: string;
    payload?: unknown;
  };
};

export type OtoolsNativeEventHandler = (
  event: OtoolsNativeEvent,
) => void | Promise<void>;

export type OtoolsNativeEventClientOptions = {
  wsUrl: string;
  token?: string;
  WebSocketImpl?: typeof WebSocket;
  acquire?: (pluginUuid: string) => Promise<void>;
  release?: (pluginUuid: string) => Promise<void>;
};

type SocketState = {
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  manuallyClosed: boolean;
  connectionState: "idle" | "connecting" | "open" | "closed";
  nextListenerId: number;
  handlersByPlugin: Map<string, Map<number, OtoolsNativeEventHandler>>;
};

const CODEG_WS_PROTOCOL = "codeg-events";
const CODEG_WS_TOKEN_PROTOCOL_PREFIX = "codeg-token.";
const WS_CONNECTING = 0;
const WS_OPEN = 1;

function createSocketState(): SocketState {
  return {
    ws: null,
    reconnectTimer: null,
    manuallyClosed: false,
    connectionState: "idle",
    nextListenerId: 1,
    handlersByPlugin: new Map(),
  };
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildCodegWebSocketProtocols(token?: string): string[] {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    return [CODEG_WS_PROTOCOL];
  }
  return [
    CODEG_WS_PROTOCOL,
    `${CODEG_WS_TOKEN_PROTOCOL_PREFIX}${base64UrlEncode(trimmed)}`,
  ];
}

function readEventChannel(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const channel = (payload as { channel?: unknown }).channel;
  return typeof channel === "string" ? channel : "";
}

function readEventPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return (payload as { payload?: unknown }).payload ?? null;
}

export function createOtoolsNativeEventClient({
  wsUrl,
  token,
  WebSocketImpl = globalThis.WebSocket,
  acquire,
  release,
}: OtoolsNativeEventClientOptions) {
  if (typeof WebSocketImpl !== "function") {
    throw new Error("WebSocket is unavailable");
  }

  const state = createSocketState();

  const ensureSocket = () => {
    const current = state.ws;
    if (
      current &&
      (current.readyState === WS_CONNECTING || current.readyState === WS_OPEN)
    ) {
      return;
    }

    state.connectionState = "connecting";
    state.ws = new WebSocketImpl(wsUrl, buildCodegWebSocketProtocols(token));

    state.ws.onopen = () => {
      state.connectionState = "open";
    };

    state.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const channel = readEventChannel(message);
      if (!channel.startsWith("otools-native:")) {
        return;
      }

      const pluginUuid = channel.slice("otools-native:".length);
      const handlers = state.handlersByPlugin.get(pluginUuid);
      if (!handlers) {
        return;
      }

      const payload = readEventPayload(message);
      for (const handler of handlers.values()) {
        const body =
          payload && typeof payload === "object"
            ? (payload as OtoolsNativeEvent["payload"])
            : { payload };
        void handler({
          payload: {
            ...body,
            pluginUuid,
          },
        });
      }
    };

    state.ws.onclose = () => {
      state.connectionState = "closed";
      state.ws = null;
      if (!state.manuallyClosed) {
        state.reconnectTimer = setTimeout(() => {
          ensureSocket();
        }, 1000);
      }
    };
  };

  return {
    async listen(
      pluginUuid: string,
      handler: OtoolsNativeEventHandler,
      _options?: unknown,
    ) {
      const normalizedPluginUuid = String(pluginUuid || "").trim();
      if (!normalizedPluginUuid) {
        throw new Error("pluginUuid is required");
      }
      if (typeof handler !== "function") {
        throw new Error("handler must be a function");
      }

      let handlers = state.handlersByPlugin.get(normalizedPluginUuid);
      const shouldAcquire = !handlers;
      if (!handlers) {
        handlers = new Map();
        state.handlersByPlugin.set(normalizedPluginUuid, handlers);
      }

      const listenerId = state.nextListenerId++;
      handlers.set(listenerId, handler);
      if (shouldAcquire) {
        await acquire?.(normalizedPluginUuid);
      }
      ensureSocket();

      return async () => {
        const currentHandlers = state.handlersByPlugin.get(normalizedPluginUuid);
        if (!currentHandlers) {
          return;
        }
        currentHandlers.delete(listenerId);
        if (currentHandlers.size === 0) {
          state.handlersByPlugin.delete(normalizedPluginUuid);
          await release?.(normalizedPluginUuid);
        }
      };
    },

    close() {
      state.manuallyClosed = true;
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.ws) {
        state.ws.close();
      }
    },

    getConnectionState() {
      return state.connectionState;
    },
  };
}

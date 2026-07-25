import type {
  OToolsAPI,
  OToolsEnv,
  OToolsPlatform,
  OToolsPluginEnterAction,
  OToolsSubInputEvent,
} from "./otools-globals";
import {
  createOtoolsNativeEventClient,
  type OtoolsNativeEventHandler,
} from "./remote-service-otools-web-ws-shim";

type PostJson = <T = unknown>(path: string, body?: unknown) => Promise<T>;

type NoderRuntimeApi = {
  require?: ((specifier: string) => unknown) & {
    cache?: unknown;
    resolve?: (specifier: string) => string;
  };
  createRequire?: (
    filename?: string,
  ) => ((specifier: string) => unknown) & {
    cache?: unknown;
    resolve?: (specifier: string) => string;
  };
  getSdkModules?: () => {
    runtime?: {
      builtinModules?: string[];
    };
  };
};

export type OtoolsWebRuntimeOptions = {
  appName?: string;
  appVersion?: string;
  baseUrl?: string;
  currentBrowserUrl?: string;
  currentFolderPath?: string;
  enterAction?: unknown;
  eventClient?: ReturnType<typeof createOtoolsNativeEventClient>;
  fetchImpl?: typeof fetch;
  isDev?: boolean;
  nativeId?: string;
  paths?: Record<string, string>;
  platform?: OToolsPlatform | string;
  pluginPermissions?: string[];
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
    __OTOOLS_NODER__?: NoderRuntimeApi;
    __OTOOLS_REMOTE_SERVICE__?: boolean;
    __TAURI_REMOTE_SERVICE__?: boolean;
  };
}

function normalizeBaseUrl(baseUrl = "") {
  return baseUrl.trim().replace(/\/+$/, "");
}

function normalizePluginUuid(value: unknown) {
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
}

function normalizePlatform(value: unknown): OToolsPlatform {
  const platform = String(value || "").trim().toLowerCase();
  if (platform.includes("win")) {
    return "windows";
  }
  if (platform.includes("mac") || platform === "darwin") {
    return "macos";
  }
  if (platform.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNativePluginUuid(payload: unknown): string {
  const record = readRecord(payload);
  return normalizePluginUuid(
    record.uuid ?? record.pluginUuid ?? record.plugin_uuid ?? record.plugin,
  );
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
  const url = new URL("/ws/events", origin);
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

function normalizeFileList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function encodeCompatStorageValue(value: unknown): string {
  try {
    return JSON.stringify({ value });
  } catch {
    return JSON.stringify({ value: String(value ?? "") });
  }
}

function decodeCompatStorageValue(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "value" in parsed) {
      return (parsed as { value?: unknown }).value ?? null;
    }
    return parsed;
  } catch {
    return raw;
  }
}

function readJsonParam(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeEnterAction(
  value: unknown,
  fallback: OToolsPluginEnterAction,
): OToolsPluginEnterAction {
  const record = readRecord(value);
  if (!Object.keys(record).length) {
    return { ...fallback };
  }
  return {
    ...record,
    code: String(record.code ?? record.cmd ?? record.featureCode ?? "").trim(),
    type: String(record.type ?? ""),
    payload: "payload" in record ? record.payload : null,
    option: "option" in record ? record.option : null,
  };
}

function readSubInputText(value: unknown): string {
  const record = readRecord(value);
  if ("text" in record) {
    return String(record.text ?? "");
  }
  if ("value" in record) {
    return String(record.value ?? "");
  }
  return String(value ?? "");
}

type CompatUBrowserStep = {
  method: string;
  args: unknown[];
};

function readImagePayloadString(value: unknown): string {
  const record = readRecord(value);
  const image = "image" in record ? record.image : value;
  const imageRecord = readRecord(image);
  if (typeof image === "string") {
    const text = image.trim();
    if (!text) {
      return "";
    }
    if (text.startsWith("data:")) {
      return text;
    }
    return `data:image/png;base64,${text}`;
  }
  if (typeof imageRecord.dataUrl === "string") {
    return imageRecord.dataUrl;
  }
  if (typeof imageRecord.dataBase64 === "string") {
    const mime =
      typeof imageRecord.mime === "string" ? imageRecord.mime : "image/png";
    return `data:${mime};base64,${imageRecord.dataBase64}`;
  }
  return "";
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
  const platform = normalizePlatform(options.platform);
  const appName = options.appName || "Codeg OTools";
  const appVersion = options.appVersion || "";
  const defaultPluginUuid = normalizePluginUuid(options.pluginUuid);
  const paths = options.paths && typeof options.paths === "object" ? options.paths : {};
  const permissionsRestricted = Array.isArray(options.pluginPermissions);
  const permissions = permissionsRestricted
    ? options
        .pluginPermissions!.map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  const permissionSet = new Set(permissions.map((item) => item.toLowerCase()));
  const hasPermission = (name: string) => {
    const key = String(name || "").trim().toLowerCase();
    return (
      !key ||
      !permissionsRestricted ||
      permissionSet.has(key) ||
      permissionSet.has("*")
    );
  };
  const env: OToolsEnv = {
    runtime: "web",
    appName,
    appVersion,
    nativeId: String(options.nativeId || defaultPluginUuid),
    pluginUuid: defaultPluginUuid,
    ...(permissionsRestricted ? { pluginPermissions: permissions } : {}),
    platform,
    isDev: Boolean(options.isDev),
    currentFolderPath: String(options.currentFolderPath || "").trim(),
    currentBrowserUrl:
      String(options.currentBrowserUrl || "").trim() ||
      (typeof window !== "undefined" ? window.location.href : ""),
    paths,
    noderBridgeAuthToken: token,
    noderBridgeBaseUrl: normalizeBaseUrl(options.baseUrl),
  };
  const runtimeGlobal = getRuntimeGlobal() as typeof globalThis & {
    __OToolsCopiedFiles?: string[];
    __OToolsFileIconCache?: Record<string, string>;
    __OTOOLS_NODER__?: NoderRuntimeApi;
  };
  const copiedFilesCache = Array.isArray(runtimeGlobal.__OToolsCopiedFiles)
    ? runtimeGlobal.__OToolsCopiedFiles
    : [];
  runtimeGlobal.__OToolsCopiedFiles = copiedFilesCache;
  const fileIconCache =
    runtimeGlobal.__OToolsFileIconCache &&
    typeof runtimeGlobal.__OToolsFileIconCache === "object"
      ? runtimeGlobal.__OToolsFileIconCache
      : {};
  runtimeGlobal.__OToolsFileIconCache = fileIconCache;
  const resolveNoderRuntime = () =>
    runtimeGlobal.__OTOOLS_NODER__ &&
    typeof runtimeGlobal.__OTOOLS_NODER__ === "object"
      ? runtimeGlobal.__OTOOLS_NODER__
      : null;
  const readNoderBuiltinModules = () => {
    const sdkModules = resolveNoderRuntime()?.getSdkModules?.();
    const noderRuntime = sdkModules?.runtime;
    return Array.isArray(noderRuntime?.builtinModules)
      ? [...noderRuntime.builtinModules]
      : [];
  };
  const nodeRequire = (specifier: string) => {
    const noderRequire = resolveNoderRuntime()?.require;
    if (typeof noderRequire === "function") {
      return noderRequire(specifier);
    }
    throw new Error(
      `Node require is unavailable in the codeg-plus OTools web runtime: ${String(
        specifier || "",
      )}`,
    );
  };
  Object.assign(nodeRequire, {
    resolve: (specifier: string) => {
      const noderRequire = resolveNoderRuntime()?.require;
      return typeof noderRequire?.resolve === "function"
        ? noderRequire.resolve(specifier)
        : String(specifier || "");
    },
    cache: {},
  });
  const createRequire = (filename?: string) => {
    const noderCreateRequire = resolveNoderRuntime()?.createRequire;
    return typeof noderCreateRequire === "function"
      ? noderCreateRequire(filename)
      : nodeRequire;
  };
  const call = <T = unknown>(command: string, body?: unknown) =>
    postJson<T>(`/api/${command}`, body);
  const pluginOrDefault = (pluginUuid?: string) =>
    normalizePluginUuid(pluginUuid || defaultPluginUuid);
  const dispatchCompatEvent = (name: string, detail: unknown) => {
    if (
      typeof runtimeGlobal.dispatchEvent !== "function" ||
      typeof CustomEvent !== "function"
    ) {
      return;
    }
    runtimeGlobal.dispatchEvent(new CustomEvent(name, { detail }));
  };
  const deferCompatTask = (callback: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(callback);
      return;
    }
    setTimeout(callback, 0);
  };
  const localStorageApi = getLocalStorage();
  const storagePluginId = defaultPluginUuid || "anonymous";
  const dbStoragePrefix = `otools:${storagePluginId}:dbStorage:`;
  const dbDocumentPrefix = `otools:${storagePluginId}:db:`;
  const memoryDbStorage = new Map<string, unknown>();
  const memoryDbDocuments = new Map<string, unknown>();
  const listCompatStorageKeys = (
    prefix: string,
    memory: Map<string, unknown>,
  ) => {
    const keys = new Set<string>(memory.keys());
    if (localStorageApi) {
      for (let index = 0; index < localStorageApi.length; index += 1) {
        const key = localStorageApi.key(index);
        if (key?.startsWith(prefix)) {
          keys.add(key.slice(prefix.length));
        }
      }
    }
    return [...keys].sort();
  };
  const readCompatStorageValue = (
    prefix: string,
    memory: Map<string, unknown>,
    key: unknown,
  ) => {
    const storageKey = String(key ?? "");
    if (memory.has(storageKey)) {
      return memory.get(storageKey) ?? null;
    }
    const raw = localStorageApi?.getItem(`${prefix}${storageKey}`) ?? null;
    const value = decodeCompatStorageValue(raw);
    if (raw !== null) {
      memory.set(storageKey, value);
    }
    return value;
  };
  const writeCompatStorageValue = (
    prefix: string,
    memory: Map<string, unknown>,
    key: unknown,
    value: unknown,
  ) => {
    const storageKey = String(key ?? "");
    memory.set(storageKey, value);
    localStorageApi?.setItem(
      `${prefix}${storageKey}`,
      encodeCompatStorageValue(value),
    );
  };
  const removeCompatStorageValue = (
    prefix: string,
    memory: Map<string, unknown>,
    key: unknown,
  ) => {
    const storageKey = String(key ?? "");
    memory.delete(storageKey);
    localStorageApi?.removeItem(`${prefix}${storageKey}`);
  };
  const clearCompatStorageValues = (
    prefix: string,
    memory: Map<string, unknown>,
  ) => {
    for (const key of listCompatStorageKeys(prefix, memory)) {
      localStorageApi?.removeItem(`${prefix}${key}`);
    }
    memory.clear();
  };
  const mirrorDbStorageValue = (key: string, value: unknown) => {
    if (!defaultPluginUuid) {
      return;
    }
    void call("save_otools_plugin_localstate_value_with_scheme", {
      plugin: defaultPluginUuid,
      scheme: "dbStorage",
      key,
      value,
    }).catch(() => undefined);
  };
  const dbStorage = {
    get length() {
      return listCompatStorageKeys(dbStoragePrefix, memoryDbStorage).length;
    },
    key(index: number) {
      return listCompatStorageKeys(dbStoragePrefix, memoryDbStorage)[index] ?? null;
    },
    getItem(key: unknown) {
      return readCompatStorageValue(dbStoragePrefix, memoryDbStorage, key);
    },
    setItem(key: unknown, value: unknown) {
      const storageKey = String(key ?? "");
      writeCompatStorageValue(dbStoragePrefix, memoryDbStorage, storageKey, value);
      mirrorDbStorageValue(storageKey, value);
    },
    removeItem(key: unknown) {
      const storageKey = String(key ?? "");
      removeCompatStorageValue(dbStoragePrefix, memoryDbStorage, storageKey);
      mirrorDbStorageValue(storageKey, null);
    },
    clear() {
      clearCompatStorageValues(dbStoragePrefix, memoryDbStorage);
      if (defaultPluginUuid) {
        void call("save_otools_plugin_localstate_with_scheme", {
          plugin: defaultPluginUuid,
          scheme: "dbStorage",
          state: {},
        }).catch(() => undefined);
      }
    },
  };
  const createCompatDocumentId = () => {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    return randomUuid || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
  const readCompatDocument = (id: unknown) =>
    readCompatStorageValue(dbDocumentPrefix, memoryDbDocuments, String(id ?? ""));
  const writeCompatDocument = (doc: unknown) => {
    const record = readRecord(doc);
    const id = String(record._id || record.id || createCompatDocumentId());
    const rev = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const stored = {
      ...record,
      _id: id,
      _rev: rev,
    };
    writeCompatStorageValue(dbDocumentPrefix, memoryDbDocuments, id, stored);
    return { ok: true, id, rev };
  };
  const removeCompatDocument = (docOrId: unknown) => {
    const record = readRecord(docOrId);
    const id = String(
      typeof docOrId === "string" ? docOrId : record._id || record.id || "",
    );
    if (!id) {
      return { ok: false, error: "missing_id" };
    }
    const existing = readRecord(readCompatDocument(id));
    removeCompatStorageValue(dbDocumentPrefix, memoryDbDocuments, id);
    return { ok: true, id, rev: String(existing._rev || "") };
  };
  const allCompatDocuments = () => {
    const rows = listCompatStorageKeys(dbDocumentPrefix, memoryDbDocuments).map(
      (id) => {
        const doc = readRecord(readCompatDocument(id));
        return {
          id,
          key: id,
          value: { rev: doc._rev ?? null },
          doc,
        };
      },
    );
    return {
      total_rows: rows.length,
      offset: 0,
      rows,
    };
  };
  const createCompatChangesFeed = () => {
    const feed = {
      on: (_event: string, _handler?: (...args: unknown[]) => void) => feed,
      once: (_event: string, _handler?: (...args: unknown[]) => void) => feed,
      off: (_event: string, _handler?: (...args: unknown[]) => void) => feed,
      cancel: () => undefined,
    };
    return feed;
  };
  const createCompatReplicationResult = () => ({
    ok: true,
    docs_read: 0,
    docs_written: 0,
    doc_write_failures: 0,
    errors: [],
  });
  const compatDb = {
    get: (id: unknown) => readCompatDocument(id),
    put: (doc: unknown) => writeCompatDocument(doc),
    post: (doc: unknown) => writeCompatDocument(doc),
    remove: (docOrId: unknown) => removeCompatDocument(docOrId),
    bulkDocs: (docsOrRequest: unknown) => {
      const request = readRecord(docsOrRequest);
      const docs = Array.isArray(docsOrRequest)
        ? docsOrRequest
        : Array.isArray(request.docs)
          ? request.docs
          : [];
      return docs.map((doc) => writeCompatDocument(doc));
    },
    allDocs: () => allCompatDocuments(),
    changes: () => createCompatChangesFeed(),
    compact: () => ({ ok: true }),
    info: () => ({
      db_name: storagePluginId,
      doc_count: allCompatDocuments().total_rows,
      update_seq: 0,
    }),
  };
  Object.assign(compatDb, {
    replicate: {
      from: async () => createCompatReplicationResult(),
      to: async () => createCompatReplicationResult(),
      sync: async () => createCompatReplicationResult(),
    },
    promises: {
      get: async (id: unknown) => compatDb.get(id),
      put: async (doc: unknown) => compatDb.put(doc),
      post: async (doc: unknown) => compatDb.post(doc),
      remove: async (docOrId: unknown) => compatDb.remove(docOrId),
      bulkDocs: async (docsOrRequest: unknown) => compatDb.bulkDocs(docsOrRequest),
      allDocs: async () => compatDb.allDocs(),
      changes: async () => compatDb.changes(),
      compact: async () => compatDb.compact(),
      info: async () => compatDb.info(),
    },
  });
  const featureRecords: unknown[] = [];
  const getFeatures = () =>
    featureRecords.map((feature) =>
      feature && typeof feature === "object" ? { ...feature } : feature,
    );
  const setFeature = (feature: unknown) => {
    const record = readRecord(feature);
    const code = String(record.code || record.cmd || record.id || "").trim();
    if (code) {
      const existingIndex = featureRecords.findIndex((item) => {
        const itemRecord = readRecord(item);
        return String(itemRecord.code || itemRecord.cmd || itemRecord.id || "") === code;
      });
      if (existingIndex >= 0) {
        featureRecords.splice(existingIndex, 1, { ...record });
      } else {
        featureRecords.push({ ...record });
      }
    } else {
      featureRecords.push(feature);
    }
    dispatchCompatEvent("otools:features-changed", getFeatures());
    void call("set_feature", { feature }).catch(() => undefined);
    return true;
  };
  const removeFeature = (code: unknown) => {
    const target = String(code ?? "").trim();
    const existingIndex = featureRecords.findIndex((item) => {
      const record = readRecord(item);
      return String(record.code || record.cmd || record.id || "") === target;
    });
    if (existingIndex >= 0) {
      featureRecords.splice(existingIndex, 1);
    }
    dispatchCompatEvent("otools:features-changed", getFeatures());
    void call("remove_feature", { code: target }).catch(() => undefined);
    return existingIndex >= 0;
  };
  const defaultEnterAction: OToolsPluginEnterAction = {
    code: "",
    type: "",
    payload: null,
    option: null,
  };
  const initialEnterAction = (() => {
    const explicit = normalizeEnterAction(options.enterAction, defaultEnterAction);
    if (explicit.code || explicit.type || explicit.payload || explicit.option) {
      return explicit;
    }
    if (typeof window === "undefined") {
      return explicit;
    }
    try {
      const params = new URLSearchParams(window.location.search || "");
      return normalizeEnterAction(
        {
          code:
            params.get("code") ||
            params.get("cmd") ||
            params.get("featureCode") ||
            params.get("feature") ||
            "",
          type: params.get("type") || "",
          payload: readJsonParam(params.get("payload") || params.get("text")),
          option: readJsonParam(params.get("option")),
        },
        defaultEnterAction,
      );
    } catch {
      return explicit;
    }
  })();
  let currentEnterAction = initialEnterAction;
  const pluginReadyHandlers = new Set<() => void>();
  const pluginEnterHandlers = new Set<
    (action: OToolsPluginEnterAction) => void
  >();
  const pluginOutHandlers = new Set<() => void>();
  const dbPullHandlers = new Set<(payload?: unknown) => void>();
  const currentPluginEnterAction = (): OToolsPluginEnterAction => ({
    ...currentEnterAction,
  });
  if (typeof runtimeGlobal.addEventListener === "function") {
    runtimeGlobal.addEventListener("otools:plugin-enter", (event) => {
      const action = normalizeEnterAction(
        (event as CustomEvent).detail,
        currentPluginEnterAction(),
      );
      currentEnterAction = action;
      pluginEnterHandlers.forEach((handler) => handler(action));
    });
    runtimeGlobal.addEventListener("otools:plugin-out", () => {
      pluginOutHandlers.forEach((handler) => handler());
    });
    runtimeGlobal.addEventListener("otools:db-pull", (event) => {
      const payload = (event as CustomEvent).detail;
      dbPullHandlers.forEach((handler) => handler(payload));
    });
  }
  let subInputCallback:
    | ((event: OToolsSubInputEvent) => void)
    | null = null;
  let subInputValue = "";
  const buildSubInputEvent = (value: string) => ({
    text: value,
    value,
    toString: () => value,
  });
  const setSubInputValue = (value: unknown) => {
    subInputValue = readSubInputText(value);
    dispatchCompatEvent("otools:set-sub-input-value", {
      value: subInputValue,
    });
    subInputCallback?.(buildSubInputEvent(subInputValue));
    return true;
  };
  if (typeof runtimeGlobal.addEventListener === "function") {
    runtimeGlobal.addEventListener("otools:sub-input-change", (event) => {
      setSubInputValue((event as CustomEvent).detail);
    });
  }
  const isDarkColors = () => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (
        root.classList.contains("dark") ||
        root.dataset.theme === "dark" ||
        root.dataset.colorMode === "dark"
      ) {
        return true;
      }
    }
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches
    );
  };
  const createCompatUBrowserChain = () => {
    const steps: CompatUBrowserStep[] = [];
    let resultValue: unknown = null;
    let chain: Record<PropertyKey, unknown>;
    chain = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === Symbol.toStringTag) {
            return "OToolsCompatUBrowser";
          }
          if (prop === "then") {
            return undefined;
          }
          if (prop === "steps") {
            return steps;
          }
          if (prop === "run") {
            return async (options?: unknown) => {
              dispatchCompatEvent("otools:ubrowser-run", { steps, options });
              return resultValue;
            };
          }
          if (prop === "end" || prop === "close" || prop === "destroy") {
            return async () => {
              steps.splice(0, steps.length);
              return true;
            };
          }
          return (...args: unknown[]) => {
            const method = String(prop);
            steps.push({ method, args });
            if (method === "evaluate" && typeof args[0] === "function") {
              try {
                resultValue = (args[0] as () => unknown)();
              } catch {
                resultValue = null;
              }
            }
            return chain;
          };
        },
      },
    );
    return chain;
  };
  const ubrowser = new Proxy(
    (() => createCompatUBrowserChain()) as () => unknown,
    {
      apply() {
        return createCompatUBrowserChain();
      },
      get(_target, prop) {
        if (prop === Symbol.toStringTag) {
          return "OToolsCompatUBrowserFactory";
        }
        if (prop === "then") {
          return undefined;
        }
        if (prop === "create" || prop === "new") {
          return () => createCompatUBrowserChain();
        }
        const chain = createCompatUBrowserChain();
        return Reflect.get(chain, prop);
      },
    },
  );

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
  const dispatchNativeHostCommand = <T = unknown>(
    command: string,
    payload: unknown,
  ) => {
    const record = readRecord(payload);
    const uuid = pluginOrDefault(readNativePluginUuid(record));
    switch (command) {
      case "native_plugin_invoke":
        return call<T>("native_plugin_invoke", {
          uuid,
          method: String(record.method || "").trim(),
          payload: record.payload ?? null,
        });
      case "native_plugin_probe":
      case "native_plugin_reload":
      case "native_plugin_poll_events":
      case "native_plugin_listen_release":
        return call<T>(command, { uuid });
      case "native_plugin_listen_acquire":
        return call<T>(command, {
          uuid,
          intervalMs: record.intervalMs ?? record.interval_ms ?? null,
        });
      default:
        return null;
    }
  };
  const invokeNative = <T = unknown>(method: string, payload?: unknown) => {
    const hostResult = dispatchNativeHostCommand<T>(method, payload);
    if (hostResult) {
      return hostResult;
    }
    return invokeNativeCore<T>(defaultPluginUuid, method, payload);
  };
  const requireNonEmpty = (value: unknown, label: string) => {
    const text = String(value || "").trim();
    if (!text) {
      throw new Error(`${label} required`);
    }
    return text;
  };
  const getPackageOptions = (value: unknown) => readRecord(value);

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
    async open(path: string, openWith?: string) {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      await call<void>("remote_service_shell_open", {
        request: {
          path: target,
          with: openWith ? String(openWith) : undefined,
        },
      });
    },
    async openPath(path: string) {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      await call<void>("otools_shell_open_path", { path: target });
    },
    async showItemInFolder(path: string) {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      await call<void>("otools_shell_show_item_in_folder", { path: target });
    },
    async trashItem(path: string) {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      await call<void>("otools_shell_trash_item", { path: target });
    },
    async openExternal(url: string) {
      const target = String(url || "").trim();
      if (!target) {
        return;
      }
      await call<void>("otools_shell_open_external", { url: target });
    },
    async beep() {
      await call<void>("otools_shell_beep");
    },
  };
  const runtime = {
    get isNoder() {
      return Boolean(resolveNoderRuntime());
    },
    isNativeTauri: false,
    hasHostBridge: true,
    platform,
    appName,
    appVersion,
    pluginUuid: defaultPluginUuid,
    env,
    permissionsRestricted,
    permissions,
    hasPermission,
    versions: {
      app: appVersion,
      tauri: "2",
      otools: appVersion,
      codeg: appVersion,
    },
    dialog,
    shell,
    fs: null,
    path: {
      sep: platform === "windows" ? "\\" : "/",
      delimiter: platform === "windows" ? ";" : ":",
    },
    os: null,
    process: null,
    childProcess: null,
    require: nodeRequire,
    createRequire,
    get builtinModules() {
      return readNoderBuiltinModules();
    },
  };

  return {
    isDev: () => Boolean(options.isDev),
    isMacOS: () => platform === "macos",
    isMacOs: () => platform === "macos",
    isWindows: () => platform === "windows",
    isLinux: () => platform === "linux",
    getAppName: () => appName,
    getAppVersion: () => appVersion,
    getPluginUuid: () => defaultPluginUuid,
    showMainWindow: () => {
      void call("show_main_window").catch(() => {
        if (typeof window !== "undefined") {
          window.focus();
        }
      });
    },
    hideMainWindow: () => {
      void call("hide_main_window").catch(() => {
        if (typeof window !== "undefined") {
          window.blur();
        }
      });
    },
    outPlugin: () => {
      void call("hide_main_window").catch(() => {
        if (typeof window !== "undefined") {
          window.close();
        }
      });
    },
    setExpendHeight: (height) => {
      const value = Number(height);
      if (Number.isFinite(value) && typeof document !== "undefined") {
        document.body.style.minHeight = `${Math.max(0, Math.round(value))}px`;
      }
      void call("set_expend_height", { height: value }).catch(() => undefined);
    },
    isDarkColors,
    isDarkMode: isDarkColors,
    getUser: () => null,
    fetchUser: () => Promise.resolve(null),
    fetchUserServerTemporaryToken: () => Promise.resolve(null),
    isPurchasedUser: () => false,
    userPayments: () => [],
    screenColorPick: (callback) => {
      if (typeof callback === "function") {
        deferCompatTask(() => callback(null));
      }
      return Promise.resolve(null);
    },
    simulateKeyboardTap: () => false,
    simulateKeyboard: () => false,
    simulateMouseClick: () => false,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getSubInputValue: () => subInputValue,
    getIdleUBrowser: () => null,
    getIdleUBrowsers: () => [],
    ubrowser,
    getEnterAction: () => currentPluginEnterAction(),
    onPluginReady: (callback) => {
      if (typeof callback === "function") {
        pluginReadyHandlers.add(callback);
        deferCompatTask(callback);
      }
    },
    onDbPull: (callback) => {
      if (typeof callback === "function") {
        dbPullHandlers.add(callback);
      }
    },
    getFeatures,
    setFeature,
    removeFeature,
    redirect: (label, payload) => {
      const code = String(label ?? "").trim();
      const action = normalizeEnterAction(
        { code, payload: payload ?? null },
        currentPluginEnterAction(),
      );
      currentEnterAction = action;
      dispatchCompatEvent("otools:redirect", { code, payload: payload ?? null });
      pluginEnterHandlers.forEach((handler) => handler(action));
      void call("redirect", { code, payload: payload ?? null }).catch(
        () => undefined,
      );
      return true;
    },
    setSubInput: (callbackOrOptions, placeholder, isFocus) => {
      const subInputOptions = readRecord(callbackOrOptions);
      const callback =
        typeof callbackOrOptions === "function"
          ? callbackOrOptions
          : subInputOptions.onChange ||
            subInputOptions.callback ||
            subInputOptions.search;
      subInputCallback =
        typeof callback === "function"
          ? (callback as (event: OToolsSubInputEvent) => void)
          : null;
      dispatchCompatEvent("otools:set-sub-input", {
        placeholder: String(
          placeholder ??
            subInputOptions.placeholder ??
            subInputOptions.text ??
            "",
        ),
        isFocus:
          isFocus ??
          subInputOptions.isFocus ??
          subInputOptions.focus ??
          true,
        value: subInputValue,
      });
      return true;
    },
    removeSubInput: () => {
      subInputCallback = null;
      subInputValue = "";
      dispatchCompatEvent("otools:remove-sub-input", {});
      return true;
    },
    hideSubInput: () => {
      subInputCallback = null;
      subInputValue = "";
      dispatchCompatEvent("otools:remove-sub-input", {});
      return true;
    },
    setSubInputValue,
    onPluginEnter: (callback) => {
      if (typeof callback !== "function") {
        return;
      }
      pluginEnterHandlers.add(callback);
      deferCompatTask(() => callback(currentPluginEnterAction()));
    },
    onPluginOut: (callback) => {
      if (typeof callback === "function") {
        pluginOutHandlers.add(callback);
      }
    },
    showOpenDialog: (dialogOptions, callback) => {
      const result = dialog.open(readRecord(dialogOptions));
      if (typeof callback === "function") {
        void result.then(callback);
      }
      return result;
    },
    showSaveDialog: (dialogOptions, callback) => {
      const result = dialog.save(readRecord(dialogOptions));
      if (typeof callback === "function") {
        void result.then(callback);
      }
      return result;
    },
    dbStorage,
    db: compatDb,
    invokeNative,
    invokeNativeRaw: invokeNative,
    invokeNativePlugin: (pluginUuid, method, payload) =>
      invokeNativeCore(pluginUuid, method, payload),
    invokeNativePluginRaw: (pluginUuid: string, method: string, payload?: unknown) =>
      invokeNativeCore(pluginUuid, method, payload),
    probeNative: () => call("native_plugin_probe", { uuid: defaultPluginUuid }),
    probeNativePlugin: (pluginUuid: string) =>
      call("native_plugin_probe", { uuid: pluginOrDefault(pluginUuid) }),
    reloadNative: () => call("native_plugin_reload", { uuid: defaultPluginUuid }),
    reloadNativePlugin: (pluginUuid: string) =>
      call("native_plugin_reload", { uuid: pluginOrDefault(pluginUuid) }),
    listenNative: (handler, optionsArg) =>
      eventClient.listen(defaultPluginUuid, handler, optionsArg),
    listenNativePlugin: (
      pluginUuid: string,
      handler: OtoolsNativeEventHandler,
      optionsArg?: unknown,
    ) =>
      eventClient.listen(pluginOrDefault(pluginUuid), handler, optionsArg),
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
    getPluginSyncState: (plugin, scheme) =>
      call("get_otools_plugin_syncstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
      }),
    savePluginSyncState: (plugin, state, scheme) =>
      call<void>("save_otools_plugin_syncstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        state,
      }),
    getPluginSyncStateValue: (plugin, key, scheme) =>
      call("get_otools_plugin_syncstate_value_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        key,
      }),
    savePluginSyncStateValue: (plugin, key, value, scheme) =>
      call<void>("save_otools_plugin_syncstate_value_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        key,
        value,
      }),
    patchPluginSyncState: (plugin, patch, scheme) =>
      call<void>("patch_otools_plugin_syncstate_with_scheme", {
        plugin: pluginOrDefault(plugin),
        scheme: scheme ?? null,
        patch: patch ?? {},
      }),
    shellOpen: (path, openWith) => shell.open(path, openWith),
    shellOpenExternal: (url) => {
      void shell.openExternal(url);
    },
    shellOpenPath: (path) => {
      void shell.openPath(path);
    },
    shellTrashItem: (path) => {
      void shell.trashItem(path);
    },
    shellShowItemInFolder: (path) => {
      void shell.showItemInFolder(path);
    },
    shellBeep: () => {
      void shell.beep();
    },
    listHostDir: (path) =>
      call("tools_webview_list_dir", {
        path: requireNonEmpty(path, "path"),
      }),
    readHostFile: (path) =>
      call("tools_webview_read_file", {
        path: requireNonEmpty(path, "path"),
      }),
    writeHostFile: (request) => {
      const record = readRecord(request);
      const path = requireNonEmpty(record.path, "path");
      const dataBase64 = String(
        record.dataBase64 ?? record.data ?? record.content ?? "",
      );
      if (!dataBase64) {
        throw new Error("dataBase64 required");
      }
      return call<void>("tools_webview_write_file", { path, dataBase64 });
    },
    copyText: (text) => {
      const value = String(text || "");
      void call("otools_copy_text", { text: value }).catch(() => undefined);
      return Boolean(value);
    },
    copyFile: (file) => {
      const paths = normalizeFileList(file);
      if (!paths.length) {
        return false;
      }
      runtimeGlobal.__OToolsCopiedFiles = paths;
      copiedFilesCache.splice(0, copiedFilesCache.length, ...paths);
      void call("otools_copy_file", { paths }).catch(() => undefined);
      return true;
    },
    copyImage: (image) => {
      const imagePayload = readImagePayloadString(image);
      if (!imagePayload) {
        return false;
      }
      void call("otools_copy_image", { image: imagePayload }).catch(
        () => undefined,
      );
      return true;
    },
    getCopyedFiles: () => {
      void call<string[]>("otools_get_copied_files")
        .then((paths) => {
          if (Array.isArray(paths)) {
            runtimeGlobal.__OToolsCopiedFiles = paths;
            copiedFilesCache.splice(0, copiedFilesCache.length, ...paths);
          }
        })
        .catch(() => undefined);
      return [...copiedFilesCache];
    },
    getCopiedFiles: () => {
      void call<string[]>("otools_get_copied_files")
        .then((paths) => {
          if (Array.isArray(paths)) {
            runtimeGlobal.__OToolsCopiedFiles = paths;
            copiedFilesCache.splice(0, copiedFilesCache.length, ...paths);
          }
        })
        .catch(() => undefined);
      return [...copiedFilesCache];
    },
    showNotification: (body, clickFeatureCode) => {
      void call("otools_show_notification", {
        body: String(body || ""),
        clickFeatureCode: clickFeatureCode ? String(clickFeatureCode) : null,
      }).catch(() => undefined);
    },
    hostRunWingetInstall: (packageName, packageOptions) =>
      call("otools_host_run_winget_install", {
        packageName: requireNonEmpty(packageName, "packageName"),
        options: getPackageOptions(packageOptions),
      }),
    hostRunPackageAction: (packageName, packageOptions) => {
      const payload = getPackageOptions(packageOptions);
      return call("otools_host_run_package_action", {
        manager: payload.manager ?? null,
        packageName: requireNonEmpty(packageName, "packageName"),
        action: payload.action ?? "install",
        version: payload.version ?? null,
      });
    },
    hostGetPackageStatus: (packageName, packageOptions) => {
      const payload = getPackageOptions(packageOptions);
      return call("otools_host_get_package_status", {
        manager: payload.manager ?? null,
        packageName: requireNonEmpty(packageName, "packageName"),
        cask: payload.cask ?? null,
      });
    },
    hostGetPackagesStatus: (packageNames, packageOptions) => {
      const names = normalizeFileList(packageNames);
      const payload = getPackageOptions(packageOptions);
      if (!names.length) {
        return Promise.resolve([]);
      }
      return call("otools_host_get_packages_status", {
        manager: payload.manager ?? null,
        packageNames: names,
        cask: payload.cask ?? null,
      });
    },
    aiGenerateText: (request) =>
      call("otools_ai_generate_text", {
        request: request && typeof request === "object" ? request : {},
      }),
    hostRepairJsonText: (rawText) =>
      call<string>("otools_host_repair_json_text", {
        rawText: String(rawText || ""),
      }),
    hostListListenProcesses: () => call<unknown[]>("otools_host_list_listen_processes"),
    hostKillProcess: (pid) => {
      const id = Number(pid);
      if (!Number.isFinite(id) || id <= 0) {
        return Promise.reject(new Error("Invalid pid"));
      }
      return call<void>("otools_host_kill_process", { pid: id });
    },
    hostScanStorageCatalog: (catalog) => {
      const list = Array.isArray(catalog) ? catalog : [];
      if (!list.length) {
        return Promise.reject(new Error("catalog required"));
      }
      return call("otools_host_scan_storage_catalog", { catalog: list });
    },
    hostCleanStorageItems: (catalog, ids) => {
      const list = Array.isArray(catalog) ? catalog : [];
      const idList = normalizeStringList(ids);
      if (!list.length) {
        return Promise.reject(new Error("catalog required"));
      }
      if (!idList.length) {
        return Promise.reject(new Error("ids required"));
      }
      return call("otools_host_clean_storage_items", {
        catalog: list,
        ids: idList,
      });
    },
    hostCleanStoragePaths: (entriesOrPaths) => {
      if (!Array.isArray(entriesOrPaths) || !entriesOrPaths.length) {
        return Promise.reject(new Error("entries required"));
      }
      const first = entriesOrPaths[0];
      if (typeof first === "string") {
        const paths = normalizeFileList(entriesOrPaths);
        if (!paths.length) {
          return Promise.reject(new Error("paths required"));
        }
        return call("otools_host_clean_storage_paths", {
          entries: paths.map((path) => ({
            itemId: "",
            itemName: "",
            path,
          })),
        });
      }
      return call("otools_host_clean_storage_paths", {
        entries: entriesOrPaths,
      });
    },
    statusBarAttach: (payload) =>
      call("otools_set_status_bar_state", {
        payload: payload && typeof payload === "object" ? payload : {},
      }),
    getNativeId: () => String(env.nativeId || ""),
    getPath: (name) => String(paths[String(name || "")] || ""),
    getFileIcon: (filePath) => {
      const target = String(filePath || "").trim();
      if (!target) {
        return "";
      }
      if (fileIconCache[target]) {
        return fileIconCache[target];
      }
      void call<string>("otools_get_file_icon", { path: target })
        .then((icon) => {
          if (icon) {
            fileIconCache[target] = icon;
          }
        })
        .catch(() => undefined);
      return "";
    },
    readCurrentFolderPath: () => String(env.currentFolderPath || ""),
    readCurrentBrowserUrl: () =>
      String(
        env.currentBrowserUrl ||
          (typeof window !== "undefined" ? window.location.href : ""),
      ),
    dialog,
    runtime,
    shell,
  } as OToolsAPI;
}

export function installOtoolsWebRuntime(options: OtoolsWebRuntimeOptions) {
  const facade = createOtoolsWebFacade(options);
  const runtimeGlobal = getRuntimeGlobal();

  runtimeGlobal.__OToolsEnv = {
    ...(runtimeGlobal.__OToolsEnv || {}),
    ...(facade.runtime?.env || {}),
  };
  runtimeGlobal.__OTOOLS_REMOTE_SERVICE__ = true;
  runtimeGlobal.__TAURI_REMOTE_SERVICE__ = true;
  runtimeGlobal.otools = facade;
  runtimeGlobal.utools = facade;
  return facade;
}

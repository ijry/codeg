(() => {
  const installKey = "__OToolsNoderInstalled__";
  if (window[installKey]) {
    return;
  }
  window[installKey] = true;

  const textEncoder = new TextEncoder();
  const decoderCache = new Map();
  const moduleCache = new Map();
  const processInfoCache = { os: null, cwd: null };

  const defineGlobal = (key, value) => {
    try {
      Object.defineProperty(window, key, {
        value,
        configurable: true,
        writable: true
      });
    } catch {
      window[key] = value;
    }
  };

  const normalizePermissionName = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }
    const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "fs") {
      return "fs";
    }
    if (normalized === "dialog") {
      return "dialog";
    }
    if (normalized === "shell") {
      return "shell";
    }
    if (normalized === "child_process" || normalized === "childprocess") {
      return "child_process";
    }
    return null;
  };

  const getDeclaredPluginPermissions = () => {
    const raw = window.__OToolsEnv?.pluginPermissions;
    if (!Array.isArray(raw)) {
      return null;
    }
    const seen = new Set();
    const normalized = [];
    for (const item of raw) {
      const permission = normalizePermissionName(item);
      if (!permission || seen.has(permission)) {
        continue;
      }
      seen.add(permission);
      normalized.push(permission);
    }
    return normalized;
  };

  const hasRestrictedPluginPermissions = () => Array.isArray(window.__OToolsEnv?.pluginPermissions);

  const hasPluginPermission = (permission) => {
    const normalized = normalizePermissionName(permission);
    if (!normalized) {
      return false;
    }
    const declared = getDeclaredPluginPermissions();
    if (!declared) {
      return true;
    }
    return declared.includes(normalized);
  };

  const createPermissionDeniedError = (specifier, permission) => {
    const pluginUuid = String(window.__OToolsEnv?.pluginUuid || "").trim();
    const pluginLabel = pluginUuid || "current plugin";
    const error = new Error(
      `Plugin "${pluginLabel}" has not declared "${permission}" permission required by "${specifier}".`
    );
    error.code = "ERR_OTOOLS_PERMISSION_DENIED";
    error.permission = permission;
    error.specifier = String(specifier || "");
    return error;
  };

  const getDecoder = (encoding = "utf-8") => {
    const normalized = normalizeEncoding(encoding) || "utf-8";
    if (!decoderCache.has(normalized)) {
      decoderCache.set(normalized, new TextDecoder(normalized));
    }
    return decoderCache.get(normalized);
  };

  const bytesToBase64 = (bytes) => {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  };

  const base64ToBytes = (value) => {
    const binary = atob(value || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  };

  const normalizeEncoding = (value) => {
    if (!value) {
      return null;
    }
    const text = String(value).trim().toLowerCase();
    if (!text) {
      return null;
    }
    if (text === "utf8") {
      return "utf-8";
    }
    if (text === "utf16le") {
      return "utf-16le";
    }
    if (text === "latin1" || text === "binary") {
      return "iso-8859-1";
    }
    return text;
  };

  class BufferPolyfill extends Uint8Array {
    static from(value, encoding) {
      if (value instanceof BufferPolyfill) {
        return new BufferPolyfill(value);
      }
      if (typeof value === "string" && normalizeEncoding(encoding) === "base64") {
        return new BufferPolyfill(base64ToBytes(value));
      }
      if (typeof value === "string") {
        return new BufferPolyfill(textEncoder.encode(value));
      }
      if (ArrayBuffer.isView(value)) {
        return new BufferPolyfill(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      }
      if (value instanceof ArrayBuffer) {
        return new BufferPolyfill(value.slice(0));
      }
      if (Array.isArray(value)) {
        return new BufferPolyfill(value);
      }
      if (typeof value === "number") {
        return BufferPolyfill.alloc(value);
      }
      if (value && typeof value === "object" && typeof value.type === "string" && value.type === "Buffer" && Array.isArray(value.data)) {
        return new BufferPolyfill(value.data);
      }
      throw new TypeError("Unsupported Buffer input");
    }

    static alloc(size, fill = 0) {
      const buffer = new BufferPolyfill(size);
      if (typeof fill === "string") {
        const fillBuffer = BufferPolyfill.from(fill);
        for (let index = 0; index < buffer.length; index += 1) {
          buffer[index] = fillBuffer[index % fillBuffer.length] || 0;
        }
      } else {
        buffer.fill(fill);
      }
      return buffer;
    }

    static concat(list, totalLength) {
      const buffers = Array.isArray(list) ? list.map((item) => BufferPolyfill.from(item)) : [];
      const length = Number.isFinite(totalLength)
        ? Number(totalLength)
        : buffers.reduce((sum, item) => sum + item.length, 0);
      const out = BufferPolyfill.alloc(length);
      let offset = 0;
      for (const buffer of buffers) {
        out.set(buffer.subarray(0, Math.max(0, Math.min(buffer.length, length - offset))), offset);
        offset += buffer.length;
        if (offset >= length) {
          break;
        }
      }
      return out;
    }

    static isBuffer(value) {
      return value instanceof BufferPolyfill;
    }

    static byteLength(value) {
      return BufferPolyfill.from(value).length;
    }

    toString(encoding = "utf8", start = 0, end = this.length) {
      const normalized = normalizeEncoding(encoding) || "utf-8";
      const slice = this.subarray(start, end);
      if (normalized === "base64") {
        return bytesToBase64(slice);
      }
      if (normalized === "hex") {
        return Array.from(slice, (item) => item.toString(16).padStart(2, "0")).join("");
      }
      return getDecoder(normalized).decode(slice);
    }

    equals(other) {
      const target = BufferPolyfill.from(other);
      if (target.length !== this.length) {
        return false;
      }
      for (let index = 0; index < this.length; index += 1) {
        if (target[index] !== this[index]) {
          return false;
        }
      }
      return true;
    }
  }

  const toBuffer = (value, encoding) => {
    if (BufferPolyfill.isBuffer(value)) {
      return value;
    }
    if (typeof value === "string" && normalizeEncoding(encoding) === "base64") {
      return new BufferPolyfill(base64ToBytes(value));
    }
    return BufferPolyfill.from(value, encoding);
  };

  class EventEmitter {
    constructor() {
      this._events = Object.create(null);
    }

    on(event, listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Listener must be a function");
      }
      (this._events[event] || (this._events[event] = new Set())).add(listener);
      return this;
    }

    addListener(event, listener) {
      return this.on(event, listener);
    }

    once(event, listener) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        listener(...args);
      };
      wrapper._original = listener;
      return this.on(event, wrapper);
    }

    off(event, listener) {
      const listeners = this._events[event];
      if (!listeners) {
        return this;
      }
      for (const candidate of listeners) {
        if (candidate === listener || candidate._original === listener) {
          listeners.delete(candidate);
        }
      }
      if (!listeners.size) {
        delete this._events[event];
      }
      return this;
    }

    removeListener(event, listener) {
      return this.off(event, listener);
    }

    emit(event, ...args) {
      const listeners = this._events[event];
      if (!listeners || !listeners.size) {
        return false;
      }
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
      return true;
    }
  }

  const inferPlatform = () => {
    const agent = String(navigator.userAgent || "").toLowerCase();
    if (agent.includes("windows")) {
      return "win32";
    }
    if (agent.includes("mac")) {
      return "darwin";
    }
    if (agent.includes("linux")) {
      return "linux";
    }
    return "linux";
  };

  const getBridgeBaseUrl = () => {
    const configured = String(window.__OToolsEnv?.noderBridgeBaseUrl || "").trim();
    if (configured) {
      return configured.replace(/\/+$/, "");
    }
    const protocol = String(window.location.protocol || "");
    const host = String(window.location.hostname || "");
    const isWindowsHost = protocol.startsWith("http") && host.endsWith(".localhost");
    if (isWindowsHost || inferPlatform() === "win32") {
      const scheme = protocol === "https:" ? "https:" : "http:";
      return `${scheme}//otools-noder.localhost`;
    }
    return "otools-noder://localhost";
  };

  const getBridgeAuthToken = () =>
    String(window.__OToolsEnv?.noderBridgeAuthToken || window.__OToolsEnv?.hostFileAuthToken || "").trim();

  const normalizeNodeError = (payload, fallbackMessage) => {
    const error = new Error(payload?.message || fallbackMessage || "Unknown noder error");
    if (payload && typeof payload === "object") {
      if (payload.code) {
        error.code = payload.code;
      }
      if (payload.errno !== undefined && payload.errno !== null) {
        error.errno = payload.errno;
      }
      if (payload.syscall) {
        error.syscall = payload.syscall;
      }
      if (payload.path) {
        error.path = payload.path;
      }
    }
    return error;
  };

  const parseBridgeResponse = (status, responseText) => {
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }
    if (status < 200 || status >= 300 || !payload || payload.ok !== true) {
      throw normalizeNodeError(payload?.error, `Noder request failed with status ${status}`);
    }
    return payload.value;
  };

  const callBridgeSync = (op, args = {}) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getBridgeBaseUrl()}/invoke`, false);
    const token = getBridgeAuthToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(JSON.stringify({ op, args }));
    return parseBridgeResponse(xhr.status || 500, xhr.responseText || "");
  };

  const callBridgeAsync = async (op, args = {}) => {
    const token = getBridgeAuthToken();
    const response = await fetch(`${getBridgeBaseUrl()}/invoke`, {
      method: "POST",
      mode: "cors",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify({ op, args })
    });
    return parseBridgeResponse(response.status, await response.text());
  };

  const getOsInfo = () => {
    if (processInfoCache.os) {
      return processInfoCache.os;
    }
    try {
      processInfoCache.os = callBridgeSync("os.info");
    } catch {
      processInfoCache.os = {
        arch: "unknown",
        platform: inferPlatform(),
        type: inferPlatform() === "darwin" ? "Darwin" : inferPlatform() === "win32" ? "Windows_NT" : "Linux",
        release: "",
        hostname: "",
        homedir: "",
        tmpdir: "",
        endianness: "LE",
        eol: inferPlatform() === "win32" ? "\r\n" : "\n",
        cpus: [],
        totalmem: 0,
        freemem: 0,
        cwd: "."
      };
    }
    return processInfoCache.os;
  };

  const getProcessCwd = () => {
    if (processInfoCache.cwd) {
      return processInfoCache.cwd;
    }
    try {
      processInfoCache.cwd = callBridgeSync("process.cwd").cwd || ".";
    } catch {
      processInfoCache.cwd = getOsInfo().cwd || ".";
    }
    return processInfoCache.cwd;
  };

  const resolveHostInvoke = () => {
    const localInvoke =
      window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function"
        ? window.__TAURI_INTERNALS__.invoke
        : null;
    if (localInvoke) {
      return localInvoke;
    }
    try {
      const parentInvoke = window.parent?.__TAURI_INTERNALS__?.invoke;
      if (typeof parentInvoke === "function") {
        return parentInvoke;
      }
    } catch {
      // ignore cross-origin access
    }
    try {
      const topInvoke = window.top?.__TAURI_INTERNALS__?.invoke;
      if (typeof topInvoke === "function") {
        return topInvoke;
      }
    } catch {
      // ignore cross-origin access
    }
    return null;
  };

  const hasHostInvoke = () => typeof resolveHostInvoke() === "function";

  const callHostInvoke = (command, payload) => {
    const invoke = resolveHostInvoke();
    if (!invoke) {
      return Promise.reject(new Error(`OTools host invoke is unavailable for ${command}`));
    }
    try {
      return Promise.resolve(invoke(command, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const toPathString = (value) => {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof URL && value.protocol === "file:") {
      return decodeURIComponent(value.pathname);
    }
    if (value && typeof value === "object" && typeof value.href === "string") {
      return String(value.href);
    }
    return String(value || "");
  };

  const normalizeFsOptions = (options) => {
    if (typeof options === "string") {
      return { encoding: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const encodeFsData = (data, encoding) => {
    if (typeof data === "string") {
      if (normalizeEncoding(encoding) === "base64") {
        return data;
      }
      return bytesToBase64(textEncoder.encode(data));
    }
    return bytesToBase64(toBuffer(data));
  };

  const decodeFsData = (payload, options) => {
    const encoding = normalizeEncoding(options.encoding);
    const bytes = new BufferPolyfill(base64ToBytes(payload?.dataBase64 || ""));
    if (!encoding) {
      return bytes;
    }
    if (encoding === "base64") {
      return payload?.dataBase64 || "";
    }
    return bytes.toString(encoding);
  };

  class Stats {
    constructor(payload) {
      this.dev = 0;
      this.mode = payload?.mode || 0;
      this.nlink = 0;
      this.uid = 0;
      this.gid = 0;
      this.rdev = 0;
      this.blksize = 0;
      this.ino = 0;
      this.size = payload?.size || 0;
      this.blocks = 0;
      this.atimeMs = payload?.accessedAtMs || 0;
      this.mtimeMs = payload?.modifiedAtMs || 0;
      this.ctimeMs = payload?.createdAtMs || 0;
      this.birthtimeMs = payload?.createdAtMs || 0;
      this.atime = new Date(this.atimeMs || 0);
      this.mtime = new Date(this.mtimeMs || 0);
      this.ctime = new Date(this.ctimeMs || 0);
      this.birthtime = new Date(this.birthtimeMs || 0);
      this._payload = payload || {};
    }

    isFile() {
      return Boolean(this._payload?.isFile);
    }

    isDirectory() {
      return Boolean(this._payload?.isDirectory);
    }

    isSymbolicLink() {
      return Boolean(this._payload?.isSymlink);
    }
  }

  class Dirent {
    constructor(entry) {
      this.name = entry?.name || "";
      this.path = entry?.path || "";
      this._entry = entry || {};
    }

    isFile() {
      return Boolean(this._entry?.isFile);
    }

    isDirectory() {
      return Boolean(this._entry?.isDirectory);
    }

    isSymbolicLink() {
      return Boolean(this._entry?.isSymlink);
    }
  }

  const createFsModule = () => {
    const readFileSync = (path, options) => {
      const normalized = normalizeFsOptions(options);
      const payload = callBridgeSync("fs.readFile", { path: toPathString(path) });
      return decodeFsData(payload, normalized);
    };

    const readFile = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.readFile", { path: toPathString(path) }).then((payload) =>
        decodeFsData(payload, normalized)
      );
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const writeFileSync = (path, data, options) => {
      const normalized = normalizeFsOptions(options);
      return callBridgeSync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: false
      });
    };

    const writeFile = (path, data, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: false
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const appendFileSync = (path, data, options) => {
      const normalized = normalizeFsOptions(options);
      return callBridgeSync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: true
      });
    };

    const appendFile = (path, data, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.writeFile", {
        path: toPathString(path),
        dataBase64: encodeFsData(data, normalized.encoding),
        append: true
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const existsSync = (path) => Boolean(callBridgeSync("fs.exists", { path: toPathString(path) }).exists);

    const statSync = (path) => new Stats(callBridgeSync("fs.stat", { path: toPathString(path) }));
    const lstatSync = (path) => new Stats(callBridgeSync("fs.lstat", { path: toPathString(path) }));

    const stat = (path, callback) => {
      const promise = callBridgeAsync("fs.stat", { path: toPathString(path) }).then((payload) => new Stats(payload));
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const lstat = (path, callback) => {
      const promise = callBridgeAsync("fs.lstat", { path: toPathString(path) }).then((payload) => new Stats(payload));
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const readdirSync = (path, options) => {
      const normalized = normalizeFsOptions(options);
      const entries = callBridgeSync("fs.readdir", { path: toPathString(path) }) || [];
      if (normalized.withFileTypes) {
        return entries.map((entry) => new Dirent(entry));
      }
      return entries.map((entry) => entry.name);
    };

    const readdir = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const normalized = normalizeFsOptions(options);
      const promise = callBridgeAsync("fs.readdir", { path: toPathString(path) }).then((entries) =>
        normalized.withFileTypes ? (entries || []).map((entry) => new Dirent(entry)) : (entries || []).map((entry) => entry.name)
      );
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const mkdirSync = (path, options = {}) => {
      const recursive = typeof options === "object" ? Boolean(options?.recursive) : false;
      return callBridgeSync("fs.mkdir", { path: toPathString(path), recursive });
    };

    const mkdir = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const recursive = typeof options === "object" ? Boolean(options?.recursive) : false;
      const promise = callBridgeAsync("fs.mkdir", { path: toPathString(path), recursive });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const rmSync = (path, options = {}) =>
      callBridgeSync("fs.rm", {
        path: toPathString(path),
        recursive: Boolean(options?.recursive),
        force: Boolean(options?.force)
      });

    const rm = (path, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const promise = callBridgeAsync("fs.rm", {
        path: toPathString(path),
        recursive: Boolean(options?.recursive),
        force: Boolean(options?.force)
      });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const unlinkSync = (path) => rmSync(path);
    const unlink = (path, callback) => rm(path, {}, callback);
    const rmdirSync = (path, options = {}) => rmSync(path, options);
    const rmdir = (path, options, callback) => rm(path, options, callback);

    const renameSync = (from, to) => callBridgeSync("fs.rename", { from: toPathString(from), to: toPathString(to) });
    const rename = (from, to, callback) => {
      const promise = callBridgeAsync("fs.rename", { from: toPathString(from), to: toPathString(to) });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const copyFileSync = (from, to) => callBridgeSync("fs.copyFile", { from: toPathString(from), to: toPathString(to) });
    const copyFile = (from, to, callback) => {
      const promise = callBridgeAsync("fs.copyFile", { from: toPathString(from), to: toPathString(to) });
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const realpathSync = (path) => callBridgeSync("fs.realpath", { path: toPathString(path) }).path || "";
    const realpath = (path, callback) => {
      const promise = callBridgeAsync("fs.realpath", { path: toPathString(path) }).then((payload) => payload.path || "");
      if (typeof callback === "function") {
        promise.then((value) => callback(null, value), (error) => callback(error));
        return;
      }
      return promise;
    };

    const accessSync = (path) => callBridgeSync("fs.access", { path: toPathString(path) });
    const access = (path, mode, callback) => {
      if (typeof mode === "function") {
        callback = mode;
      }
      const promise = callBridgeAsync("fs.access", { path: toPathString(path) });
      if (typeof callback === "function") {
        promise.then(() => callback(null), (error) => callback(error));
        return;
      }
      return promise;
    };

    const promises = {
      readFile: (path, options) => readFile(path, options),
      writeFile: (path, data, options) => writeFile(path, data, options),
      appendFile: (path, data, options) => appendFile(path, data, options),
      stat: (path) => stat(path),
      lstat: (path) => lstat(path),
      readdir: (path, options) => readdir(path, options),
      mkdir: (path, options) => mkdir(path, options),
      rm: (path, options) => rm(path, options),
      rename: (from, to) => rename(from, to),
      copyFile: (from, to) => copyFile(from, to),
      realpath: (path) => realpath(path),
      access: (path) => access(path)
    };

    return {
      constants: {
        F_OK: 0,
        R_OK: 4,
        W_OK: 2,
        X_OK: 1
      },
      Dirent,
      Stats,
      promises,
      readFileSync,
      readFile,
      writeFileSync,
      writeFile,
      appendFileSync,
      appendFile,
      existsSync,
      statSync,
      stat,
      lstatSync,
      lstat,
      readdirSync,
      readdir,
      mkdirSync,
      mkdir,
      rmSync,
      rm,
      unlinkSync,
      unlink,
      rmdirSync,
      rmdir,
      renameSync,
      rename,
      copyFileSync,
      copyFile,
      realpathSync,
      realpath,
      accessSync,
      access
    };
  };

  const normalizeSegments = (segments, allowAboveRoot) => {
    const out = [];
    for (const segment of segments) {
      if (!segment || segment === ".") {
        continue;
      }
      if (segment === "..") {
        if (out.length && out[out.length - 1] !== "..") {
          out.pop();
        } else if (allowAboveRoot) {
          out.push("..");
        }
      } else {
        out.push(segment);
      }
    }
    return out;
  };

  const createPosixPath = () => {
    const sep = "/";

    const split = (path) => String(path || "").split("/").filter(Boolean);
    const isAbsolute = (path) => String(path || "").startsWith("/");
    const normalize = (path) => {
      const input = String(path || "");
      const absolute = isAbsolute(input);
      const trailingSlash = input.endsWith("/");
      const body = normalizeSegments(split(input), !absolute).join(sep);
      let output = absolute ? `/${body}` : body || ".";
      if (!absolute && !body) {
        output = ".";
      }
      if (trailingSlash && output !== "/" && output !== ".") {
        output += "/";
      }
      return output;
    };
    const join = (...parts) => normalize(parts.filter((item) => item !== undefined && item !== null).join("/"));
    const dirname = (path) => {
      const input = normalize(path);
      if (input === "/") {
        return "/";
      }
      const value = input.replace(/\/+$/, "");
      const index = value.lastIndexOf("/");
      if (index <= 0) {
        return index === 0 ? "/" : ".";
      }
      return value.slice(0, index);
    };
    const basename = (path, ext) => {
      const value = normalize(path).replace(/\/+$/, "").split("/").pop() || "";
      if (ext && value.endsWith(ext)) {
        return value.slice(0, -ext.length);
      }
      return value;
    };
    const extname = (path) => {
      const value = basename(path);
      const index = value.lastIndexOf(".");
      return index > 0 ? value.slice(index) : "";
    };
    const resolve = (...parts) => {
      let resolved = "";
      for (let index = parts.length - 1; index >= -1; index -= 1) {
        const part = index >= 0 ? String(parts[index] || "") : getProcessCwd();
        if (!part) {
          continue;
        }
        resolved = resolved ? `${part}/${resolved}` : part;
        if (part.startsWith("/")) {
          break;
        }
      }
      return normalize(resolved);
    };
    const parse = (path) => {
      const dir = dirname(path);
      const base = basename(path);
      const ext = extname(path);
      const name = ext ? base.slice(0, -ext.length) : base;
      return { root: isAbsolute(path) ? "/" : "", dir, base, ext, name };
    };
    const format = (parts) => {
      const dir = parts?.dir || parts?.root || "";
      const base = parts?.base || `${parts?.name || ""}${parts?.ext || ""}`;
      return dir ? join(dir, base) : base;
    };
    const relative = (from, to) => {
      const fromParts = normalize(resolve(from)).split("/").filter(Boolean);
      const toParts = normalize(resolve(to)).split("/").filter(Boolean);
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift();
        toParts.shift();
      }
      return normalizeSegments(
        fromParts.map(() => "..").concat(toParts),
        true
      ).join("/") || "";
    };
    return {
      sep,
      delimiter: ":",
      basename,
      dirname,
      extname,
      format,
      isAbsolute,
      join,
      normalize,
      parse,
      relative,
      resolve
    };
  };

  const createWin32Path = () => {
    const sep = "\\";
    const splitDevice = (path) => {
      const input = String(path || "");
      const match = input.match(/^([A-Za-z]:)([\\/]|$)/);
      if (match) {
        return { root: `${match[1]}\\`, tail: input.slice(match[0].length) };
      }
      if (input.startsWith("\\") || input.startsWith("/")) {
        return { root: "\\", tail: input.replace(/^[\\/]+/, "") };
      }
      return { root: "", tail: input };
    };
    const split = (path) => splitDevice(path).tail.split(/[\\/]+/).filter(Boolean);
    const isAbsolute = (path) => Boolean(splitDevice(path).root);
    const normalize = (path) => {
      const input = String(path || "");
      const parsed = splitDevice(input);
      const body = normalizeSegments(split(input), !parsed.root).join(sep);
      const trailingSlash = /[\\/]$/.test(input);
      let output = parsed.root ? `${parsed.root}${body}` : body || ".";
      if (!parsed.root && !body) {
        output = ".";
      }
      if (trailingSlash && output !== "\\" && output !== ".") {
        output += "\\";
      }
      return output.replace(/\\{2,}/g, "\\");
    };
    const join = (...parts) => normalize(parts.filter((item) => item !== undefined && item !== null).join("\\"));
    const dirname = (path) => {
      const input = normalize(path);
      const parsed = splitDevice(input);
      const value = input.replace(/[\\/]+$/, "");
      const index = value.lastIndexOf("\\");
      if (index < parsed.root.length) {
        return parsed.root || ".";
      }
      return value.slice(0, index);
    };
    const basename = (path, ext) => {
      const value = normalize(path).replace(/[\\/]+$/, "").split(/[/\\]/).pop() || "";
      if (ext && value.endsWith(ext)) {
        return value.slice(0, -ext.length);
      }
      return value;
    };
    const extname = (path) => {
      const value = basename(path);
      const index = value.lastIndexOf(".");
      return index > 0 ? value.slice(index) : "";
    };
    const resolve = (...parts) => {
      let resolved = "";
      let resolvedRoot = "";
      for (let index = parts.length - 1; index >= -1; index -= 1) {
        const part = index >= 0 ? String(parts[index] || "") : getProcessCwd();
        if (!part) {
          continue;
        }
        const parsed = splitDevice(part);
        resolved = resolved ? `${parsed.tail}\\${resolved}` : parsed.tail;
        if (parsed.root) {
          resolvedRoot = parsed.root;
          break;
        }
      }
      return normalize(`${resolvedRoot}${resolved}`);
    };
    const parse = (path) => {
      const normalized = normalize(path);
      const parsed = splitDevice(normalized);
      const dir = dirname(normalized);
      const base = basename(normalized);
      const ext = extname(normalized);
      const name = ext ? base.slice(0, -ext.length) : base;
      return { root: parsed.root, dir, base, ext, name };
    };
    const format = (parts) => {
      const dir = parts?.dir || parts?.root || "";
      const base = parts?.base || `${parts?.name || ""}${parts?.ext || ""}`;
      return dir ? join(dir, base) : base;
    };
    const relative = (from, to) => {
      const fromResolved = normalize(resolve(from));
      const toResolved = normalize(resolve(to));
      const fromParts = fromResolved.split(/[/\\]+/).filter(Boolean);
      const toParts = toResolved.split(/[/\\]+/).filter(Boolean);
      while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
        fromParts.shift();
        toParts.shift();
      }
      return normalizeSegments(
        fromParts.map(() => "..").concat(toParts),
        true
      ).join("\\") || "";
    };
    return {
      sep,
      delimiter: ";",
      basename,
      dirname,
      extname,
      format,
      isAbsolute,
      join,
      normalize,
      parse,
      relative,
      resolve
    };
  };

  const createPathModule = () => {
    const posix = createPosixPath();
    const win32 = createWin32Path();
    const active = getOsInfo().platform === "win32" ? win32 : posix;
    return Object.assign({}, active, { posix, win32 });
  };

  const sharedPathModule = createPathModule();
  const sharedFsModule = createFsModule();
  const commonJsCache = Object.create(null);

  const fileUrlToPath = (value) => {
    const parsed = new URL(String(value || ""));
    let pathname = decodeURIComponent(parsed.pathname || "");
    if (getOsInfo().platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  };

  const normalizeModuleFilename = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    let filename = text;
    if (/^file:\/\//i.test(filename)) {
      filename = fileUrlToPath(filename);
    }
    try {
      if (sharedFsModule.existsSync(filename)) {
        return sharedFsModule.realpathSync(filename);
      }
    } catch {
      // ignore
    }
    return filename;
  };

  const isRelativeSpecifier = (specifier) =>
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../");

  const isAbsoluteSpecifier = (specifier) =>
    /^file:\/\//i.test(specifier) || sharedPathModule.isAbsolute(specifier);

  const safeStatSync = (filename) => {
    try {
      return sharedFsModule.statSync(filename);
    } catch {
      return null;
    }
  };

  const tryResolveModuleFile = (candidate) => {
    const attempts = [
      candidate,
      `${candidate}.js`,
      `${candidate}.json`,
      sharedPathModule.join(candidate, "index.js"),
      sharedPathModule.join(candidate, "index.json")
    ];
    for (const attempt of attempts) {
      const stats = safeStatSync(attempt);
      if (stats && stats.isFile()) {
        try {
          return sharedFsModule.realpathSync(attempt);
        } catch {
          return attempt;
        }
      }
    }
    return null;
  };

  const resolveLocalModuleFilename = (specifier, parentFilename) => {
    const raw = /^file:\/\//i.test(specifier) ? fileUrlToPath(specifier) : specifier;
    if (isAbsoluteSpecifier(raw)) {
      return tryResolveModuleFile(raw);
    }
    if (!isRelativeSpecifier(raw)) {
      return null;
    }
    if (!parentFilename) {
      throw new Error(`Cannot resolve relative module without base file: ${specifier}`);
    }
    return tryResolveModuleFile(sharedPathModule.resolve(sharedPathModule.dirname(parentFilename), raw));
  };

  const escapeSourceUrl = (filename) =>
    String(filename || "")
      .replace(/\\/g, "/")
      .replace(/\r/g, "")
      .replace(/\n/g, "");

  const createModuleRecord = (filename, parentModule) => {
    const module = {
      id: filename,
      filename,
      exports: {},
      loaded: false,
      parent: parentModule || null,
      children: [],
      paths: []
    };
    if (parentModule && Array.isArray(parentModule.children)) {
      parentModule.children.push(module);
    }
    commonJsCache[filename] = module;
    return module;
  };

  const resolveRequireTarget = (specifier, parentFilename) => {
    const raw = String(specifier || "");
    const builtinId = aliasMap[raw];
    if (builtinId) {
      return { type: "builtin", id: builtinId };
    }
    const filename = resolveLocalModuleFilename(raw, parentFilename);
    if (filename) {
      return { type: "file", id: filename };
    }
    throw new Error(`Unsupported require target: ${raw}`);
  };

  const loadFileModule = (filename, parentModule) => {
    const normalizedFilename = normalizeModuleFilename(filename);
    if (commonJsCache[normalizedFilename]) {
      return commonJsCache[normalizedFilename].exports;
    }

    const module = createModuleRecord(normalizedFilename, parentModule || null);
    const ext = sharedPathModule.extname(normalizedFilename).toLowerCase();

    if (ext === ".json") {
      const source = sharedFsModule.readFileSync(normalizedFilename, { encoding: "utf8" });
      module.exports = JSON.parse(source);
      module.loaded = true;
      return module.exports;
    }

    const source = sharedFsModule.readFileSync(normalizedFilename, { encoding: "utf8" });
    const localRequire = createModuleRequire(module);
    module.require = localRequire;
    const dirname = sharedPathModule.dirname(normalizedFilename);
    const factory = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "process",
      "Buffer",
      "global",
      `${source}\n//# sourceURL=${escapeSourceUrl(normalizedFilename)}`
    );
    factory(
      module.exports,
      localRequire,
      module,
      normalizedFilename,
      dirname,
      builtinRequire("process"),
      BufferPolyfill,
      window
    );
    module.loaded = true;
    return module.exports;
  };

  function createModuleRequire(moduleOrFilename) {
    const parentFilename =
      typeof moduleOrFilename === "string"
        ? normalizeModuleFilename(moduleOrFilename)
        : normalizeModuleFilename(moduleOrFilename?.filename || "");
    const parentModule =
      typeof moduleOrFilename === "string"
        ? commonJsCache[parentFilename] || null
        : moduleOrFilename || null;

    const localRequire = (specifier) => {
      const target = resolveRequireTarget(specifier, parentFilename);
      if (target.type === "builtin") {
        return builtinRequire(target.id);
      }
      return loadFileModule(target.id, parentModule);
    };

    localRequire.resolve = (specifier) => resolveRequireTarget(specifier, parentFilename).id;
    localRequire.cache = commonJsCache;
    return localRequire;
  }

  const runEntryModule = (filename, factory) => {
    const normalizedFilename = normalizeModuleFilename(filename) || "preload.js";
    const module = commonJsCache[normalizedFilename] || createModuleRecord(normalizedFilename, null);
    const localRequire = createModuleRequire(module);
    module.require = localRequire;
    factory(
      module.exports,
      localRequire,
      module,
      normalizedFilename,
      sharedPathModule.dirname(normalizedFilename),
      builtinRequire("process"),
      BufferPolyfill,
      window
    );
    module.loaded = true;
    return module.exports;
  };

  const createOsModule = () => ({
    arch: () => getOsInfo().arch || "unknown",
    cpus: () => Array.isArray(getOsInfo().cpus) ? getOsInfo().cpus.slice() : [],
    endianness: () => getOsInfo().endianness || "LE",
    freemem: () => Number(getOsInfo().freemem || 0),
    homedir: () => getOsInfo().homedir || "",
    hostname: () => getOsInfo().hostname || "",
    platform: () => getOsInfo().platform || inferPlatform(),
    release: () => getOsInfo().release || "",
    tmpdir: () => getOsInfo().tmpdir || "",
    totalmem: () => Number(getOsInfo().totalmem || 0),
    type: () => getOsInfo().type || "Linux",
    EOL: getOsInfo().eol || "\n"
  });

  const toExecResult = (payload, options = {}) => {
    const encoding = normalizeEncoding(options.encoding);
    const stdout = new BufferPolyfill(base64ToBytes(payload?.stdoutBase64 || ""));
    const stderr = new BufferPolyfill(base64ToBytes(payload?.stderrBase64 || ""));
    return {
      status: payload?.status,
      signal: payload?.signal ?? null,
      stdout,
      stderr,
      stdoutValue: encoding ? stdout.toString(encoding) : stdout,
      stderrValue: encoding ? stderr.toString(encoding) : stderr
    };
  };

  const createExecError = (command, result) => {
    const error = new Error(`Command failed: ${command}`);
    error.status = result.status;
    error.signal = result.signal;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.output = [null, result.stdout, result.stderr];
    return error;
  };

  const runCommandSync = (command, args, options = {}, shell = false) => {
    const payload = callBridgeSync("childProcess.run", {
      command,
      args: Array.isArray(args) ? args.map((item) => String(item)) : [],
      cwd: options.cwd,
      env: options.env,
      shell,
      inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
    });
    const result = toExecResult(payload, options);
    if (options.stdio === "inherit") {
      if (result.stdout.length) {
        console.log(result.stdout.toString("utf8"));
      }
      if (result.stderr.length) {
        console.error(result.stderr.toString("utf8"));
      }
    }
    if (!(payload && payload.success)) {
      throw createExecError(command, result);
    }
    return options.stdio === "inherit" ? null : result.stdoutValue;
  };

  class ChildReadableStream extends EventEmitter {
    constructor() {
      super();
      this.readable = true;
      this.destroyed = false;
      this._encoding = null;
    }

    setEncoding(encoding) {
      this._encoding = normalizeEncoding(encoding) || "utf-8";
      return this;
    }

    pipe(destination) {
      this.on("data", (chunk) => {
        if (destination && typeof destination.write === "function") {
          destination.write(chunk);
        }
      });
      this.on("end", () => {
        if (destination && typeof destination.end === "function") {
          destination.end();
        }
      });
      return destination;
    }

    destroy(error) {
      if (this.destroyed) {
        return this;
      }
      this.destroyed = true;
      this.readable = false;
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
      return this;
    }

    _push(base64Value) {
      if (!this.readable) {
        return;
      }
      const chunk = new BufferPolyfill(base64ToBytes(base64Value || ""));
      this.emit("data", this._encoding ? chunk.toString(this._encoding) : chunk);
    }

    _close() {
      if (!this.readable) {
        return;
      }
      this.readable = false;
      this.emit("end");
      this.emit("close");
    }
  }

  class ChildWritableStream extends EventEmitter {
    constructor(id) {
      super();
      this._id = id;
      this.writable = true;
      this.destroyed = false;
      this._queue = Promise.resolve();
    }

    _enqueue(taskFactory, callback) {
      const task = this._queue.then(taskFactory, taskFactory);
      this._queue = task.then(
        () => undefined,
        () => undefined
      );
      if (typeof callback === "function") {
        task.then(
          () => callback(null),
          (error) => callback(error)
        );
      }
      return true;
    }

    write(chunk, encoding, callback) {
      if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      if (!this.writable || this.destroyed) {
        const error = new Error("stdin is closed");
        if (typeof callback === "function") {
          callback(error);
        }
        this.emit("error", error);
        return false;
      }
      return this._enqueue(
        () =>
          callBridgeAsync("childProcess.stdinWrite", {
            id: this._id,
            dataBase64: encodeFsData(chunk, encoding)
          }),
        callback
      );
    }

    end(chunk, encoding, callback) {
      if (typeof chunk === "function") {
        callback = chunk;
        chunk = undefined;
        encoding = undefined;
      } else if (typeof encoding === "function") {
        callback = encoding;
        encoding = undefined;
      }
      if (chunk !== undefined) {
        this.write(chunk, encoding);
      }
      const finalize = () =>
        callBridgeAsync("childProcess.stdinEnd", { id: this._id }).then(() => {
          this.writable = false;
          this.emit("finish");
          this.emit("close");
        });
      this._enqueue(finalize, callback);
      return this;
    }

    destroy(error) {
      if (this.destroyed) {
        return this;
      }
      this.destroyed = true;
      this.writable = false;
      void callBridgeAsync("childProcess.stdinEnd", { id: this._id }).catch(() => {});
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
      return this;
    }
  }

  const spawnChildProcess = (command, args = [], options = {}) => {
    const session = callBridgeSync("childProcess.spawn", {
      command: String(command || ""),
      args: Array.isArray(args) ? args.map((item) => String(item)) : [],
      cwd: options.cwd,
      env: options.env,
      shell: Boolean(options.shell),
      inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
    });

    const child = new EventEmitter();
    child.pid = Number(session?.pid || 0);
    child.killed = false;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = new ChildWritableStream(session.id);
    child.stdout = new ChildReadableStream();
    child.stderr = new ChildReadableStream();

    let cursor = 0;
    let closed = false;

    const finish = () => {
      if (closed) {
        return;
      }
      closed = true;
      child.stdin.writable = false;
      void callBridgeAsync("childProcess.dispose", { id: session.id }).catch(() => {});
    };

    const poll = async () => {
      if (closed) {
        return;
      }
      try {
        const payload = await callBridgeAsync("childProcess.poll", {
          id: session.id,
          cursor
        });
        const events = Array.isArray(payload?.events) ? payload.events : [];
        for (const event of events) {
          cursor = Math.max(cursor, Number(event?.seq || 0));
          if (event?.type === "data") {
            if (event.stream === "stderr") {
              child.stderr._push(event.dataBase64 || "");
            } else {
              child.stdout._push(event.dataBase64 || "");
            }
            continue;
          }
          if (event?.type === "error") {
            const error = normalizeNodeError(
              { message: event.message || "child process error" },
              "child process error"
            );
            if (event.stream === "stderr") {
              child.stderr.emit("error", error);
            } else if (event.stream === "stdout") {
              child.stdout.emit("error", error);
            } else {
              child.emit("error", error);
            }
            continue;
          }
          if (event?.type === "close") {
            child.exitCode = event.status ?? null;
            child.signalCode = event.signal ?? null;
            child.stdout._close();
            child.stderr._close();
            child.emit("exit", child.exitCode, child.signalCode);
            child.emit("close", child.exitCode, child.signalCode);
            finish();
            return;
          }
        }
        if (payload?.done) {
          child.stdout._close();
          child.stderr._close();
          child.emit("close", child.exitCode, child.signalCode);
          finish();
          return;
        }
        setTimeout(poll, Number(options.pollInterval || 60));
      } catch (error) {
        child.stdout.destroy(error);
        child.stderr.destroy(error);
        child.emit("error", error);
        finish();
      }
    };

    child.kill = () => {
      child.killed = true;
      void callBridgeAsync("childProcess.kill", { id: session.id }).catch((error) => {
        child.emit("error", error);
      });
      return true;
    };

    child.disconnect = () => {};

    setTimeout(poll, 0);
    return child;
  };

  const createChildProcessModule = () => {
    const execSync = (command, options = {}) =>
      runCommandSync(String(command || ""), [], options, options.shell !== undefined ? options.shell : true);

    const spawnSync = (command, args = [], options = {}) => {
      const payload = callBridgeSync("childProcess.run", {
        command: String(command || ""),
        args: Array.isArray(args) ? args.map((item) => String(item)) : [],
        cwd: options.cwd,
        env: options.env,
        shell: Boolean(options.shell),
        inputBase64: options.input ? encodeFsData(options.input, options.encoding) : undefined
      });
      const result = toExecResult(payload, options);
      return {
        pid: 0,
        output: [null, result.stdout, result.stderr],
        stdout: result.stdoutValue,
        stderr: result.stderrValue,
        status: result.status,
        signal: result.signal,
        error: payload && payload.success ? undefined : createExecError(String(command || ""), result)
      };
    };

    const spawn = (command, args, options) => {
      if (!Array.isArray(args)) {
        options = args || {};
        args = [];
      }
      return spawnChildProcess(command, args, options || {});
    };

    const execFileSync = (file, args = [], options = {}) =>
      runCommandSync(String(file || ""), args, { ...options, shell: false }, false);

    const exec = (command, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const child = new EventEmitter();
      child.pid = 0;
      child.killed = false;
      child.kill = () => false;

      callBridgeAsync("childProcess.run", {
        command: String(command || ""),
        args: [],
        cwd: options?.cwd,
        env: options?.env,
        shell: options?.shell !== undefined ? options.shell : true,
        inputBase64: options?.input ? encodeFsData(options.input, options.encoding) : undefined
      }).then((payload) => {
        const result = toExecResult(payload, options || {});
        if (!(payload && payload.success)) {
          const error = createExecError(String(command || ""), result);
          if (typeof callback === "function") {
            callback(error, result.stdoutValue, result.stderrValue);
          }
          child.emit("error", error);
          child.emit("close", result.status, result.signal);
          return;
        }
        if (typeof callback === "function") {
          callback(null, result.stdoutValue, result.stderrValue);
        }
        child.emit("close", result.status, result.signal);
      }).catch((error) => {
        if (typeof callback === "function") {
          callback(error, "", "");
        }
        child.emit("error", error);
      });

      return child;
    };

    const execFile = (file, args, options, callback) => {
      if (typeof args === "function") {
        callback = args;
        args = [];
        options = {};
      } else if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const child = new EventEmitter();
      child.pid = 0;
      child.killed = false;
      child.kill = () => false;

      callBridgeAsync("childProcess.run", {
        command: String(file || ""),
        args: Array.isArray(args) ? args.map((item) => String(item)) : [],
        cwd: options?.cwd,
        env: options?.env,
        shell: false,
        inputBase64: options?.input ? encodeFsData(options.input, options.encoding) : undefined
      }).then((payload) => {
        const result = toExecResult(payload, options || {});
        if (!(payload && payload.success)) {
          const error = createExecError(String(file || ""), result);
          if (typeof callback === "function") {
            callback(error, result.stdoutValue, result.stderrValue);
          }
          child.emit("error", error);
          child.emit("close", result.status, result.signal);
          return;
        }
        if (typeof callback === "function") {
          callback(null, result.stdoutValue, result.stderrValue);
        }
        child.emit("close", result.status, result.signal);
      }).catch((error) => {
        if (typeof callback === "function") {
          callback(error, "", "");
        }
        child.emit("error", error);
      });

      return child;
    };

    return {
      exec,
      execSync,
      execFile,
      execFileSync,
      spawn,
      spawnSync
    };
  };

  class IncomingMessage extends EventEmitter {
    constructor(response) {
      super();
      this.statusCode = response.status;
      this.statusMessage = response.statusText;
      this.headers = {};
      response.headers.forEach((value, key) => {
        this.headers[key.toLowerCase()] = value;
      });
      this._response = response;
      this._encoding = null;
    }

    setEncoding(encoding) {
      this._encoding = normalizeEncoding(encoding) || "utf-8";
      return this;
    }

    async _pump() {
      const bytes = new BufferPolyfill(await this._response.arrayBuffer());
      this.emit("data", this._encoding ? bytes.toString(this._encoding) : bytes);
      this.emit("end");
    }
  }

  const normalizeHttpArgs = (url, options, callback) => {
    if (typeof url === "object" && url !== null && !(url instanceof URL)) {
      callback = options;
      options = url;
      url = options?.href || options?.url || "";
    }
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    return {
      url: String(url || options?.href || ""),
      options: options && typeof options === "object" ? { ...options } : {},
      callback
    };
  };

  const createHttpModule = (defaultProtocol) => {
    const request = (url, options, callback) => {
      const normalized = normalizeHttpArgs(url, options, callback);
      const headers = new Headers(normalized.options.headers || {});
      const emitter = new EventEmitter();
      const chunks = [];
      let ended = false;
      let aborted = false;

      const requestApi = Object.assign(emitter, {
        setHeader(name, value) {
          headers.set(name, value);
        },
        getHeader(name) {
          return headers.get(name);
        },
        removeHeader(name) {
          headers.delete(name);
        },
        write(chunk) {
          chunks.push(toBuffer(chunk));
        },
        end(chunk) {
          if (chunk !== undefined) {
            requestApi.write(chunk);
          }
          if (ended || aborted) {
            return;
          }
          ended = true;
          const body = chunks.length ? BufferPolyfill.concat(chunks) : undefined;
          const finalUrl = normalized.url || `${defaultProtocol || "http:"}//localhost`;
          fetch(finalUrl, {
            method: normalized.options.method || "GET",
            headers,
            body: body && body.length ? body : undefined,
            redirect: normalized.options.followRedirects === false ? "manual" : "follow"
          }).then(async (response) => {
            const message = new IncomingMessage(response);
            if (typeof normalized.callback === "function") {
              normalized.callback(message);
            }
            emitter.emit("response", message);
            await message._pump();
            emitter.emit("close");
          }).catch((error) => {
            emitter.emit("error", error);
          });
        },
        abort() {
          aborted = true;
        },
        destroy(error) {
          aborted = true;
          if (error) {
            emitter.emit("error", error);
          }
        }
      });
      return requestApi;
    };

    return {
      METHODS: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      Agent: function Agent() {},
      request,
      get(url, options, callback) {
        const req = request(url, options, callback);
        req.end();
        return req;
      }
    };
  };

  const normalizeDialogMessageOptions = (options) => {
    if (typeof options === "string") {
      return { title: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const normalizeDialogConfirmOptions = (options) => {
    if (typeof options === "string") {
      return { title: options };
    }
    if (options && typeof options === "object") {
      return { ...options };
    }
    return {};
  };

  const resolveDialogOkLabel = (options, fallbackText) => {
    if (
      options &&
      typeof options === "object" &&
      options.buttons &&
      typeof options.buttons === "object" &&
      options.buttons.ok
    ) {
      return String(options.buttons.ok);
    }
    if (options && typeof options.okLabel === "string" && options.okLabel.trim()) {
      return options.okLabel.trim();
    }
    return fallbackText;
  };

  const browserAlert = (message, options = {}) => {
    const title = String(options.title || "").trim();
    const text = title ? `${title}\n\n${String(message || "")}` : String(message || "");
    window.alert(text);
  };

  const browserConfirm = (message, options = {}) => {
    const title = String(options.title || "").trim();
    const text = title ? `${title}\n\n${String(message || "")}` : String(message || "");
    return window.confirm(text);
  };

  const createDialogModule = () => {
    const open = async (options = {}) => {
      if (!hasHostInvoke()) {
        return null;
      }
      return callHostInvoke("plugin:dialog|open", { options });
    };

    const save = async (options = {}) => {
      if (!hasHostInvoke()) {
        return null;
      }
      return callHostInvoke("plugin:dialog|save", { options });
    };

    const message = async (messageText, options) => {
      const normalized = normalizeDialogMessageOptions(options);
      if (hasHostInvoke()) {
        await callHostInvoke("plugin:dialog|message", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          okButtonLabel: resolveDialogOkLabel(normalized, "确定")
        });
        return;
      }
      browserAlert(messageText, normalized);
    };

    const confirm = async (messageText, options) => {
      const normalized = normalizeDialogConfirmOptions(options);
      if (hasHostInvoke()) {
        return callHostInvoke("plugin:dialog|confirm", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          okButtonLabel: resolveDialogOkLabel(normalized, "确定"),
          cancelButtonLabel:
            normalized && typeof normalized.cancelLabel === "string" && normalized.cancelLabel.trim()
              ? normalized.cancelLabel.trim()
              : "取消"
        });
      }
      return browserConfirm(messageText, normalized);
    };

    const ask = async (messageText, options) => {
      const normalized = normalizeDialogConfirmOptions(options);
      if (hasHostInvoke()) {
        return callHostInvoke("plugin:dialog|ask", {
          message: String(messageText || ""),
          title: normalized.title ? String(normalized.title) : undefined,
          kind: normalized.kind,
          yesButtonLabel: resolveDialogOkLabel(normalized, "是"),
          noButtonLabel:
            normalized && typeof normalized.cancelLabel === "string" && normalized.cancelLabel.trim()
              ? normalized.cancelLabel.trim()
              : "否"
        });
      }
      return browserConfirm(messageText, normalized);
    };

    return {
      open,
      save,
      message,
      confirm,
      ask
    };
  };

  const EXTERNAL_SHELL_TARGET_RE = /^(https?:\/\/|mailto:|tel:)/i;

  const openBrowserWindow = (target) => {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = target;
    }
  };

  const createShellModule = () => {
    const open = async (path, openWith) => {
      const target = String(path || "").trim();
      if (!target) {
        return;
      }
      if (hasHostInvoke()) {
        await callHostInvoke("plugin:shell|open", {
          path: target,
          with: openWith
        });
        return;
      }
      if (EXTERNAL_SHELL_TARGET_RE.test(target)) {
        openBrowserWindow(target);
      }
    };

    const openPath = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellOpenPath === "function") {
        window.otools.shellOpenPath(target);
        return;
      }
      await open(target);
    };

    const showItemInFolder = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellShowItemInFolder === "function") {
        window.otools.shellShowItemInFolder(target);
        return;
      }
      await openPath(target);
    };

    const trashItem = async (fullPath) => {
      const target = String(fullPath || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellTrashItem === "function") {
        window.otools.shellTrashItem(target);
      }
    };

    const openExternal = async (url) => {
      const target = String(url || "").trim();
      if (!target) {
        return;
      }
      if (window.otools && typeof window.otools.shellOpenExternal === "function") {
        window.otools.shellOpenExternal(target);
        return;
      }
      await open(target);
    };

    const beep = async () => {
      if (window.otools && typeof window.otools.shellBeep === "function") {
        window.otools.shellBeep();
      }
    };

    return {
      open,
      openPath,
      showItemInFolder,
      trashItem,
      openExternal,
      beep
    };
  };

  const createProcessModule = () => ({
    arch: getOsInfo().arch || "unknown",
    argv: [],
    browser: false,
    cwd: () => getProcessCwd(),
    env: {},
    nextTick(callback, ...args) {
      Promise.resolve().then(() => callback(...args));
    },
    platform: getOsInfo().platform || inferPlatform(),
    release: {
      name: "noder"
    },
    stderr: {
      write(value) {
        console.error(String(value));
      }
    },
    stdout: {
      write(value) {
        console.log(String(value));
      }
    },
    versions: {
      node: "20.0.0-tauri",
      noder: "1.0.0"
    }
  });

  const builtinModuleNames = Object.freeze([
    "buffer",
    "events",
    "fs",
    "fs/promises",
    "path",
    "os",
    "process",
    "child_process",
    "http",
    "https",
    "@otools/runtime",
    "@otools/dialog",
    "@otools/shell",
    "@otools/fs",
    "@otools/path",
    "@otools/os",
    "@otools/process",
    "@otools/child_process"
  ]);

  const builtinPermissionMap = {
    fs: "fs",
    "fs/promises": "fs",
    child_process: "child_process",
    "@otools/dialog": "dialog",
    "@otools/shell": "shell"
  };

  const ensureBuiltinPermission = (normalizedSpecifier, originalSpecifier) => {
    const permission = builtinPermissionMap[String(normalizedSpecifier || "")];
    if (permission && !hasPluginPermission(permission)) {
      throw createPermissionDeniedError(originalSpecifier || normalizedSpecifier, permission);
    }
  };

  const getOptionalBuiltinModule = (specifier) => {
    const normalized = aliasMap[String(specifier || "")];
    if (!normalized) {
      return null;
    }
    const permission = builtinPermissionMap[normalized];
    if (permission && !hasPluginPermission(permission)) {
      return null;
    }
    return builtinRequire(normalized);
  };

  const createRuntimeModule = () => ({
    isNoder: true,
    isNativeTauri: hasHostInvoke(),
    hasHostBridge: hasHostInvoke(),
    platform: getOsInfo().platform || inferPlatform(),
    appName: String(window.__OToolsEnv?.appName || ""),
    appVersion: String(window.__OToolsEnv?.appVersion || ""),
    pluginUuid: String(window.__OToolsEnv?.pluginUuid || ""),
    env: window.__OToolsEnv || {},
    permissionsRestricted: hasRestrictedPluginPermissions(),
    permissions: getDeclaredPluginPermissions() || [],
    hasPermission: (permission) => hasPluginPermission(permission),
    versions: { ...builtinRequire("process").versions },
    builtinModules: builtinModuleNames.slice(),
    require: globalRequire,
    createRequire: (filename) => runtimeApi.createRequire(filename),
    fs: getOptionalBuiltinModule("fs"),
    path: sharedPathModule,
    os: builtinRequire("os"),
    process: builtinRequire("process"),
    childProcess: getOptionalBuiltinModule("child_process"),
    dialog: getOptionalBuiltinModule("@otools/dialog"),
    shell: getOptionalBuiltinModule("@otools/shell")
  });

  const builtinFactories = {
    buffer: () => ({ Buffer: BufferPolyfill }),
    events: () => ({ EventEmitter }),
    fs: () => sharedFsModule,
    "fs/promises": () => builtinRequire("fs").promises,
    path: () => sharedPathModule,
    os: () => createOsModule(),
    process: () => createProcessModule(),
    child_process: () => createChildProcessModule(),
    http: () => createHttpModule("http:"),
    https: () => createHttpModule("https:"),
    "@otools/runtime": () => createRuntimeModule(),
    "@otools/dialog": () => createDialogModule(),
    "@otools/shell": () => createShellModule()
  };

  const aliasMap = {
    buffer: "buffer",
    "node:buffer": "buffer",
    events: "events",
    "node:events": "events",
    fs: "fs",
    "node:fs": "fs",
    "fs/promises": "fs/promises",
    "node:fs/promises": "fs/promises",
    path: "path",
    "node:path": "path",
    os: "os",
    "node:os": "os",
    process: "process",
    "node:process": "process",
    child_process: "child_process",
    "node:child_process": "child_process",
    http: "http",
    "node:http": "http",
    https: "https",
    "node:https": "https",
    "@otools/runtime": "@otools/runtime",
    "@otools/dialog": "@otools/dialog",
    "@otools/shell": "@otools/shell",
    "@otools/fs": "fs",
    "@otools/path": "path",
    "@otools/os": "os",
    "@otools/process": "process",
    "@otools/child_process": "child_process"
  };

  function builtinRequire(specifier) {
    const normalized = aliasMap[String(specifier || "")];
    if (!normalized) {
      throw new Error(`Unsupported require target: ${specifier}`);
    }
    ensureBuiltinPermission(normalized, specifier);
    if (!moduleCache.has(normalized)) {
      const factory = builtinFactories[normalized];
      if (!factory) {
        throw new Error(`Unsupported builtin module: ${specifier}`);
      }
      moduleCache.set(normalized, factory());
    }
    return moduleCache.get(normalized);
  }

  const globalRequire = createModuleRequire(null);
  const assignSdkProperty = (target, key, value) => {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      return;
    }
    try {
      target[key] = value;
    } catch {
      // ignore assignment failure
    }
  };

  const getSdkModules = () => ({
    runtime: builtinRequire("@otools/runtime"),
    dialog: getOptionalBuiltinModule("@otools/dialog"),
    shell: getOptionalBuiltinModule("@otools/shell"),
    fs: getOptionalBuiltinModule("fs"),
    path: sharedPathModule,
    os: builtinRequire("os"),
    process: builtinRequire("process"),
    childProcess: getOptionalBuiltinModule("child_process"),
    require: globalRequire,
    createRequire: (filename) => runtimeApi.createRequire(filename)
  });

  const attachPluginSdkToOtools = (target) => {
    if (!target || typeof target !== "object") {
      return target;
    }
    const sdk = getSdkModules();
    assignSdkProperty(target, "runtime", sdk.runtime);
    assignSdkProperty(target, "dialog", sdk.dialog);
    assignSdkProperty(target, "shell", sdk.shell);
    assignSdkProperty(target, "fs", sdk.fs);
    assignSdkProperty(target, "path", sdk.path);
    assignSdkProperty(target, "os", sdk.os);
    assignSdkProperty(target, "process", sdk.process);
    assignSdkProperty(target, "childProcess", sdk.childProcess);
    assignSdkProperty(target, "require", sdk.require);
    assignSdkProperty(target, "createRequire", sdk.createRequire);
    return target;
  };

  const runtimeApi = {
    builtinRequire,
    createRequire(filename) {
      return createModuleRequire(normalizeModuleFilename(filename));
    },
    require: globalRequire,
    getSdkModules,
    attachOtoolsSdk(target) {
      return attachPluginSdkToOtools(target || window.otools || null);
    },
    runEntryModule
  };

  builtinRequire.resolve = (specifier) => resolveRequireTarget(specifier, "").id;
  builtinRequire.cache = commonJsCache;

  defineGlobal("Buffer", BufferPolyfill);
  defineGlobal("global", window);
  defineGlobal("process", builtinRequire("process"));
  defineGlobal("require", globalRequire);
  defineGlobal("__non_webpack_require__", globalRequire);
  defineGlobal("__OTOOLS_NODER__", runtimeApi);
  attachPluginSdkToOtools(window.otools || null);
})();

export type NoderRequire = ((specifier: string) => unknown) & {
  resolve?: (specifier: string) => string;
};

export type NoderWindow = Window & {
  __OTOOLS_NODER__?: {
    require?: NoderRequire;
  };
  __OToolsEnv?: {
    appName?: string;
    appVersion?: string;
    isDev?: boolean;
    paths?: Record<string, string>;
    platform?: string;
    processEnv?: Record<string, string>;
  };
};

export function runtimeWindow(): NoderWindow | null {
  return typeof window === "undefined" ? null : (window as NoderWindow);
}

export function readNoderModule<T = Record<string, unknown>>(
  specifier: string,
): T | null {
  try {
    const required = runtimeWindow()?.__OTOOLS_NODER__?.require?.(specifier);
    return required && typeof required === "object" ? (required as T) : null;
  } catch {
    return null;
  }
}

export function readRuntimePlatform() {
  const platform = String(runtimeWindow()?.__OToolsEnv?.platform || "").toLowerCase();
  if (platform.includes("win")) {
    return "win32";
  }
  if (platform.includes("mac") || platform === "darwin") {
    return "darwin";
  }
  if (platform.includes("linux")) {
    return "linux";
  }
  return "browser";
}

export function slashNormalize(path: unknown) {
  return String(path ?? "").replace(/\\/g, "/");
}

export function isAbsolutePath(path: unknown) {
  const value = String(path ?? "");
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value);
}

export function dirname(path: unknown) {
  const normalized = slashNormalize(path).replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    return ".";
  }
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return index === 0 ? "/" : ".";
  }
  return normalized.slice(0, index);
}

export function basename(path: unknown, ext = "") {
  const normalized = slashNormalize(path).replace(/\/+$/, "");
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  const suffix = String(ext || "");
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

export function extname(path: unknown) {
  const base = basename(path);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
}

export function normalizePath(...parts: unknown[]) {
  const text = parts
    .map((part) => slashNormalize(part))
    .filter(Boolean)
    .join("/");
  const absolute = text.startsWith("/");
  const segments: string[] = [];
  for (const segment of text.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!absolute) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  return absolute ? `/${joined}` || "/" : joined || ".";
}

export function joinPath(...parts: unknown[]) {
  return normalizePath(...parts);
}

export function resolvePath(...parts: unknown[]) {
  let resolved = "";
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = slashNormalize(parts[index]);
    if (!part) {
      continue;
    }
    resolved = resolved ? `${part}/${resolved}` : part;
    if (isAbsolutePath(part)) {
      break;
    }
  }
  if (!isAbsolutePath(resolved)) {
    resolved = `/${resolved}`;
  }
  return normalizePath(resolved);
}

export function relativePath(from: unknown, to: unknown) {
  const fromParts = normalizePath(from).split("/").filter(Boolean);
  const toParts = normalizePath(to).split("/").filter(Boolean);
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/") || "";
}

export class CompatEventEmitter {
  private readonly buckets = new Map<string | symbol, Set<(...args: unknown[]) => void>>();

  on(event: string | symbol, listener: (...args: unknown[]) => void) {
    const bucket = this.buckets.get(event) ?? new Set<(...args: unknown[]) => void>();
    bucket.add(listener);
    this.buckets.set(event, bucket);
    return this;
  }

  addListener(event: string | symbol, listener: (...args: unknown[]) => void) {
    return this.on(event, listener);
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string | symbol, listener: (...args: unknown[]) => void) {
    this.buckets.get(event)?.delete(listener);
    return this;
  }

  removeListener(event: string | symbol, listener: (...args: unknown[]) => void) {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string | symbol) {
    if (event === undefined) {
      this.buckets.clear();
    } else {
      this.buckets.delete(event);
    }
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]) {
    const listeners = [...(this.buckets.get(event) ?? [])];
    for (const listener of listeners) {
      listener(...args);
    }
    return listeners.length > 0;
  }

  listeners(event: string | symbol) {
    return [...(this.buckets.get(event) ?? [])];
  }

  listenerCount(event: string | symbol) {
    return this.buckets.get(event)?.size ?? 0;
  }

  eventNames() {
    return [...this.buckets.keys()];
  }
}

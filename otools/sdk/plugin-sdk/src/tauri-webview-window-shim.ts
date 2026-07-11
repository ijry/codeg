import { emit, listen, type Event, type UnlistenFn } from "./runtime";
import { getCurrentWindow } from "./tauri-window-shim";

export type WebviewWindowOptions = {
  url?: string;
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  center?: boolean;
  focus?: boolean;
  resizable?: boolean;
  decorations?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  hiddenTitle?: boolean;
  titleBarStyle?: string;
  trafficLightPosition?: unknown;
};

const errorEventName = "tauri://error";

function resolveWindowUrl(url: string): string {
  if (typeof window === "undefined") {
    return url;
  }
  try {
    return new URL(url).toString();
  } catch {
    return new URL(url, window.location.href).toString();
  }
}

function toFeatureNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function buildWindowFeatures(options: WebviewWindowOptions): string {
  const features: string[] = ["popup=yes"];
  const width = toFeatureNumber(options.width);
  const height = toFeatureNumber(options.height);
  const x = toFeatureNumber(options.x);
  const y = toFeatureNumber(options.y);

  if (width !== null) {
    features.push(`width=${width}`);
  }
  if (height !== null) {
    features.push(`height=${height}`);
  }
  if (x !== null) {
    features.push(`left=${x}`);
  }
  if (y !== null) {
    features.push(`top=${y}`);
  }
  if (options.resizable === false) {
    features.push("resizable=no");
  }
  return features.join(",");
}

export class WebviewWindow {
  readonly label: string;

  private childWindow: Window | null = null;

  private pendingError: unknown = null;

  constructor(label: string, options: WebviewWindowOptions = {}) {
    this.label = label;
    if (typeof window === "undefined") {
      return;
    }

    const url = String(options.url || "").trim();
    if (!url) {
      return;
    }

    const opened = window.open(
      resolveWindowUrl(url),
      label,
      buildWindowFeatures(options),
    );
    if (opened) {
      this.childWindow = opened;
      if (options.focus !== false) {
        opened.focus();
      }
      return;
    }

    this.pendingError = "Failed to open webview window";
  }

  static async getByLabel(_label: string): Promise<WebviewWindow | null> {
    return null;
  }

  static async getAll(): Promise<WebviewWindow[]> {
    return [];
  }

  async listen<T>(
    eventName: string,
    handler: (event: Event<T>) => void | Promise<void>,
  ): Promise<UnlistenFn> {
    if (eventName === errorEventName && this.pendingError) {
      const payload = this.pendingError as T;
      queueMicrotask(() => {
        void handler({ event: eventName, id: -1, payload });
      });
      return () => {};
    }
    return listen(eventName, handler);
  }

  async once<T>(
    eventName: string,
    handler: (event: Event<T>) => void | Promise<void>,
  ): Promise<UnlistenFn> {
    let unlisten: UnlistenFn | null = null;
    unlisten = await this.listen<T>(eventName, async (event) => {
      if (unlisten) {
        await unlisten();
      }
      await handler(event);
    });
    return unlisten;
  }

  async emit<T>(eventName: string, payload?: T): Promise<void> {
    await emit(eventName, payload);
  }

  async close(): Promise<void> {
    this.childWindow?.close();
  }

  async hide(): Promise<void> {
    this.childWindow?.blur();
  }

  async show(): Promise<void> {
    this.childWindow?.focus();
  }

  async setFocus(): Promise<void> {
    this.childWindow?.focus();
  }

  async setAlwaysOnTop(_alwaysOnTop: boolean): Promise<void> {}

  async setVisibleOnAllWorkspaces(_visible: boolean): Promise<void> {}

  async setPosition(_position: unknown): Promise<void> {}

  async setSize(_size: unknown): Promise<void> {}

  async setTitle(title: string): Promise<void> {
    if (this.childWindow) {
      this.childWindow.document.title = title;
    }
  }

  async innerSize(): Promise<{ width: number; height: number }> {
    const target =
      this.childWindow || (typeof window !== "undefined" ? window : null);
    return {
      width: target?.innerWidth ?? 0,
      height: target?.innerHeight ?? 0,
    };
  }

  async outerSize(): Promise<{ width: number; height: number }> {
    const target =
      this.childWindow || (typeof window !== "undefined" ? window : null);
    return {
      width: target?.outerWidth ?? 0,
      height: target?.outerHeight ?? 0,
    };
  }
}

export function getCurrentWebviewWindow(): ReturnType<typeof getCurrentWindow> {
  return getCurrentWindow();
}

export async function getAllWebviewWindows(): Promise<WebviewWindow[]> {
  return WebviewWindow.getAll();
}

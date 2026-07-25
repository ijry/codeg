type NoderRuntime = {
  require?: (specifier: string) => unknown;
};

type RuntimeWindow = Window & {
  __OTOOLS_NODER__?: NoderRuntime;
  otools?: {
    copyText?: (text: string) => boolean;
    copyImage?: (image: string) => boolean;
    hideMainWindow?: () => void;
    outPlugin?: () => void;
    shellBeep?: () => void;
    shellOpenExternal?: (url: string) => void;
    shellOpenPath?: (path: string) => void;
    shellShowItemInFolder?: (path: string) => void;
    shellTrashItem?: (path: string) => void;
    showMainWindow?: () => void;
    showNotification?: (body: string) => void;
  };
  __OToolsEnv?: {
    appName?: string;
    appVersion?: string;
    paths?: Record<string, string>;
  };
};

type Listener = (...args: unknown[]) => void;

function runtimeWindow(): RuntimeWindow | null {
  return typeof window === "undefined" ? null : (window as RuntimeWindow);
}

function readNoderElectron(): Record<PropertyKey, unknown> | null {
  try {
    const electron = runtimeWindow()?.__OTOOLS_NODER__?.require?.("electron");
    return electron && typeof electron === "object"
      ? (electron as Record<PropertyKey, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readElectronMember<T>(key: PropertyKey, fallback: T): T {
  const value = readNoderElectron()?.[key];
  return value === undefined || value === null ? fallback : (value as T);
}

class EventEmitter {
  private readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    const bucket = this.listeners.get(event) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeListener(event: string, listener: Listener) {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
    return true;
  }
}

class NativeImage {
  private readonly dataUrl: string;

  constructor(dataUrl = "") {
    this.dataUrl = dataUrl;
  }

  isEmpty() {
    return !this.dataUrl;
  }

  getSize() {
    return { width: 0, height: 0 };
  }

  toDataURL() {
    return this.dataUrl;
  }

  toPNG() {
    return new Uint8Array();
  }

  toJPEG() {
    return new Uint8Array();
  }

  resize() {
    return new NativeImage(this.dataUrl);
  }

  crop() {
    return new NativeImage(this.dataUrl);
  }
}

const fallbackNativeImage = {
  NativeImage,
  createEmpty: () => new NativeImage(),
  createFromBitmap: () => new NativeImage(),
  createFromBuffer: () => new NativeImage(),
  createFromDataURL: (dataUrl: string) => new NativeImage(String(dataUrl || "")),
  createFromNamedImage: () => new NativeImage(),
  createFromPath: () => new NativeImage(),
};

let clipboardText = "";
let clipboardImage = fallbackNativeImage.createEmpty();

const fallbackClipboard = {
  availableFormats: () => [
    ...(clipboardText ? ["text/plain"] : []),
    ...(clipboardImage.isEmpty() ? [] : ["image/png"]),
  ],
  clear: () => {
    clipboardText = "";
    clipboardImage = fallbackNativeImage.createEmpty();
  },
  readText: () => clipboardText,
  writeText: (text: string) => {
    clipboardText = String(text || "");
    runtimeWindow()?.otools?.copyText?.(clipboardText);
  },
  readHTML: () => "",
  writeHTML: () => undefined,
  readImage: () => clipboardImage,
  writeImage: (image: { toDataURL?: () => string; isEmpty?: () => boolean }) => {
    clipboardImage =
      image && typeof image.toDataURL === "function"
        ? new NativeImage(image.toDataURL())
        : fallbackNativeImage.createEmpty();
    if (!clipboardImage.isEmpty()) {
      runtimeWindow()?.otools?.copyImage?.(clipboardImage.toDataURL());
    }
  },
};

const fallbackShell = {
  openExternal: async (url: string) => {
    runtimeWindow()?.otools?.shellOpenExternal?.(String(url || ""));
  },
  openPath: async (path: string) => {
    runtimeWindow()?.otools?.shellOpenPath?.(String(path || ""));
    return "";
  },
  showItemInFolder: (path: string) => {
    runtimeWindow()?.otools?.shellShowItemInFolder?.(String(path || ""));
  },
  trashItem: async (path: string) => {
    runtimeWindow()?.otools?.shellTrashItem?.(String(path || ""));
  },
  moveItemToTrash: async (path: string) => {
    runtimeWindow()?.otools?.shellTrashItem?.(String(path || ""));
  },
  beep: () => {
    runtimeWindow()?.otools?.shellBeep?.();
  },
};

const fallbackDialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showOpenDialogSync: () => undefined,
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  showSaveDialogSync: () => undefined,
  showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
  showMessageBoxSync: () => 0,
  showErrorBox: (title: string, content: string) => {
    console.error(`${title}: ${content}`);
  },
};

const fallbackApp = Object.assign(new EventEmitter(), {
  isReady: () => true,
  whenReady: () => Promise.resolve(),
  getName: () => runtimeWindow()?.__OToolsEnv?.appName || "codeg-plus",
  getVersion: () => runtimeWindow()?.__OToolsEnv?.appVersion || "",
  getAppPath: () => runtimeWindow()?.__OToolsEnv?.paths?.app || "",
  getPath: (name: string) =>
    runtimeWindow()?.__OToolsEnv?.paths?.[String(name || "")] || "",
  getLocale: () =>
    typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  quit: () => runtimeWindow()?.otools?.outPlugin?.(),
  exit: () => runtimeWindow()?.otools?.outPlugin?.(),
});

const fallbackIpcRenderer = Object.assign(new EventEmitter(), {
  invoke: () => Promise.resolve(null),
  send: () => undefined,
  sendSync: () => null,
  postMessage: () => undefined,
  sendToHost: () => undefined,
});

class FallbackBrowserWindow extends EventEmitter {
  readonly id = Date.now();
  readonly webContents = Object.assign(new EventEmitter(), {
    getURL: () =>
      typeof location === "undefined" ? "" : String(location.href || ""),
    reload: () => location.reload(),
    send: () => undefined,
  });

  static getFocusedWindow() {
    return new FallbackBrowserWindow();
  }

  static getAllWindows() {
    return [new FallbackBrowserWindow()];
  }

  show() {
    runtimeWindow()?.otools?.showMainWindow?.();
  }

  hide() {
    runtimeWindow()?.otools?.hideMainWindow?.();
  }

  focus() {
    runtimeWindow()?.focus();
  }

  close() {
    runtimeWindow()?.otools?.outPlugin?.();
  }

  isDestroyed() {
    return false;
  }

  isVisible() {
    return typeof document === "undefined" ? true : !document.hidden;
  }
}

const fallbackScreen = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getPrimaryDisplay: () => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    workArea: { x: 0, y: 0, width: 0, height: 0 },
    scaleFactor: 1,
  }),
  getAllDisplays: () => [fallbackScreen.getPrimaryDisplay()],
};

const fallbackNativeTheme = Object.assign(new EventEmitter(), {
  shouldUseDarkColors: false,
  themeSource: "system",
});

class FallbackMenu {
  static buildFromTemplate(template: unknown[]) {
    return { items: template, popup: () => undefined };
  }
}

class FallbackNotification extends EventEmitter {
  static isSupported() {
    return true;
  }

  show() {
    runtimeWindow()?.otools?.showNotification?.("");
  }
}

class FallbackTray extends EventEmitter {}

type FallbackElectron = {
  app: typeof fallbackApp;
  BrowserWindow: typeof FallbackBrowserWindow;
  clipboard: typeof fallbackClipboard;
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => void };
  dialog: typeof fallbackDialog;
  globalShortcut: {
    isRegistered: () => boolean;
    register: () => boolean;
    registerAll: () => undefined;
    unregister: () => undefined;
    unregisterAll: () => undefined;
  };
  ipcMain: EventEmitter;
  ipcRenderer: typeof fallbackIpcRenderer;
  Menu: typeof FallbackMenu;
  nativeImage: typeof fallbackNativeImage;
  nativeTheme: typeof fallbackNativeTheme;
  Notification: typeof FallbackNotification;
  powerMonitor: EventEmitter;
  remote?: unknown;
  screen: typeof fallbackScreen;
  shell: typeof fallbackShell;
  systemPreferences: {
    getAccentColor: () => string;
    getColor: () => string;
    getEffectiveAppearance: () => string;
    isDarkMode: () => boolean;
  };
  Tray: typeof FallbackTray;
  webFrame: {
    getZoomFactor: () => number;
    setZoomFactor: () => undefined;
    getZoomLevel: () => number;
    setZoomLevel: () => undefined;
  };
};

const fallbackElectron: FallbackElectron = {
  app: fallbackApp,
  BrowserWindow: FallbackBrowserWindow,
  clipboard: fallbackClipboard,
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      const target = runtimeWindow();
      if (target) {
        Object.defineProperty(target, key, {
          configurable: true,
          value,
          writable: true,
        });
      }
    },
  },
  dialog: fallbackDialog,
  globalShortcut: {
    isRegistered: () => false,
    register: () => false,
    registerAll: () => undefined,
    unregister: () => undefined,
    unregisterAll: () => undefined,
  },
  ipcMain: new EventEmitter(),
  ipcRenderer: fallbackIpcRenderer,
  Menu: FallbackMenu,
  nativeImage: fallbackNativeImage,
  nativeTheme: fallbackNativeTheme,
  Notification: FallbackNotification,
  powerMonitor: new EventEmitter(),
  screen: fallbackScreen,
  shell: fallbackShell,
  systemPreferences: {
    getAccentColor: () => "",
    getColor: () => "",
    getEffectiveAppearance: () => "light",
    isDarkMode: () => false,
  },
  Tray: FallbackTray,
  webFrame: {
    getZoomFactor: () => 1,
    setZoomFactor: () => undefined,
    getZoomLevel: () => 0,
    setZoomLevel: () => undefined,
  },
};

const electronProxy = new Proxy(fallbackElectron as Record<PropertyKey, unknown>, {
  get(target, prop) {
    const electron = readNoderElectron();
    const value = electron?.[prop] ?? target[prop];
    return typeof value === "function" ? value.bind(electron ?? target) : value;
  },
});

fallbackElectron.remote = {
  app: fallbackApp,
  BrowserWindow: FallbackBrowserWindow,
  clipboard: fallbackClipboard,
  dialog: fallbackDialog,
  getCurrentWindow: () => FallbackBrowserWindow.getFocusedWindow(),
  getCurrentWebContents: () =>
    FallbackBrowserWindow.getFocusedWindow().webContents,
  Menu: fallbackElectron.Menu,
  nativeImage: fallbackNativeImage,
  nativeTheme: fallbackNativeTheme,
  require: (specifier: string) =>
    runtimeWindow()?.__OTOOLS_NODER__?.require?.(specifier),
  screen: fallbackScreen,
  shell: fallbackShell,
};

export const app = readElectronMember("app", fallbackApp);
export const BrowserWindow = readElectronMember(
  "BrowserWindow",
  fallbackElectron.BrowserWindow,
);
export const clipboard = readElectronMember("clipboard", fallbackClipboard);
export const contextBridge = readElectronMember(
  "contextBridge",
  fallbackElectron.contextBridge,
);
export const dialog = readElectronMember("dialog", fallbackDialog);
export const globalShortcut = readElectronMember(
  "globalShortcut",
  fallbackElectron.globalShortcut,
);
export const ipcMain = readElectronMember("ipcMain", fallbackElectron.ipcMain);
export const ipcRenderer = readElectronMember(
  "ipcRenderer",
  fallbackIpcRenderer,
);
export const Menu = readElectronMember("Menu", fallbackElectron.Menu);
export const nativeImage = readElectronMember(
  "nativeImage",
  fallbackNativeImage,
);
export const nativeTheme = readElectronMember(
  "nativeTheme",
  fallbackNativeTheme,
);
export const Notification = readElectronMember(
  "Notification",
  fallbackElectron.Notification,
);
export const powerMonitor = readElectronMember(
  "powerMonitor",
  fallbackElectron.powerMonitor,
);
export const remote = readElectronMember("remote", fallbackElectron.remote);
export const screen = readElectronMember("screen", fallbackScreen);
export const shell = readElectronMember("shell", fallbackShell);
export const systemPreferences = readElectronMember(
  "systemPreferences",
  fallbackElectron.systemPreferences,
);
export const Tray = readElectronMember("Tray", fallbackElectron.Tray);
export const webFrame = readElectronMember("webFrame", fallbackElectron.webFrame);

export default electronProxy;

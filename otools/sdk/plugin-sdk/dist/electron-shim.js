function o() {
  return typeof window > "u" ? null : window;
}
function b() {
  try {
    const e = o()?.__OTOOLS_NODER__?.require?.("electron");
    return e && typeof e == "object" ? e : null;
  } catch {
    return null;
  }
}
function r(e, t) {
  const n = b()?.[e];
  return n ?? t;
}
class l {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(t, n) {
    const i = this.listeners.get(t) ?? /* @__PURE__ */ new Set();
    return i.add(n), this.listeners.set(t, i), this;
  }
  once(t, n) {
    const i = (...S) => {
      this.off(t, i), n(...S);
    };
    return this.on(t, i);
  }
  off(t, n) {
    return this.listeners.get(t)?.delete(n), this;
  }
  removeListener(t, n) {
    return this.off(t, n);
  }
  removeAllListeners(t) {
    return t ? this.listeners.delete(t) : this.listeners.clear(), this;
  }
  emit(t, ...n) {
    for (const i of this.listeners.get(t) ?? [])
      i(...n);
    return !0;
  }
}
class a {
  constructor(t = "") {
    this.dataUrl = t;
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
    return new a(this.dataUrl);
  }
  crop() {
    return new a(this.dataUrl);
  }
}
const u = {
  NativeImage: a,
  createEmpty: () => new a(),
  createFromBitmap: () => new a(),
  createFromBuffer: () => new a(),
  createFromDataURL: (e) => new a(String(e || "")),
  createFromNamedImage: () => new a(),
  createFromPath: () => new a()
};
let g = "", d = u.createEmpty();
const p = {
  availableFormats: () => [
    ...g ? ["text/plain"] : [],
    ...d.isEmpty() ? [] : ["image/png"]
  ],
  clear: () => {
    g = "", d = u.createEmpty();
  },
  readText: () => g,
  writeText: (e) => {
    g = String(e || ""), o()?.otools?.copyText?.(g);
  },
  readHTML: () => "",
  writeHTML: () => {
  },
  readImage: () => d,
  writeImage: (e) => {
    d = e && typeof e.toDataURL == "function" ? new a(e.toDataURL()) : u.createEmpty(), d.isEmpty() || o()?.otools?.copyImage?.(d.toDataURL());
  }
}, w = {
  openExternal: async (e) => {
    o()?.otools?.shellOpenExternal?.(String(e || ""));
  },
  openPath: async (e) => (o()?.otools?.shellOpenPath?.(String(e || "")), ""),
  showItemInFolder: (e) => {
    o()?.otools?.shellShowItemInFolder?.(String(e || ""));
  },
  trashItem: async (e) => {
    o()?.otools?.shellTrashItem?.(String(e || ""));
  },
  moveItemToTrash: async (e) => {
    o()?.otools?.shellTrashItem?.(String(e || ""));
  },
  beep: () => {
    o()?.otools?.shellBeep?.();
  }
}, m = {
  showOpenDialog: async () => ({ canceled: !0, filePaths: [] }),
  showOpenDialogSync: () => {
  },
  showSaveDialog: async () => ({ canceled: !0, filePath: void 0 }),
  showSaveDialogSync: () => {
  },
  showMessageBox: async () => ({ response: 0, checkboxChecked: !1 }),
  showMessageBoxSync: () => 0,
  showErrorBox: (e, t) => {
    console.error(`${e}: ${t}`);
  }
}, f = Object.assign(new l(), {
  isReady: () => !0,
  whenReady: () => Promise.resolve(),
  getName: () => o()?.__OToolsEnv?.appName || "codeg-plus",
  getVersion: () => o()?.__OToolsEnv?.appVersion || "",
  getAppPath: () => o()?.__OToolsEnv?.paths?.app || "",
  getPath: (e) => o()?.__OToolsEnv?.paths?.[String(e || "")] || "",
  getLocale: () => typeof navigator > "u" ? "en-US" : navigator.language || "en-US",
  quit: () => o()?.otools?.outPlugin?.(),
  exit: () => o()?.otools?.outPlugin?.()
}), v = Object.assign(new l(), {
  invoke: () => Promise.resolve(null),
  send: () => {
  },
  sendSync: () => null,
  postMessage: () => {
  },
  sendToHost: () => {
  }
});
class c extends l {
  constructor() {
    super(...arguments), this.id = Date.now(), this.webContents = Object.assign(new l(), {
      getURL: () => typeof location > "u" ? "" : String(location.href || ""),
      reload: () => location.reload(),
      send: () => {
      }
    });
  }
  static getFocusedWindow() {
    return new c();
  }
  static getAllWindows() {
    return [new c()];
  }
  show() {
    o()?.otools?.showMainWindow?.();
  }
  hide() {
    o()?.otools?.hideMainWindow?.();
  }
  focus() {
    o()?.focus();
  }
  close() {
    o()?.otools?.outPlugin?.();
  }
  isDestroyed() {
    return !1;
  }
  isVisible() {
    return typeof document > "u" ? !0 : !document.hidden;
  }
}
const h = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getPrimaryDisplay: () => ({
    id: 1,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    workArea: { x: 0, y: 0, width: 0, height: 0 },
    scaleFactor: 1
  }),
  getAllDisplays: () => [h.getPrimaryDisplay()]
}, y = Object.assign(new l(), {
  shouldUseDarkColors: !1,
  themeSource: "system"
});
class T {
  static buildFromTemplate(t) {
    return { items: t, popup: () => {
    } };
  }
}
class x extends l {
  static isSupported() {
    return !0;
  }
  show() {
    o()?.otools?.showNotification?.("");
  }
}
class M extends l {
}
const s = {
  app: f,
  BrowserWindow: c,
  clipboard: p,
  contextBridge: {
    exposeInMainWorld: (e, t) => {
      const n = o();
      n && Object.defineProperty(n, e, {
        configurable: !0,
        value: t,
        writable: !0
      });
    }
  },
  dialog: m,
  globalShortcut: {
    isRegistered: () => !1,
    register: () => !1,
    registerAll: () => {
    },
    unregister: () => {
    },
    unregisterAll: () => {
    }
  },
  ipcMain: new l(),
  ipcRenderer: v,
  Menu: T,
  nativeImage: u,
  nativeTheme: y,
  Notification: x,
  powerMonitor: new l(),
  screen: h,
  shell: w,
  systemPreferences: {
    getAccentColor: () => "",
    getColor: () => "",
    getEffectiveAppearance: () => "light",
    isDarkMode: () => !1
  },
  Tray: M,
  webFrame: {
    getZoomFactor: () => 1,
    setZoomFactor: () => {
    },
    getZoomLevel: () => 0,
    setZoomLevel: () => {
    }
  }
}, P = new Proxy(s, {
  get(e, t) {
    const n = b(), i = n?.[t] ?? e[t];
    return typeof i == "function" ? i.bind(n ?? e) : i;
  }
});
s.remote = {
  app: f,
  BrowserWindow: c,
  clipboard: p,
  dialog: m,
  getCurrentWindow: () => c.getFocusedWindow(),
  getCurrentWebContents: () => c.getFocusedWindow().webContents,
  Menu: s.Menu,
  nativeImage: u,
  nativeTheme: y,
  require: (e) => o()?.__OTOOLS_NODER__?.require?.(e),
  screen: h,
  shell: w
};
const E = r("app", f), F = r(
  "BrowserWindow",
  s.BrowserWindow
), O = r("clipboard", p), D = r(
  "contextBridge",
  s.contextBridge
), I = r("dialog", m), k = r(
  "globalShortcut",
  s.globalShortcut
), U = r("ipcMain", s.ipcMain), L = r(
  "ipcRenderer",
  v
), R = r("Menu", s.Menu), B = r(
  "nativeImage",
  u
), N = r(
  "nativeTheme",
  y
), W = r(
  "Notification",
  s.Notification
), _ = r(
  "powerMonitor",
  s.powerMonitor
), A = r("remote", s.remote), C = r("screen", h), j = r("shell", w), q = r(
  "systemPreferences",
  s.systemPreferences
), Z = r("Tray", s.Tray), H = r("webFrame", s.webFrame);
export {
  F as BrowserWindow,
  R as Menu,
  W as Notification,
  Z as Tray,
  E as app,
  O as clipboard,
  D as contextBridge,
  P as default,
  I as dialog,
  k as globalShortcut,
  U as ipcMain,
  L as ipcRenderer,
  B as nativeImage,
  N as nativeTheme,
  _ as powerMonitor,
  A as remote,
  C as screen,
  j as shell,
  q as systemPreferences,
  H as webFrame
};
//# sourceMappingURL=electron-shim.js.map

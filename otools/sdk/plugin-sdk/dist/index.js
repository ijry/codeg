import { createOtoolsAliasMap as r } from "./aliases.js";
import { createOtoolsPluginSdkViteConfig as i, otoolsTauriShimPlugin as a } from "./vite.js";
import { e as s, g as n, i as p, a as m, l as c, o as f, b as x, c as g } from "./remote-service-api-event-shim-CD-wuaHi.js";
import { open as P, openExternal as W, openPath as b } from "./tauri-plugin-shell-shim.js";
import { LogicalPosition as O, LogicalSize as k, PhysicalPosition as v, PhysicalSize as w } from "./tauri-dpi-shim.js";
import { WebviewWindow as C, getAllWebviewWindows as F, getCurrentWebviewWindow as S } from "./tauri-webview-window-shim.js";
import { pickDirectory as T, pickFile as y, pickFiles as A, pickZipFile as z, saveFile as L } from "./dialog.js";
import { createOtoolsWebFacade as V, installOtoolsWebRuntime as D } from "./remote-service-otools-web-shim.js";
import { TauriEvent as N } from "./tauri-event-shim.js";
import { convertFileSrc as j, isTauri as q } from "./tauri-core-shim.js";
import { getCurrentWebview as G } from "./tauri-webview-shim.js";
import { getCurrentWindow as I } from "./tauri-window-shim.js";
import { getName as K, getVersion as Q } from "./tauri-app-shim.js";
import { registerTransformCallback as X } from "./native-event-bridge.js";
export {
  O as LogicalPosition,
  k as LogicalSize,
  v as PhysicalPosition,
  w as PhysicalSize,
  N as TauriEvent,
  C as WebviewWindow,
  j as convertFileSrc,
  r as createOtoolsAliasMap,
  i as createOtoolsPluginSdkViteConfig,
  V as createOtoolsWebFacade,
  s as emit,
  F as getAllWebviewWindows,
  G as getCurrentWebview,
  S as getCurrentWebviewWindow,
  I as getCurrentWindow,
  K as getName,
  n as getOtoolsApi,
  Q as getVersion,
  D as installOtoolsWebRuntime,
  p as invoke,
  m as isOtoolsPluginRuntime,
  q as isTauri,
  c as listen,
  f as once,
  x as openExternal,
  g as openPath,
  a as otoolsTauriShimPlugin,
  T as pickDirectory,
  y as pickFile,
  A as pickFiles,
  z as pickZipFile,
  L as saveFile,
  P as shellOpen,
  W as shellOpenExternal,
  b as shellOpenPath,
  X as transformCallback
};
//# sourceMappingURL=index.js.map

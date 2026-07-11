import { convertFileSrc as r, isTauri as i } from "./tauri-core-shim.js";
import { TauriEvent as a } from "./tauri-event-shim.js";
import { getName as s, getVersion as l } from "./tauri-app-shim.js";
import { getCurrentWindow as f } from "./tauri-window-shim.js";
import { getCurrentWebview as g } from "./tauri-webview-shim.js";
import { WebviewWindow as x, getAllWebviewWindows as w, getCurrentWebviewWindow as W } from "./tauri-webview-window-shim.js";
import { LogicalPosition as b, LogicalSize as u, PhysicalPosition as C, PhysicalSize as d } from "./tauri-dpi-shim.js";
import { e as k, i as S, l as T, o as h } from "./remote-service-api-event-shim-CD-wuaHi.js";
import { registerTransformCallback as z } from "./native-event-bridge.js";
export {
  b as LogicalPosition,
  u as LogicalSize,
  C as PhysicalPosition,
  d as PhysicalSize,
  a as TauriEvent,
  x as WebviewWindow,
  r as convertFileSrc,
  k as emit,
  w as getAllWebviewWindows,
  g as getCurrentWebview,
  W as getCurrentWebviewWindow,
  f as getCurrentWindow,
  s as getName,
  l as getVersion,
  S as invoke,
  i as isTauri,
  T as listen,
  h as once,
  z as transformCallback
};
//# sourceMappingURL=tauri-api-shim.js.map

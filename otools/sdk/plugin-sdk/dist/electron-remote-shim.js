import t, { shell as n, screen as i, nativeTheme as s, nativeImage as u, Menu as d, dialog as c, clipboard as g, BrowserWindow as r, app as w } from "./electron-shim.js";
const o = t.remote && typeof t.remote == "object" ? t.remote : {
  app: w,
  BrowserWindow: r,
  clipboard: g,
  dialog: c,
  getCurrentWindow: () => r.getFocusedWindow(),
  getCurrentWebContents: () => r.getFocusedWindow().webContents,
  Menu: d,
  nativeImage: u,
  nativeTheme: s,
  require: (e) => window.__OTOOLS_NODER__?.require?.(e),
  screen: i,
  shell: n
}, a = () => o.getCurrentWindow(), W = () => o.getCurrentWebContents(), m = (e) => o.require?.(e);
export {
  r as BrowserWindow,
  d as Menu,
  w as app,
  g as clipboard,
  o as default,
  c as dialog,
  W as getCurrentWebContents,
  a as getCurrentWindow,
  u as nativeImage,
  s as nativeTheme,
  m as require,
  i as screen,
  n as shell
};
//# sourceMappingURL=electron-remote-shim.js.map

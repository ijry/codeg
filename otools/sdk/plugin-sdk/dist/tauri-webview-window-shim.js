import { l, e as u } from "./remote-service-api-event-shim-CD-wuaHi.js";
import { getCurrentWindow as c } from "./tauri-window-shim.js";
const d = "tauri://error";
function h(n) {
  if (typeof window > "u")
    return n;
  try {
    return new URL(n).toString();
  } catch {
    return new URL(n, window.location.href).toString();
  }
}
function s(n) {
  return typeof n == "number" && Number.isFinite(n) ? Math.round(n) : null;
}
function w(n) {
  const i = ["popup=yes"], t = s(n.width), e = s(n.height), r = s(n.x), o = s(n.y);
  return t !== null && i.push(`width=${t}`), e !== null && i.push(`height=${e}`), r !== null && i.push(`left=${r}`), o !== null && i.push(`top=${o}`), n.resizable === !1 && i.push("resizable=no"), i.join(",");
}
class a {
  constructor(i, t = {}) {
    if (this.childWindow = null, this.pendingError = null, this.label = i, typeof window > "u")
      return;
    const e = String(t.url || "").trim();
    if (!e)
      return;
    const r = window.open(
      h(e),
      i,
      w(t)
    );
    if (r) {
      this.childWindow = r, t.focus !== !1 && r.focus();
      return;
    }
    this.pendingError = "Failed to open webview window";
  }
  static async getByLabel(i) {
    return null;
  }
  static async getAll() {
    return [];
  }
  async listen(i, t) {
    if (i === d && this.pendingError) {
      const e = this.pendingError;
      return queueMicrotask(() => {
        t({ event: i, id: -1, payload: e });
      }), () => {
      };
    }
    return l(i, t);
  }
  async once(i, t) {
    let e = null;
    return e = await this.listen(i, async (r) => {
      e && await e(), await t(r);
    }), e;
  }
  async emit(i, t) {
    await u(i, t);
  }
  async close() {
    this.childWindow?.close();
  }
  async hide() {
    this.childWindow?.blur();
  }
  async show() {
    this.childWindow?.focus();
  }
  async setFocus() {
    this.childWindow?.focus();
  }
  async setAlwaysOnTop(i) {
  }
  async setVisibleOnAllWorkspaces(i) {
  }
  async setPosition(i) {
  }
  async setSize(i) {
  }
  async setTitle(i) {
    this.childWindow && (this.childWindow.document.title = i);
  }
  async innerSize() {
    const i = this.childWindow || (typeof window < "u" ? window : null);
    return {
      width: i?.innerWidth ?? 0,
      height: i?.innerHeight ?? 0
    };
  }
  async outerSize() {
    const i = this.childWindow || (typeof window < "u" ? window : null);
    return {
      width: i?.outerWidth ?? 0,
      height: i?.outerHeight ?? 0
    };
  }
}
function p() {
  return c();
}
async function g() {
  return a.getAll();
}
export {
  a as WebviewWindow,
  g as getAllWebviewWindows,
  p as getCurrentWebviewWindow
};
//# sourceMappingURL=tauri-webview-window-shim.js.map

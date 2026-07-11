const d = "__OTOOLS_POPUP_MANAGER__", u = "data-otools-popup-id", l = "data-otools-popup-target";
function f(e) {
  if (typeof window > "u")
    return e;
  try {
    return new URL(e).toString();
  } catch {
    return new URL(e, window.location.href).toString();
  }
}
class w {
  constructor() {
    this.sequence = 0, this.popups = /* @__PURE__ */ new Map();
  }
  open(t, o, a) {
    if (typeof window > "u")
      return;
    const n = `otools-popup-${++this.sequence}`, p = window.document, r = p.createElement("div");
    r.setAttribute(u, n), r.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(15,23,42,0.45)",
      "backdrop-filter:blur(6px)"
    ].join(";");
    const c = p.createElement("div");
    c.style.cssText = [
      "position:relative",
      "display:flex",
      "flex-direction:column",
      "width:min(1120px,100%)",
      "height:min(760px,100%)",
      "overflow:hidden",
      "border-radius:16px",
      "border:1px solid rgba(148,163,184,0.28)",
      "background:#ffffff",
      "box-shadow:0 24px 80px rgba(15,23,42,0.28)"
    ].join(";");
    const s = p.createElement("button");
    s.type = "button", s.textContent = "Close", s.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "z-index:2",
      "border:0",
      "border-radius:999px",
      "padding:8px 12px",
      "background:rgba(15,23,42,0.72)",
      "color:#ffffff",
      "cursor:pointer"
    ].join(";"), s.addEventListener("click", () => {
      this.close(n);
    });
    const i = p.createElement("iframe");
    i.setAttribute(l, o ?? "popup"), i.dataset.otoolsPopupId = n, i.src = f(t), i.style.cssText = [
      "width:100%",
      "height:100%",
      "border:0",
      "background:#ffffff"
    ].join(";"), c.append(s, i), r.append(c), p.body.append(r), this.popups.set(n, { root: r });
  }
  close(t) {
    const o = this.popups.get(t);
    o && (o.root.remove(), this.popups.delete(t));
  }
  closeCurrent() {
    if (typeof window > "u")
      return;
    const t = window.frameElement, o = t instanceof HTMLIFrameElement ? t.dataset.otoolsPopupId : null;
    if (o && window.parent !== window) {
      window.parent[d]?.close(o);
      return;
    }
    const a = Array.from(this.popups.keys()), n = a[a.length - 1];
    n && this.close(n);
  }
}
function x() {
  const e = window;
  return e[d] || (e[d] = new w()), e[d];
}
export {
  x as ensurePopupManager
};
//# sourceMappingURL=popup-manager.js.map

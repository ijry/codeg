function r() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
async function i(o, e) {
  const n = String(o ?? "").trim();
  if (!n)
    return;
  const t = r();
  if (t?.shellOpen) {
    await t.shellOpen(n, e);
    return;
  }
  if (t?.shellOpenExternal && /^https?:\/\//i.test(n)) {
    t.shellOpenExternal(n);
    return;
  }
  if (t?.shellOpenPath) {
    t.shellOpenPath(n);
    return;
  }
  typeof window < "u" && window.open(n, "_blank", "noopener,noreferrer");
}
async function l(o) {
  const e = String(o ?? "").trim();
  if (!e)
    return;
  const n = r();
  if (n?.shellOpenPath) {
    n.shellOpenPath(e);
    return;
  }
}
async function s(o) {
  const e = String(o ?? "").trim();
  if (!e)
    return;
  const n = r();
  if (n?.shellOpenExternal) {
    n.shellOpenExternal(e);
    return;
  }
  typeof window < "u" && window.open(e, "_blank", "noopener,noreferrer");
}
export {
  i as open,
  s as openExternal,
  l as openPath
};
//# sourceMappingURL=tauri-plugin-shell-shim.js.map

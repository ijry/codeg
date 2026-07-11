import { i as r } from "./remote-service-api-event-shim-CD-wuaHi.js";
const l = (t) => {
  if (typeof t == "string") {
    const n = t.trim();
    return n || null;
  }
  if (t && typeof t == "object" && "path" in t) {
    const n = t.path;
    if (typeof n == "string") {
      const i = n.trim();
      return i || null;
    }
  }
  return null;
}, u = (t) => {
  if (Array.isArray(t))
    return t.map((i) => l(i)).filter((i) => !!i);
  const n = l(t);
  return n ? [n] : [];
}, o = (t, n) => {
  const i = u(t);
  return n.multiple ? i.length ? i : null : i[0] ?? null;
};
function e() {
  if (typeof window > "u")
    return;
  const t = window.otools ?? window.utools;
  return t?.dialog ?? t?.runtime?.dialog ?? void 0;
}
async function c(t) {
  try {
    const n = await r("plugin:dialog|open", {
      options: t
    });
    return o(n, t);
  } catch {
    return null;
  }
}
async function f(t) {
  try {
    const n = await r("plugin:dialog|save", { options: t });
    return l(n);
  } catch {
    return null;
  }
}
async function s(t = {}) {
  const n = t ?? {}, i = e();
  if (i?.open)
    return o(
      await i.open(n),
      n
    );
  const a = await c(n);
  return a !== null ? a : null;
}
async function g(t = {}) {
  const n = e();
  if (n?.save)
    return l(await n.save(t));
  const i = await f(t);
  return i !== null ? i : null;
}
async function y(t, n) {
  const i = e();
  if (i?.message) {
    await i.message(t, n);
    return;
  }
  try {
    await r("plugin:dialog|message", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      okButtonLabel: typeof n == "string" ? void 0 : n?.okLabel ?? n?.buttons?.ok
    });
    return;
  } catch {
  }
  typeof window < "u" && window.alert(t);
}
async function w(t, n) {
  const i = e();
  if (i?.confirm)
    return i.confirm(t, n);
  try {
    return !!await r("plugin:dialog|confirm", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      okButtonLabel: typeof n == "string" ? void 0 : n?.okLabel,
      cancelButtonLabel: typeof n == "string" ? void 0 : n?.cancelLabel
    });
  } catch {
  }
  return typeof window > "u" ? !1 : window.confirm(t);
}
async function k(t, n) {
  const i = e();
  if (i?.ask)
    return i.ask(t, n);
  try {
    return !!await r("plugin:dialog|ask", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      yesButtonLabel: typeof n == "string" ? void 0 : n?.okLabel,
      noButtonLabel: typeof n == "string" ? void 0 : n?.cancelLabel
    });
  } catch {
  }
  return typeof window > "u" ? !1 : window.confirm(t);
}
export {
  k as ask,
  w as confirm,
  y as message,
  s as open,
  g as save
};
//# sourceMappingURL=tauri-plugin-dialog-shim.js.map

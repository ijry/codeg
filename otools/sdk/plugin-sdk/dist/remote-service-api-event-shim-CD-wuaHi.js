import { listenNativeTopic as m, attachTransformListener as P, detachTransformListener as I } from "./native-event-bridge.js";
import { ensurePopupManager as b } from "./popup-manager.js";
const L = "otools:", A = "otools-tauri:", R = { kind: "Any" }, U = /* @__PURE__ */ new Set([
  "set_window_theme",
  "update_tray_menu"
]), O = /* @__PURE__ */ new Set([
  "open_commit_window",
  "open_merge_window",
  "open_settings_window",
  "open_stash_window",
  "open_push_window",
  "open_project_boot_window"
]), a = () => typeof window < "u", p = (n) => n.startsWith("plugin:"), f = (n) => {
  const t = String(n ?? "").trim();
  if (!t)
    return "";
  const e = t.lastIndexOf(":");
  if (e <= 0 || e >= t.length - 1)
    return t;
  const i = t.slice(0, e).trim().toLowerCase(), r = t.slice(e + 1).trim();
  return r && (i === "builtin" || i === "market" || i === "dev-debug" || i === "dev-workspace") ? r : t;
}, C = (n) => {
  const t = [], e = String(n ?? "");
  if (e && t.push(e), n && typeof n == "object") {
    const o = n, s = String(o.message ?? ""), u = String(o.code ?? ""), c = String(o.detail ?? "");
    s && t.push(s), u && t.push(u), c && t.push(c);
  }
  const i = t.join(" | ");
  if (!i)
    return !1;
  const r = i.toLowerCase();
  return r.includes("not allowed") || r.includes("command not found") || r.includes("unknown method") || r.includes("unknown command");
}, l = () => {
  if (a())
    for (const n of y()) {
      const t = n.otools ?? n.utools;
      if (t)
        return t;
    }
}, N = () => typeof l()?.invokeNative == "function", y = () => {
  if (!a())
    return [];
  const n = [
    window
  ];
  for (const t of [() => window.parent, () => window.top])
    try {
      const e = t();
      if (!e || e === window || n.includes(e))
        continue;
      n.push(e);
    } catch {
    }
  return n;
}, E = () => {
  if (!a())
    return !1;
  try {
    const n = window.__OToolsEnv;
    if (typeof n?.pluginUuid == "string" && n.pluginUuid.trim())
      return !0;
    const t = new URLSearchParams(window.location.search || "");
    return !!(t.get("plugin") || t.get("pluginUuid") || t.get("plugin_uuid"));
  } catch {
    return !1;
  }
}, d = async (n = 1200) => {
  if (!a())
    return;
  const t = Date.now() + n;
  for (; Date.now() <= t; ) {
    for (const e of y()) {
      const i = e.otools ?? e.utools;
      if (typeof i?.invokeNative == "function" || typeof i?.invokeNativePlugin == "function")
        return i;
    }
    await new Promise((e) => {
      window.setTimeout(e, 20);
    });
  }
  return l();
}, g = (n) => {
  const t = f(n?.getPluginUuid?.());
  if (t)
    return t;
  if (!a())
    return "";
  try {
    const e = window.__OToolsEnv, i = f(e?.pluginUuid);
    if (i)
      return i;
    const r = new URLSearchParams(window.location.search || "");
    return f(
      r.get("plugin") || r.get("pluginUuid") || r.get("plugin_uuid") || ""
    );
  } catch {
    return "";
  }
}, k = () => {
  if (a())
    return window.__TAURI_INTERNALS__;
}, S = (n) => `${L}${n}`, w = (n) => `${A}${n}`, h = (n, t) => {
  a() && window.dispatchEvent(
    new CustomEvent(S(n), {
      detail: { payload: t }
    })
  );
}, x = (n, t) => {
  a() && window.dispatchEvent(
    new CustomEvent(w(n), {
      detail: { payload: t }
    })
  );
}, v = (n) => !n || typeof n != "object" || Array.isArray(n) ? null : n, j = (n, t, e) => {
  const i = v(t);
  n === "switch_provider" && i?.app && i?.id && h("provider-switched", {
    appType: i.app,
    providerId: i.id,
    source: "native-plugin",
    result: e
  }), n === "sync_universal_provider" && i?.id && h("universal-provider-synced", {
    id: i.id,
    result: e
  });
}, _ = async (n, t) => {
  const e = k();
  if (!e?.invoke)
    throw new Error("Tauri runtime is unavailable");
  return e.invoke(
    n,
    t
  );
}, D = (n) => n && typeof n == "object" && "payload" in n ? n.payload ?? null : n;
async function F(n, t) {
  const e = k();
  if (!e?.invoke || !e.transformCallback)
    throw new Error("Tauri event runtime is unavailable");
  const i = e.transformCallback((o) => {
    t({
      event: n,
      id: -1,
      payload: D(o)
    });
  }, !1), r = await e.invoke("plugin:event|listen", {
    event: n,
    target: R,
    handler: i
  });
  return async () => {
    try {
      await window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener?.(
        n,
        r
      );
    } catch {
    }
    e.unregisterCallback?.(i), await e.invoke("plugin:event|unlisten", {
      event: n,
      eventId: r
    });
  };
}
async function V(n, t) {
  let e = l();
  const i = E();
  if (!N() && i && (e = await d()), typeof e?.invokeNative != "function") {
    const o = g(e);
    if (o && typeof e?.invokeNativePlugin == "function")
      return e.invokeNativePlugin(o, n, t ?? null);
    try {
      return await _(n, t);
    } catch (s) {
      if (!i || p(n) || !C(s))
        throw s;
      const u = await d(), c = g(u);
      if (c && typeof u?.invokeNativePlugin == "function")
        return u.invokeNativePlugin(c, n, t ?? null);
      if (typeof u?.invokeNative != "function")
        throw s;
      return u.invokeNative(n, t ?? null);
    }
  }
  if (n === "get_init_error")
    return null;
  if (U.has(n))
    return !0;
  if (n === "plugin:event|listen") {
    const o = v(t), s = typeof o?.event == "string" ? o.event : "", u = typeof o?.handler == "number" ? o.handler : NaN;
    if (!s || Number.isNaN(u))
      throw new Error("plugin:event|listen requires event and handler");
    return await P(s, u);
  }
  if (n === "plugin:event|unlisten") {
    const o = v(t), s = typeof o?.eventId == "number" ? o.eventId : NaN;
    Number.isNaN(s) || await I(s);
    return;
  }
  if (p(n))
    return _(n, t);
  if (O.has(n)) {
    const o = await e.invokeNative(
      n,
      t ?? null
    ), s = typeof o?.path == "string" ? o.path : null;
    if (s) {
      b().open(s, n, t);
      return;
    }
    return o;
  }
  const r = await e.invokeNative(n, t ?? null);
  return j(n, t, r), r;
}
async function M(n, t) {
  let e = l();
  const i = E();
  if (!N() && i && (e = await d()), typeof e?.invokeNative != "function")
    return F(n, t);
  const r = (s) => {
    const u = s.detail;
    t({
      event: n,
      id: -1,
      payload: u?.payload ?? null
    });
  };
  window.addEventListener(w(n), r);
  const o = await m(n, async (s) => {
    await t({
      event: n,
      id: -1,
      payload: s
    });
  });
  return async () => {
    await o(), window.removeEventListener(
      w(n),
      r
    );
  };
}
async function z(n, t) {
  x(n, t ?? null);
}
async function B(n, t) {
  let e = null;
  return e = await M(n, async (i) => {
    e && await e(), await t(i);
  }), e;
}
function T(n) {
  return n.shell ?? n.runtime?.shell ?? void 0;
}
function G(n) {
  const t = l();
  if (!t)
    return !1;
  const e = T(t);
  return typeof e?.openExternal == "function" ? (e.openExternal(n), !0) : (t.shellOpenExternal(n), !0);
}
function W(n) {
  const t = l();
  if (!t)
    return !1;
  const e = T(t);
  return typeof e?.openPath == "function" ? (e.openPath(n), !0) : (t.shellOpenPath(n), !0);
}
export {
  N as a,
  G as b,
  W as c,
  z as e,
  l as g,
  V as i,
  M as l,
  B as o
};
//# sourceMappingURL=remote-service-api-event-shim-CD-wuaHi.js.map

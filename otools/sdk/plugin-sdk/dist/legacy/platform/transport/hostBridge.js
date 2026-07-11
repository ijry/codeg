import { normalizeLocalFilePath as c, isLocalFilePath as l, buildRemoteFileUrl as u } from "../../../remote-service-compat-file-shim.js";
import { i as f, e as d, l as _, o as v } from "../../../remote-service-api-event-shim-CD-wuaHi.js";
const w = (e = !1) => {
  if (typeof window > "u")
    return [];
  const t = [
    window
  ];
  if (!e)
    return t;
  for (const n of [() => window.parent, () => window.top])
    try {
      const i = n();
      if (!i || i === window || t.includes(i))
        continue;
      t.push(i);
    } catch {
    }
  return t;
}, o = (e = {}) => {
  for (const t of w(e.includeAncestors)) {
    const n = t?.__TAURI_INTERNALS__;
    if (!(!n || typeof n.invoke != "function"))
      return {
        invoke: n.invoke.bind(n),
        convertFileSrc: typeof n.convertFileSrc == "function" ? n.convertFileSrc.bind(n) : void 0,
        transformCallback: typeof n.transformCallback == "function" ? n.transformCallback.bind(n) : void 0,
        unregisterCallback: typeof n.unregisterCallback == "function" ? n.unregisterCallback.bind(n) : void 0,
        unregisterListener: typeof t?.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener == "function" ? t.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener.bind(
          t.__TAURI_EVENT_PLUGIN_INTERNALS__
        ) : void 0
      };
  }
  return null;
}, a = (e = {}) => typeof o(e)?.invoke == "function", k = () => a({ includeAncestors: !0 }) ? !1 : typeof window < "u" && (window.__TAURI_REMOTE_SERVICE__ === !0 || window.__OTOOLS_REMOTE_SERVICE__ === !0), R = (e = {}) => a(e) || k(), b = (e) => typeof e == "string" ? { kind: "AnyLabel", label: e } : e ?? { kind: "Any" }, s = async (e, t, n, i = {}) => {
  const r = o(i);
  return r?.invoke ? r.invoke(e, t, n) : f(e, t);
}, L = (e, t = "asset", n = {}) => {
  const i = c(e);
  if (!l(i))
    return e;
  const r = o(n);
  return r?.convertFileSrc ? r.convertFileSrc(i, t) : u(i);
}, E = (e, t = !1, n = {}) => {
  const i = o(n);
  if (typeof i?.transformCallback != "function")
    throw new Error("Tauri transformCallback is unavailable");
  return i.transformCallback(e, t);
}, C = (e, t = {}) => {
  o(t)?.unregisterCallback?.(e);
}, m = async (e, t, n = {}) => {
  o(n)?.unregisterListener?.(e, t), await s(
    "plugin:event|unlisten",
    {
      event: e,
      eventId: t
    },
    void 0,
    n
  );
}, y = async (e, t, n = {}) => {
  if (!a(n))
    return _(e, t);
  const i = E(t, !1, n), r = await s(
    "plugin:event|listen",
    {
      event: e,
      target: b(n.target),
      handler: i
    },
    void 0,
    n
  );
  return async () => {
    C(i, n), await m(e, r, n);
  };
}, I = async (e, t, n = {}) => {
  if (!a(n))
    return v(e, t);
  const i = await y(
    e,
    async (r) => {
      await i(), t(r);
    },
    n
  );
  return i;
}, S = async (e, t, n = {}) => {
  if (!a(n)) {
    await d(e, t);
    return;
  }
  await s(
    "plugin:event|emit",
    {
      event: e,
      payload: t
    },
    void 0,
    n
  );
};
export {
  E as createNativeCallbackChannel,
  R as hasHostBridgeRuntime,
  L as hostConvertFileSrc,
  S as hostEmit,
  s as hostInvoke,
  y as hostListen,
  I as hostOnce,
  a as isNativeTauriRuntime,
  k as isRemoteServiceRuntime,
  o as resolveNativeTauriContext,
  C as unregisterNativeCallbackChannel,
  m as unregisterNativeEventListener
};
//# sourceMappingURL=hostBridge.js.map

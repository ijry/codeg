const u = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
let g = 0, f = 0, o = null;
function y() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
function b(t) {
  const n = t && typeof t == "object" && "payload" in t ? t.payload : t;
  if (!n || typeof n != "object")
    return null;
  const e = n.topic;
  if (typeof e != "string" || !e)
    return null;
  const i = n.pluginUuid ?? n.plugin_uuid ?? n.uuid;
  return {
    pluginUuid: typeof i == "string" && i.trim() ? i.trim() : void 0,
    topic: e,
    payload: n.payload ?? null
  };
}
function m(t) {
  const n = s.get(t.topic);
  if (n)
    for (const i of n.values())
      i(t.payload);
  if (!t.pluginUuid)
    return;
  const e = s.get(
    `otools-native:${t.pluginUuid}`
  );
  if (e)
    for (const i of e.values())
      i({
        topic: t.topic,
        payload: t.payload
      });
}
async function p() {
  if (o)
    return o;
  const t = y();
  return t?.listenNative ? (o = t.listenNative((n) => {
    const e = b(n);
    e && m(e);
  }), o) : (o = Promise.resolve(async () => {
  }), o);
}
async function _() {
  if (s.size > 0 || !o)
    return;
  const t = await o;
  o = null, await t();
}
function v(t) {
  const n = r.get(t) ?? 0;
  r.set(t, n + 1);
}
function N(t) {
  const n = r.get(t);
  if (!n || n <= 1) {
    r.delete(t), u.delete(t);
    return;
  }
  r.set(t, n - 1);
}
function l() {
  if (typeof window > "u" || typeof window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener == "function")
    return;
  const n = {
    unregisterListener(e, i) {
      d(i);
    }
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = n;
}
function L(t, n = !1) {
  l();
  const e = ++g;
  return u.set(e, { callback: t, once: n }), e;
}
async function T(t, n) {
  l();
  const e = ++f, i = s.get(t) ?? /* @__PURE__ */ new Map();
  return i.set(e, (w) => {
    const a = u.get(n);
    a && (a.callback({ payload: w }), a.once && (u.delete(n), r.delete(n)));
  }), s.set(t, i), c.set(e, { topic: t, handlerId: n }), v(n), await p(), e;
}
async function d(t) {
  const n = c.get(t);
  if (!n)
    return;
  c.delete(t);
  const e = s.get(n.topic);
  e?.delete(t), e && e.size === 0 && s.delete(n.topic), typeof n.handlerId == "number" && N(n.handlerId), await _();
}
async function k(t, n) {
  l();
  const e = ++f, i = s.get(t) ?? /* @__PURE__ */ new Map();
  return i.set(e, n), s.set(t, i), c.set(e, { topic: t }), await p(), async () => {
    await d(e);
  };
}
export {
  T as attachTransformListener,
  d as detachTransformListener,
  k as listenNativeTopic,
  L as registerTransformCallback
};
//# sourceMappingURL=native-event-bridge.js.map

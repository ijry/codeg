const y = "codeg-events", h = "codeg-token.";
function w() {
  return {
    ws: null,
    reconnectTimer: null,
    manuallyClosed: !1,
    connectionState: "idle",
    nextListenerId: 1,
    handlersByPlugin: /* @__PURE__ */ new Map()
  };
}
function m(n) {
  const o = new TextEncoder().encode(n);
  let i = "";
  for (const d of o)
    i += String.fromCharCode(d);
  return btoa(i).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function C(n) {
  const o = String(n || "").trim();
  return o ? [
    y,
    `${h}${m(o)}`
  ] : [y];
}
function b(n) {
  if (!n || typeof n != "object")
    return "";
  const o = n.channel;
  return typeof o == "string" ? o : "";
}
function p(n) {
  return !n || typeof n != "object" ? null : n.payload ?? null;
}
function O({
  wsUrl: n,
  token: o,
  WebSocketImpl: i = globalThis.WebSocket,
  acquire: d,
  release: S
}) {
  if (typeof i != "function")
    throw new Error("WebSocket is unavailable");
  const e = w(), g = () => {
    const s = e.ws;
    s && (s.readyState === 0 || s.readyState === 1) || (e.connectionState = "connecting", e.ws = new i(n, C(o)), e.ws.onopen = () => {
      e.connectionState = "open";
    }, e.ws.onmessage = (a) => {
      const f = JSON.parse(String(a.data)), t = b(f);
      if (!t.startsWith("otools-native:"))
        return;
      const r = t.slice(14), u = e.handlersByPlugin.get(r);
      if (!u)
        return;
      const c = p(f);
      for (const l of u.values())
        l({
          payload: {
            ...c && typeof c == "object" ? c : { payload: c },
            pluginUuid: r
          }
        });
    }, e.ws.onclose = () => {
      e.connectionState = "closed", e.ws = null, e.manuallyClosed || (e.reconnectTimer = setTimeout(() => {
        g();
      }, 1e3));
    });
  };
  return {
    async listen(s, a, f) {
      const t = String(s || "").trim();
      if (!t)
        throw new Error("pluginUuid is required");
      if (typeof a != "function")
        throw new Error("handler must be a function");
      let r = e.handlersByPlugin.get(t);
      const u = !r;
      r || (r = /* @__PURE__ */ new Map(), e.handlersByPlugin.set(t, r));
      const c = e.nextListenerId++;
      return r.set(c, a), u && await d?.(t), g(), async () => {
        const l = e.handlersByPlugin.get(t);
        l && (l.delete(c), l.size === 0 && (e.handlersByPlugin.delete(t), await S?.(t)));
      };
    },
    close() {
      e.manuallyClosed = !0, e.reconnectTimer && (clearTimeout(e.reconnectTimer), e.reconnectTimer = null), e.ws && e.ws.close();
    },
    getConnectionState() {
      return e.connectionState;
    }
  };
}
export {
  O as createOtoolsNativeEventClient
};
//# sourceMappingURL=remote-service-otools-web-ws-shim.js.map

import { createOtoolsNativeEventClient as m } from "./remote-service-otools-web-ws-shim.js";
function g() {
  return typeof window < "u" ? window : globalThis;
}
function w(t = "") {
  return t.trim().replace(/\/+$/, "");
}
function h(t) {
  const i = String(t.token || "").trim();
  if (i)
    return i;
  try {
    return localStorage.getItem("codeg_token") || "";
  } catch {
    return "";
  }
}
function v(t) {
  if (t.wsUrl?.trim())
    return t.wsUrl.trim();
  const a = w(t.baseUrl) || (typeof window < "u" ? window.location.origin : "http://127.0.0.1"), s = new URL("/ws", a);
  return s.protocol = s.protocol === "https:" ? "wss:" : "ws:", s.toString();
}
function f(t) {
  if (typeof t == "string")
    return t.trim() || null;
  if (t && typeof t == "object") {
    const i = t.path;
    return typeof i == "string" && i.trim() || null;
  }
  return null;
}
function y(t) {
  if (Array.isArray(t))
    return t.map((a) => f(a)).filter((a) => !!a);
  const i = f(t);
  return i ? [i] : [];
}
function b({
  baseUrl: t = "",
  token: i,
  fetchImpl: a = globalThis.fetch
}) {
  if (typeof a != "function")
    throw new Error("fetch is unavailable");
  const s = w(t), l = i || h({ token: i });
  return async (u, p) => {
    const c = await a(`${s}${u}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...l ? { Authorization: `Bearer ${l}` } : {}
      },
      body: JSON.stringify(p ?? {})
    }), _ = await c.text(), o = _ ? JSON.parse(_) : null;
    if (!c.ok)
      throw o || new Error(`Request failed: ${u}`);
    if (o && typeof o == "object" && "ok" in o && o.ok === !1) {
      const e = o.error;
      throw new Error(e?.message || `Request failed: ${u}`);
    }
    return o && typeof o == "object" && "ok" in o && "data" in o ? o.data : o;
  };
}
function P(t) {
  const i = t.postJson || b(t), a = h(t), s = String(t.pluginUuid || "").trim(), l = (e, n) => i(`/api/${e}`, n), u = (e) => String(e || s).trim(), p = t.eventClient || m({
    wsUrl: v(t),
    token: a,
    WebSocketImpl: t.WebSocketImpl,
    acquire: (e) => l("native_plugin_listen_acquire", { uuid: e }),
    release: (e) => l("native_plugin_listen_release", { uuid: e })
  }), c = (e, n, r) => l("native_plugin_invoke", {
    uuid: u(e),
    method: n,
    payload: r ?? null
  }), _ = {
    async open(e = {}) {
      if (e.directory) {
        const d = await l("tools_webview_pick_folder", {
          options: {
            directory: e.defaultPath,
            title: e.title
          }
        });
        return f(d);
      }
      const n = await l("tools_webview_pick_files", {
        options: {
          directory: e.defaultPath,
          filters: e.filters,
          multiple: e.multiple,
          title: e.title
        }
      }), r = y(n);
      return e.multiple ? r : r[0] || null;
    },
    async save(e = {}) {
      const n = await l("tools_webview_pick_save_path", {
        options: {
          directory: e.defaultPath,
          filters: e.filters,
          title: e.title
        }
      });
      return f(n);
    },
    async message(e) {
      typeof window < "u" && window.alert(e);
    },
    async confirm(e) {
      return typeof window < "u" ? window.confirm(e) : !1;
    },
    async ask(e) {
      return typeof window < "u" ? window.confirm(e) : !1;
    }
  }, o = {
    openExternal: (e) => l("otools_shell_open_external", { url: e }),
    openPath: (e) => l("otools_shell_open_path", { path: e }),
    showItemInFolder: (e) => l("otools_shell_show_item_in_folder", { path: e })
  };
  return {
    isDev: () => !!t.isDev,
    isMacOS: () => t.platform === "macos",
    isWindows: () => t.platform === "windows",
    isLinux: () => t.platform === "linux",
    getAppName: () => t.appName || "Codeg OTools",
    getAppVersion: () => t.appVersion || "",
    getPluginUuid: () => s,
    invokeNative: (e, n) => c(s, e, n),
    invokeNativeRaw: (e, n) => c(s, e, n),
    invokeNativePlugin: (e, n, r) => c(e, n, r),
    invokeNativePluginRaw: (e, n, r) => c(e, n, r),
    probeNative: () => l("native_plugin_probe", { uuid: s }),
    probeNativePlugin: (e) => l("native_plugin_probe", { uuid: e }),
    reloadNative: () => l("native_plugin_reload", { uuid: s }),
    reloadNativePlugin: (e) => l("native_plugin_reload", { uuid: e }),
    listenNative: (e, n) => p.listen(s, e, n),
    listenNativePlugin: (e, n, r) => p.listen(e, n, r),
    getPluginLocalState: (e, n) => l("get_otools_plugin_localstate_with_scheme", {
      plugin: u(e),
      scheme: n ?? null
    }),
    savePluginLocalState: (e, n, r) => l("save_otools_plugin_localstate_with_scheme", {
      plugin: u(e),
      scheme: r ?? null,
      state: n
    }),
    getPluginLocalStateValue: (e, n, r) => l("get_otools_plugin_localstate_value_with_scheme", {
      plugin: u(e),
      scheme: r ?? null,
      key: n
    }),
    savePluginLocalStateValue: (e, n, r, d) => l("save_otools_plugin_localstate_value_with_scheme", {
      plugin: u(e),
      scheme: d ?? null,
      key: n,
      value: r
    }),
    patchPluginLocalState: (e, n, r) => l("patch_otools_plugin_localstate_with_scheme", {
      plugin: u(e),
      scheme: r ?? null,
      patch: n ?? {}
    }),
    shellOpenExternal: (e) => {
      o.openExternal(e);
    },
    shellOpenPath: (e) => {
      o.openPath(e);
    },
    shellShowItemInFolder: (e) => {
      o.showItemInFolder(e);
    },
    dialog: _,
    runtime: { dialog: _, shell: o },
    shell: o
  };
}
function S(t) {
  const i = P(t), a = g();
  return a.__OToolsEnv = {
    ...a.__OToolsEnv || {},
    runtime: "web",
    pluginUuid: t.pluginUuid,
    appName: t.appName,
    appVersion: t.appVersion,
    platform: t.platform,
    isDev: !!t.isDev
  }, a.__OTOOLS_REMOTE_SERVICE__ = !0, a.__TAURI_REMOTE_SERVICE__ = !0, a.otools = i, a.utools = i, i;
}
export {
  P as createOtoolsWebFacade,
  S as installOtoolsWebRuntime
};
//# sourceMappingURL=remote-service-otools-web-shim.js.map

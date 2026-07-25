import { createOtoolsNativeEventClient as Oe } from "./remote-service-otools-web-ws-shim.js";
function he() {
  return typeof window < "u" ? window : globalThis;
}
function ne(o = "") {
  return o.trim().replace(/\/+$/, "");
}
function te(o) {
  const i = String(o ?? "").trim();
  if (!i)
    return "";
  const a = i.lastIndexOf(":");
  if (a <= 0 || a >= i.length - 1)
    return i;
  const c = i.slice(0, a).trim().toLowerCase(), f = i.slice(a + 1).trim();
  return f && (c === "builtin" || c === "market" || c === "dev-debug" || c === "dev-workspace") ? f : i;
}
function De(o) {
  const i = String(o || "").trim().toLowerCase();
  return i.includes("win") ? "windows" : i.includes("mac") || i === "darwin" ? "macos" : i.includes("linux") ? "linux" : "unknown";
}
function d(o) {
  return o && typeof o == "object" && !Array.isArray(o) ? o : {};
}
function Fe(o) {
  const i = d(o);
  return te(
    i.uuid ?? i.pluginUuid ?? i.plugin_uuid ?? i.plugin
  );
}
function ye(o) {
  const i = String(o.token || "").trim();
  if (i)
    return i;
  try {
    return localStorage.getItem("codeg_token") || "";
  } catch {
    return "";
  }
}
function Re(o) {
  if (o.wsUrl?.trim())
    return o.wsUrl.trim();
  const a = ne(o.baseUrl) || (typeof window < "u" ? window.location.origin : "http://127.0.0.1"), c = new URL("/ws/events", a);
  return c.protocol = c.protocol === "https:" ? "wss:" : "ws:", c.toString();
}
function V(o) {
  if (typeof o == "string")
    return o.trim() || null;
  if (o && typeof o == "object") {
    const i = o.path;
    return typeof i == "string" && i.trim() || null;
  }
  return null;
}
function Be(o) {
  if (Array.isArray(o))
    return o.map((a) => V(a)).filter((a) => !!a);
  const i = V(o);
  return i ? [i] : [];
}
function ee(o) {
  if (Array.isArray(o))
    return o.map((a) => String(a || "").trim()).filter(Boolean);
  const i = String(o || "").trim();
  return i ? [i] : [];
}
function Le(o) {
  return Array.isArray(o) ? o.map((i) => String(i || "").trim()).filter(Boolean) : [];
}
function Me() {
  try {
    return typeof localStorage < "u" ? localStorage : null;
  } catch {
    return null;
  }
}
function $e(o) {
  try {
    return JSON.stringify({ value: o });
  } catch {
    return JSON.stringify({ value: String(o ?? "") });
  }
}
function qe(o) {
  if (o === null)
    return null;
  try {
    const i = JSON.parse(o);
    return i && typeof i == "object" && "value" in i ? i.value ?? null : i;
  } catch {
    return o;
  }
}
function me(o) {
  if (!o)
    return null;
  try {
    return JSON.parse(o);
  } catch {
    return o;
  }
}
function j(o, i) {
  const a = d(o);
  return Object.keys(a).length ? {
    ...a,
    code: String(a.code ?? a.cmd ?? a.featureCode ?? "").trim(),
    type: String(a.type ?? ""),
    payload: "payload" in a ? a.payload : null,
    option: "option" in a ? a.option : null
  } : { ...i };
}
function je(o) {
  const i = d(o);
  return "text" in i ? String(i.text ?? "") : "value" in i ? String(i.value ?? "") : String(o ?? "");
}
function Ve(o) {
  const i = d(o), a = "image" in i ? i.image : o, c = d(a);
  if (typeof a == "string") {
    const f = a.trim();
    return f ? f.startsWith("data:") ? f : `data:image/png;base64,${f}` : "";
  }
  return typeof c.dataUrl == "string" ? c.dataUrl : typeof c.dataBase64 == "string" ? `data:${typeof c.mime == "string" ? c.mime : "image/png"};base64,${c.dataBase64}` : "";
}
function He({
  baseUrl: o = "",
  token: i,
  fetchImpl: a = globalThis.fetch
}) {
  if (typeof a != "function")
    throw new Error("fetch is unavailable");
  const c = ne(o), f = i || ye({ token: i });
  return async (y, g) => {
    const N = await a(`${c}${y}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...f ? { Authorization: `Bearer ${f}` } : {}
      },
      body: JSON.stringify(g ?? {})
    }), b = await N.text(), p = b ? JSON.parse(b) : null;
    if (!N.ok)
      throw p || new Error(`Request failed: ${y}`);
    if (p && typeof p == "object" && "ok" in p && p.ok === !1) {
      const T = p.error;
      throw new Error(T?.message || `Request failed: ${y}`);
    }
    return p && typeof p == "object" && "ok" in p && "data" in p ? p.data : p;
  };
}
function ze(o) {
  const i = o.postJson || He(o), a = ye(o), c = De(o.platform), f = o.appName || "Codeg OTools", y = o.appVersion || "", g = te(o.pluginUuid), N = o.paths && typeof o.paths == "object" ? o.paths : {}, b = Array.isArray(o.pluginPermissions), p = b ? o.pluginPermissions.map((e) => String(e || "").trim()).filter(Boolean) : [], T = new Set(p.map((e) => e.toLowerCase())), we = (e) => {
    const t = String(e || "").trim().toLowerCase();
    return !t || !b || T.has(t) || T.has("*");
  }, U = {
    runtime: "web",
    appName: f,
    appVersion: y,
    nativeId: String(o.nativeId || g),
    pluginUuid: g,
    ...b ? { pluginPermissions: p } : {},
    platform: c,
    isDev: !!o.isDev,
    currentFolderPath: String(o.currentFolderPath || "").trim(),
    currentBrowserUrl: String(o.currentBrowserUrl || "").trim() || (typeof window < "u" ? window.location.href : ""),
    paths: N,
    noderBridgeAuthToken: a,
    noderBridgeBaseUrl: ne(o.baseUrl)
  }, u = he(), w = Array.isArray(u.__OToolsCopiedFiles) ? u.__OToolsCopiedFiles : [];
  u.__OToolsCopiedFiles = w;
  const O = u.__OToolsFileIconCache && typeof u.__OToolsFileIconCache == "object" ? u.__OToolsFileIconCache : {};
  u.__OToolsFileIconCache = O;
  const A = () => u.__OTOOLS_NODER__ && typeof u.__OTOOLS_NODER__ == "object" ? u.__OTOOLS_NODER__ : null, ve = () => {
    const t = A()?.getSdkModules?.()?.runtime;
    return Array.isArray(t?.builtinModules) ? [...t.builtinModules] : [];
  }, H = (e) => {
    const t = A()?.require;
    if (typeof t == "function")
      return t(e);
    throw new Error(
      `Node require is unavailable in the codeg-plus OTools web runtime: ${String(
        e || ""
      )}`
    );
  };
  Object.assign(H, {
    resolve: (e) => {
      const t = A()?.require;
      return typeof t?.resolve == "function" ? t.resolve(e) : String(e || "");
    },
    cache: {}
  });
  const Se = (e) => {
    const t = A()?.createRequire;
    return typeof t == "function" ? t(e) : H;
  }, r = (e, t) => i(`/api/${e}`, t), _ = (e) => te(e || g), v = (e, t) => {
    typeof u.dispatchEvent != "function" || typeof CustomEvent != "function" || u.dispatchEvent(new CustomEvent(e, { detail: t }));
  }, z = (e) => {
    if (typeof queueMicrotask == "function") {
      queueMicrotask(e);
      return;
    }
    setTimeout(e, 0);
  }, P = Me(), J = g || "anonymous", E = `otools:${J}:dbStorage:`, D = `otools:${J}:db:`, I = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map(), R = (e, t) => {
    const n = new Set(t.keys());
    if (P)
      for (let s = 0; s < P.length; s += 1) {
        const l = P.key(s);
        l?.startsWith(e) && n.add(l.slice(e.length));
      }
    return [...n].sort();
  }, oe = (e, t, n) => {
    const s = String(n ?? "");
    if (t.has(s))
      return t.get(s) ?? null;
    const l = P?.getItem(`${e}${s}`) ?? null, m = qe(l);
    return l !== null && t.set(s, m), m;
  }, re = (e, t, n, s) => {
    const l = String(n ?? "");
    t.set(l, s), P?.setItem(
      `${e}${l}`,
      $e(s)
    );
  }, ie = (e, t, n) => {
    const s = String(n ?? "");
    t.delete(s), P?.removeItem(`${e}${s}`);
  }, be = (e, t) => {
    for (const n of R(e, t))
      P?.removeItem(`${e}${n}`);
    t.clear();
  }, se = (e, t) => {
    g && r("save_otools_plugin_localstate_value_with_scheme", {
      plugin: g,
      scheme: "dbStorage",
      key: e,
      value: t
    }).catch(() => {
    });
  }, Pe = {
    get length() {
      return R(E, I).length;
    },
    key(e) {
      return R(E, I)[e] ?? null;
    },
    getItem(e) {
      return oe(E, I, e);
    },
    setItem(e, t) {
      const n = String(e ?? "");
      re(E, I, n, t), se(n, t);
    },
    removeItem(e) {
      const t = String(e ?? "");
      ie(E, I, t), se(t, null);
    },
    clear() {
      be(E, I), g && r("save_otools_plugin_localstate_with_scheme", {
        plugin: g,
        scheme: "dbStorage",
        state: {}
      }).catch(() => {
      });
    }
  }, ke = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, W = (e) => oe(D, F, String(e ?? "")), K = (e) => {
    const t = d(e), n = String(t._id || t.id || ke()), s = `${Date.now()}-${Math.random().toString(36).slice(2)}`, l = {
      ...t,
      _id: n,
      _rev: s
    };
    return re(D, F, n, l), { ok: !0, id: n, rev: s };
  }, Ce = (e) => {
    const t = d(e), n = String(
      typeof e == "string" ? e : t._id || t.id || ""
    );
    if (!n)
      return { ok: !1, error: "missing_id" };
    const s = d(W(n));
    return ie(D, F, n), { ok: !0, id: n, rev: String(s._rev || "") };
  }, ae = () => {
    const e = R(D, F).map(
      (t) => {
        const n = d(W(t));
        return {
          id: t,
          key: t,
          value: { rev: n._rev ?? null },
          doc: n
        };
      }
    );
    return {
      total_rows: e.length,
      offset: 0,
      rows: e
    };
  }, Ee = () => {
    const e = {
      on: (t, n) => e,
      once: (t, n) => e,
      off: (t, n) => e,
      cancel: () => {
      }
    };
    return e;
  }, G = () => ({
    ok: !0,
    docs_read: 0,
    docs_written: 0,
    doc_write_failures: 0,
    errors: []
  }), h = {
    get: (e) => W(e),
    put: (e) => K(e),
    post: (e) => K(e),
    remove: (e) => Ce(e),
    bulkDocs: (e) => {
      const t = d(e);
      return (Array.isArray(e) ? e : Array.isArray(t.docs) ? t.docs : []).map((s) => K(s));
    },
    allDocs: () => ae(),
    changes: () => Ee(),
    compact: () => ({ ok: !0 }),
    info: () => ({
      db_name: J,
      doc_count: ae().total_rows,
      update_seq: 0
    })
  };
  Object.assign(h, {
    replicate: {
      from: async () => G(),
      to: async () => G(),
      sync: async () => G()
    },
    promises: {
      get: async (e) => h.get(e),
      put: async (e) => h.put(e),
      post: async (e) => h.post(e),
      remove: async (e) => h.remove(e),
      bulkDocs: async (e) => h.bulkDocs(e),
      allDocs: async () => h.allDocs(),
      changes: async () => h.changes(),
      compact: async () => h.compact(),
      info: async () => h.info()
    }
  });
  const k = [], Q = () => k.map(
    (e) => e && typeof e == "object" ? { ...e } : e
  ), Ie = (e) => {
    const t = d(e), n = String(t.code || t.cmd || t.id || "").trim();
    if (n) {
      const s = k.findIndex((l) => {
        const m = d(l);
        return String(m.code || m.cmd || m.id || "") === n;
      });
      s >= 0 ? k.splice(s, 1, { ...t }) : k.push({ ...t });
    } else
      k.push(e);
    return v("otools:features-changed", Q()), r("set_feature", { feature: e }).catch(() => {
    }), !0;
  }, xe = (e) => {
    const t = String(e ?? "").trim(), n = k.findIndex((s) => {
      const l = d(s);
      return String(l.code || l.cmd || l.id || "") === t;
    });
    return n >= 0 && k.splice(n, 1), v("otools:features-changed", Q()), r("remove_feature", { code: t }).catch(() => {
    }), n >= 0;
  }, le = {
    code: "",
    type: "",
    payload: null,
    option: null
  };
  let X = (() => {
    const e = j(o.enterAction, le);
    if (e.code || e.type || e.payload || e.option || typeof window > "u")
      return e;
    try {
      const t = new URLSearchParams(window.location.search || "");
      return j(
        {
          code: t.get("code") || t.get("cmd") || t.get("featureCode") || t.get("feature") || "",
          type: t.get("type") || "",
          payload: me(t.get("payload") || t.get("text")),
          option: me(t.get("option"))
        },
        le
      );
    } catch {
      return e;
    }
  })();
  const Ne = /* @__PURE__ */ new Set(), Y = /* @__PURE__ */ new Set(), ce = /* @__PURE__ */ new Set(), ue = /* @__PURE__ */ new Set(), B = () => ({
    ...X
  });
  typeof u.addEventListener == "function" && (u.addEventListener("otools:plugin-enter", (e) => {
    const t = j(
      e.detail,
      B()
    );
    X = t, Y.forEach((n) => n(t));
  }), u.addEventListener("otools:plugin-out", () => {
    ce.forEach((e) => e());
  }), u.addEventListener("otools:db-pull", (e) => {
    const t = e.detail;
    ue.forEach((n) => n(t));
  }));
  let L = null, C = "";
  const Ae = (e) => ({
    text: e,
    value: e,
    toString: () => e
  }), de = (e) => (C = je(e), v("otools:set-sub-input-value", {
    value: C
  }), L?.(Ae(C)), !0);
  typeof u.addEventListener == "function" && u.addEventListener("otools:sub-input-change", (e) => {
    de(e.detail);
  });
  const ge = () => {
    if (typeof document < "u") {
      const e = document.documentElement;
      if (e.classList.contains("dark") || e.dataset.theme === "dark" || e.dataset.colorMode === "dark")
        return !0;
    }
    return typeof matchMedia == "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  }, M = () => {
    const e = [];
    let t = null, n;
    return n = new Proxy(
      {},
      {
        get(s, l) {
          if (l === Symbol.toStringTag)
            return "OToolsCompatUBrowser";
          if (l !== "then")
            return l === "steps" ? e : l === "run" ? async (m) => (v("otools:ubrowser-run", { steps: e, options: m }), t) : l === "end" || l === "close" || l === "destroy" ? async () => (e.splice(0, e.length), !0) : (...m) => {
              const _e = String(l);
              if (e.push({ method: _e, args: m }), _e === "evaluate" && typeof m[0] == "function")
                try {
                  t = m[0]();
                } catch {
                  t = null;
                }
              return n;
            };
        }
      }
    ), n;
  }, Te = new Proxy(
    (() => M()),
    {
      apply() {
        return M();
      },
      get(e, t) {
        if (t === Symbol.toStringTag)
          return "OToolsCompatUBrowserFactory";
        if (t === "then")
          return;
        if (t === "create" || t === "new")
          return () => M();
        const n = M();
        return Reflect.get(n, t);
      }
    }
  ), pe = o.eventClient || Oe({
    wsUrl: Re(o),
    token: a,
    WebSocketImpl: o.WebSocketImpl,
    acquire: (e) => r("native_plugin_listen_acquire", { uuid: e }),
    release: (e) => r("native_plugin_listen_release", { uuid: e })
  }), Z = (e, t, n) => r("native_plugin_invoke", {
    uuid: _(e),
    method: t,
    payload: n ?? null
  }), Ue = (e, t) => {
    const n = d(t), s = _(Fe(n));
    switch (e) {
      case "native_plugin_invoke":
        return r("native_plugin_invoke", {
          uuid: s,
          method: String(n.method || "").trim(),
          payload: n.payload ?? null
        });
      case "native_plugin_probe":
      case "native_plugin_reload":
      case "native_plugin_poll_events":
      case "native_plugin_listen_release":
        return r(e, { uuid: s });
      case "native_plugin_listen_acquire":
        return r(e, {
          uuid: s,
          intervalMs: n.intervalMs ?? n.interval_ms ?? null
        });
      default:
        return null;
    }
  }, fe = (e, t) => {
    const n = Ue(e, t);
    return n || Z(g, e, t);
  }, x = (e, t) => {
    const n = String(e || "").trim();
    if (!n)
      throw new Error(`${t} required`);
    return n;
  }, $ = (e) => d(e), q = {
    async open(e = {}) {
      if (e.directory) {
        const s = await r("tools_webview_pick_folder", {
          options: {
            directory: e.defaultPath,
            title: e.title
          }
        });
        return V(s);
      }
      const t = await r("tools_webview_pick_files", {
        options: {
          directory: e.defaultPath,
          filters: e.filters,
          multiple: e.multiple,
          title: e.title
        }
      }), n = Be(t);
      return e.multiple ? n : n[0] || null;
    },
    async save(e = {}) {
      const t = await r("tools_webview_pick_save_path", {
        options: {
          directory: e.defaultPath,
          filters: e.filters,
          title: e.title
        }
      });
      return V(t);
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
  }, S = {
    async open(e, t) {
      const n = String(e || "").trim();
      n && await r("remote_service_shell_open", {
        request: {
          path: n,
          with: t ? String(t) : void 0
        }
      });
    },
    async openPath(e) {
      const t = String(e || "").trim();
      t && await r("otools_shell_open_path", { path: t });
    },
    async showItemInFolder(e) {
      const t = String(e || "").trim();
      t && await r("otools_shell_show_item_in_folder", { path: t });
    },
    async trashItem(e) {
      const t = String(e || "").trim();
      t && await r("otools_shell_trash_item", { path: t });
    },
    async openExternal(e) {
      const t = String(e || "").trim();
      t && await r("otools_shell_open_external", { url: t });
    },
    async beep() {
      await r("otools_shell_beep");
    }
  };
  return {
    isDev: () => !!o.isDev,
    isMacOS: () => c === "macos",
    isMacOs: () => c === "macos",
    isWindows: () => c === "windows",
    isLinux: () => c === "linux",
    getAppName: () => f,
    getAppVersion: () => y,
    getPluginUuid: () => g,
    showMainWindow: () => {
      r("show_main_window").catch(() => {
        typeof window < "u" && window.focus();
      });
    },
    hideMainWindow: () => {
      r("hide_main_window").catch(() => {
        typeof window < "u" && window.blur();
      });
    },
    outPlugin: () => {
      r("hide_main_window").catch(() => {
        typeof window < "u" && window.close();
      });
    },
    setExpendHeight: (e) => {
      const t = Number(e);
      Number.isFinite(t) && typeof document < "u" && (document.body.style.minHeight = `${Math.max(0, Math.round(t))}px`), r("set_expend_height", { height: t }).catch(() => {
      });
    },
    isDarkColors: ge,
    isDarkMode: ge,
    getUser: () => null,
    fetchUser: () => Promise.resolve(null),
    fetchUserServerTemporaryToken: () => Promise.resolve(null),
    isPurchasedUser: () => !1,
    userPayments: () => [],
    screenColorPick: (e) => (typeof e == "function" && z(() => e(null)), Promise.resolve(null)),
    simulateKeyboardTap: () => !1,
    simulateKeyboard: () => !1,
    simulateMouseClick: () => !1,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getSubInputValue: () => C,
    getIdleUBrowser: () => null,
    getIdleUBrowsers: () => [],
    ubrowser: Te,
    getEnterAction: () => B(),
    onPluginReady: (e) => {
      typeof e == "function" && (Ne.add(e), z(e));
    },
    onDbPull: (e) => {
      typeof e == "function" && ue.add(e);
    },
    getFeatures: Q,
    setFeature: Ie,
    removeFeature: xe,
    redirect: (e, t) => {
      const n = String(e ?? "").trim(), s = j(
        { code: n, payload: t ?? null },
        B()
      );
      return X = s, v("otools:redirect", { code: n, payload: t ?? null }), Y.forEach((l) => l(s)), r("redirect", { code: n, payload: t ?? null }).catch(
        () => {
        }
      ), !0;
    },
    setSubInput: (e, t, n) => {
      const s = d(e), l = typeof e == "function" ? e : s.onChange || s.callback || s.search;
      return L = typeof l == "function" ? l : null, v("otools:set-sub-input", {
        placeholder: String(
          t ?? s.placeholder ?? s.text ?? ""
        ),
        isFocus: n ?? s.isFocus ?? s.focus ?? !0,
        value: C
      }), !0;
    },
    removeSubInput: () => (L = null, C = "", v("otools:remove-sub-input", {}), !0),
    hideSubInput: () => (L = null, C = "", v("otools:remove-sub-input", {}), !0),
    setSubInputValue: de,
    onPluginEnter: (e) => {
      typeof e == "function" && (Y.add(e), z(() => e(B())));
    },
    onPluginOut: (e) => {
      typeof e == "function" && ce.add(e);
    },
    showOpenDialog: (e, t) => {
      const n = q.open(d(e));
      return typeof t == "function" && n.then(t), n;
    },
    showSaveDialog: (e, t) => {
      const n = q.save(d(e));
      return typeof t == "function" && n.then(t), n;
    },
    dbStorage: Pe,
    db: h,
    invokeNative: fe,
    invokeNativeRaw: fe,
    invokeNativePlugin: (e, t, n) => Z(e, t, n),
    invokeNativePluginRaw: (e, t, n) => Z(e, t, n),
    probeNative: () => r("native_plugin_probe", { uuid: g }),
    probeNativePlugin: (e) => r("native_plugin_probe", { uuid: _(e) }),
    reloadNative: () => r("native_plugin_reload", { uuid: g }),
    reloadNativePlugin: (e) => r("native_plugin_reload", { uuid: _(e) }),
    listenNative: (e, t) => pe.listen(g, e, t),
    listenNativePlugin: (e, t, n) => pe.listen(_(e), t, n),
    getPluginLocalState: (e, t) => r("get_otools_plugin_localstate_with_scheme", {
      plugin: _(e),
      scheme: t ?? null
    }),
    savePluginLocalState: (e, t, n) => r("save_otools_plugin_localstate_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      state: t
    }),
    getPluginLocalStateValue: (e, t, n) => r("get_otools_plugin_localstate_value_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      key: t
    }),
    savePluginLocalStateValue: (e, t, n, s) => r("save_otools_plugin_localstate_value_with_scheme", {
      plugin: _(e),
      scheme: s ?? null,
      key: t,
      value: n
    }),
    patchPluginLocalState: (e, t, n) => r("patch_otools_plugin_localstate_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      patch: t ?? {}
    }),
    getPluginSyncState: (e, t) => r("get_otools_plugin_syncstate_with_scheme", {
      plugin: _(e),
      scheme: t ?? null
    }),
    savePluginSyncState: (e, t, n) => r("save_otools_plugin_syncstate_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      state: t
    }),
    getPluginSyncStateValue: (e, t, n) => r("get_otools_plugin_syncstate_value_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      key: t
    }),
    savePluginSyncStateValue: (e, t, n, s) => r("save_otools_plugin_syncstate_value_with_scheme", {
      plugin: _(e),
      scheme: s ?? null,
      key: t,
      value: n
    }),
    patchPluginSyncState: (e, t, n) => r("patch_otools_plugin_syncstate_with_scheme", {
      plugin: _(e),
      scheme: n ?? null,
      patch: t ?? {}
    }),
    shellOpen: (e, t) => S.open(e, t),
    shellOpenExternal: (e) => {
      S.openExternal(e);
    },
    shellOpenPath: (e) => {
      S.openPath(e);
    },
    shellTrashItem: (e) => {
      S.trashItem(e);
    },
    shellShowItemInFolder: (e) => {
      S.showItemInFolder(e);
    },
    shellBeep: () => {
      S.beep();
    },
    listHostDir: (e) => r("tools_webview_list_dir", {
      path: x(e, "path")
    }),
    readHostFile: (e) => r("tools_webview_read_file", {
      path: x(e, "path")
    }),
    writeHostFile: (e) => {
      const t = d(e), n = x(t.path, "path"), s = String(
        t.dataBase64 ?? t.data ?? t.content ?? ""
      );
      if (!s)
        throw new Error("dataBase64 required");
      return r("tools_webview_write_file", { path: n, dataBase64: s });
    },
    copyText: (e) => {
      const t = String(e || "");
      return r("otools_copy_text", { text: t }).catch(() => {
      }), !!t;
    },
    copyFile: (e) => {
      const t = ee(e);
      return t.length ? (u.__OToolsCopiedFiles = t, w.splice(0, w.length, ...t), r("otools_copy_file", { paths: t }).catch(() => {
      }), !0) : !1;
    },
    copyImage: (e) => {
      const t = Ve(e);
      return t ? (r("otools_copy_image", { image: t }).catch(
        () => {
        }
      ), !0) : !1;
    },
    getCopyedFiles: () => (r("otools_get_copied_files").then((e) => {
      Array.isArray(e) && (u.__OToolsCopiedFiles = e, w.splice(0, w.length, ...e));
    }).catch(() => {
    }), [...w]),
    getCopiedFiles: () => (r("otools_get_copied_files").then((e) => {
      Array.isArray(e) && (u.__OToolsCopiedFiles = e, w.splice(0, w.length, ...e));
    }).catch(() => {
    }), [...w]),
    showNotification: (e, t) => {
      r("otools_show_notification", {
        body: String(e || ""),
        clickFeatureCode: t ? String(t) : null
      }).catch(() => {
      });
    },
    hostRunWingetInstall: (e, t) => r("otools_host_run_winget_install", {
      packageName: x(e, "packageName"),
      options: $(t)
    }),
    hostRunPackageAction: (e, t) => {
      const n = $(t);
      return r("otools_host_run_package_action", {
        manager: n.manager ?? null,
        packageName: x(e, "packageName"),
        action: n.action ?? "install",
        version: n.version ?? null
      });
    },
    hostGetPackageStatus: (e, t) => {
      const n = $(t);
      return r("otools_host_get_package_status", {
        manager: n.manager ?? null,
        packageName: x(e, "packageName"),
        cask: n.cask ?? null
      });
    },
    hostGetPackagesStatus: (e, t) => {
      const n = ee(e), s = $(t);
      return n.length ? r("otools_host_get_packages_status", {
        manager: s.manager ?? null,
        packageNames: n,
        cask: s.cask ?? null
      }) : Promise.resolve([]);
    },
    aiGenerateText: (e) => r("otools_ai_generate_text", {
      request: e && typeof e == "object" ? e : {}
    }),
    hostRepairJsonText: (e) => r("otools_host_repair_json_text", {
      rawText: String(e || "")
    }),
    hostListListenProcesses: () => r("otools_host_list_listen_processes"),
    hostKillProcess: (e) => {
      const t = Number(e);
      return !Number.isFinite(t) || t <= 0 ? Promise.reject(new Error("Invalid pid")) : r("otools_host_kill_process", { pid: t });
    },
    hostScanStorageCatalog: (e) => {
      const t = Array.isArray(e) ? e : [];
      return t.length ? r("otools_host_scan_storage_catalog", { catalog: t }) : Promise.reject(new Error("catalog required"));
    },
    hostCleanStorageItems: (e, t) => {
      const n = Array.isArray(e) ? e : [], s = Le(t);
      return n.length ? s.length ? r("otools_host_clean_storage_items", {
        catalog: n,
        ids: s
      }) : Promise.reject(new Error("ids required")) : Promise.reject(new Error("catalog required"));
    },
    hostCleanStoragePaths: (e) => {
      if (!Array.isArray(e) || !e.length)
        return Promise.reject(new Error("entries required"));
      if (typeof e[0] == "string") {
        const n = ee(e);
        return n.length ? r("otools_host_clean_storage_paths", {
          entries: n.map((s) => ({
            itemId: "",
            itemName: "",
            path: s
          }))
        }) : Promise.reject(new Error("paths required"));
      }
      return r("otools_host_clean_storage_paths", {
        entries: e
      });
    },
    statusBarAttach: (e) => r("otools_set_status_bar_state", {
      payload: e && typeof e == "object" ? e : {}
    }),
    getNativeId: () => String(U.nativeId || ""),
    getPath: (e) => String(N[String(e || "")] || ""),
    getFileIcon: (e) => {
      const t = String(e || "").trim();
      return t ? O[t] ? O[t] : (r("otools_get_file_icon", { path: t }).then((n) => {
        n && (O[t] = n);
      }).catch(() => {
      }), "") : "";
    },
    readCurrentFolderPath: () => String(U.currentFolderPath || ""),
    readCurrentBrowserUrl: () => String(
      U.currentBrowserUrl || (typeof window < "u" ? window.location.href : "")
    ),
    dialog: q,
    runtime: {
      get isNoder() {
        return !!A();
      },
      isNativeTauri: !1,
      hasHostBridge: !0,
      platform: c,
      appName: f,
      appVersion: y,
      pluginUuid: g,
      env: U,
      permissionsRestricted: b,
      permissions: p,
      hasPermission: we,
      versions: {
        app: y,
        tauri: "2",
        otools: y,
        codeg: y
      },
      dialog: q,
      shell: S,
      fs: null,
      path: {
        sep: c === "windows" ? "\\" : "/",
        delimiter: c === "windows" ? ";" : ":"
      },
      os: null,
      process: null,
      childProcess: null,
      require: H,
      createRequire: Se,
      get builtinModules() {
        return ve();
      }
    },
    shell: S
  };
}
function Ge(o) {
  const i = ze(o), a = he();
  return a.__OToolsEnv = {
    ...a.__OToolsEnv || {},
    ...i.runtime?.env || {}
  }, a.__OTOOLS_REMOTE_SERVICE__ = !0, a.__TAURI_REMOTE_SERVICE__ = !0, a.otools = i, a.utools = i, i;
}
export {
  ze as createOtoolsWebFacade,
  Ge as installOtoolsWebRuntime
};
//# sourceMappingURL=remote-service-otools-web-shim.js.map

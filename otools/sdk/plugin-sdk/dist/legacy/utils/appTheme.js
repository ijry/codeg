import { isNativeTauriRuntime as w, hostInvoke as p } from "../platform/transport/hostBridge.js";
const M = "dark", S = "light", f = "(prefers-color-scheme: dark)", _ = "data-theme-mode", A = "data-theme-accent", m = "otools:theme-mode", l = "otools:theme-accent", v = "otools-theme-changed", g = "theme-local";
let o = null, r = null, c = "system", s = "classic", a = "", u = !1;
const T = () => typeof window < "u" && typeof window.matchMedia == "function", L = (e) => e === "dark" ? "dark" : e === "light" ? "light" : T() && window.matchMedia(f).matches ? "dark" : "light", C = (e) => e === "light" || e === "dark" || e === "system" ? e : "system", k = (e) => e === "classic" || e === "violet" || e === "emerald" || e === "amber" || e === "pink" ? e : "classic", d = (e, t) => {
  try {
    typeof window < "u" && typeof window.localStorage < "u" && window.localStorage.setItem(e, t);
  } catch {
  }
}, N = (e, t, n) => {
  w({ includeAncestors: !0 }) && p(
    "tools_sync_child_webview_theme",
    {
      themeMode: e,
      themeAccent: t,
      resolvedTheme: n
    },
    void 0,
    { includeAncestors: !0 }
  ).catch(() => {
  });
}, H = (e) => {
  if (!e || e.source === g)
    return;
  const t = C(e.themeMode), n = k(e.themeAccent), i = e.resolvedTheme === "dark" || e.resolvedTheme === "light" ? e.resolvedTheme : void 0;
  I(
    {
      themeMode: t,
      themeAccent: n
    },
    {
      skipChildWebviewSync: !0,
      resolvedThemeOverride: i
    }
  );
}, O = () => {
  u || typeof window > "u" || typeof window.addEventListener != "function" || (window.addEventListener(v, (e) => {
    H(e.detail);
  }), u = !0);
}, h = (e = {}) => {
  if (typeof document > "u")
    return;
  const t = document.documentElement, n = e.resolvedThemeOverride ?? L(c);
  t.classList.toggle(M, n === "dark"), t.classList.toggle(S, n === "light"), t.style.colorScheme = n, t.setAttribute(_, c), t.setAttribute(A, s);
  const i = JSON.stringify({
    themeMode: c,
    themeAccent: s,
    resolvedTheme: n
  });
  a !== i && (a = i, !e.skipChildWebviewSync && N(c, s, n));
};
O();
const E = () => {
  !o || !r || (typeof o.removeEventListener == "function" ? o.removeEventListener("change", r) : o.removeListener(r), o = null, r = null);
}, y = () => {
  T() && (o = window.matchMedia(f), r = () => {
    b("system");
  }, typeof o.addEventListener == "function" ? o.addEventListener("change", r) : o.addListener(r));
}, b = (e, t = {}) => {
  c = e, d(m, e), E(), e === "system" && y(), h(t);
}, Y = (e, t = {}) => {
  s = e, d(l, e), h(t);
}, I = (e, t = {}) => {
  e.themeMode && (c = e.themeMode, d(m, e.themeMode)), e.themeAccent && (s = e.themeAccent, d(l, e.themeAccent)), E(), c === "system" && y(), h(t);
}, U = () => {
  try {
    if (typeof window > "u" || typeof window.localStorage > "u")
      return null;
    const e = window.localStorage.getItem(m);
    return e === "light" || e === "dark" || e === "system" ? e : null;
  } catch {
    return null;
  }
}, x = () => {
  try {
    if (typeof window > "u" || typeof window.localStorage > "u")
      return null;
    const e = window.localStorage.getItem(l);
    return e === "classic" || e === "violet" || e === "emerald" || e === "amber" || e === "pink" ? e : null;
  } catch {
    return null;
  }
};
export {
  Y as applyThemeAccent,
  b as applyThemeMode,
  I as applyThemeSettings,
  x as readCachedThemeAccent,
  U as readCachedThemeMode
};
//# sourceMappingURL=appTheme.js.map

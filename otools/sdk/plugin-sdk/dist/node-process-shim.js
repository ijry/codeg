import { b as a, a as c, r as l } from "./node-compat-core-ibTnNoud.js";
function r() {
  return l("process");
}
const o = {
  argv: [],
  browser: !0,
  cwd: () => c()?.__OToolsEnv?.paths?.cwd || "/",
  env: {
    NODE_ENV: c()?.__OToolsEnv?.isDev ? "development" : "production",
    ...c()?.__OToolsEnv?.processEnv ?? {}
  },
  nextTick(s, ...e) {
    queueMicrotask(() => s(...e));
  },
  platform: a(),
  release: { name: "browser" },
  title: "browser",
  versions: {
    node: "20.0.0-otools"
  }
}, d = new Proxy(o, {
  get(s, e) {
    const n = r(), t = n?.[e] ?? s[e];
    return typeof t == "function" ? t.bind(n ?? s) : t;
  },
  set(s, e, n) {
    const t = r();
    return t && (t[e] = n), s[e] = n, !0;
  }
}), u = o.argv, v = !0, f = () => r()?.cwd?.() ?? o.cwd(), m = o.env, p = (s, ...e) => (r()?.nextTick ?? o.nextTick)(s, ...e), w = r()?.platform ?? o.platform, b = r()?.release ?? o.release, x = r()?.title ?? o.title, T = r()?.versions ?? o.versions;
export {
  u as argv,
  v as browser,
  f as cwd,
  d as default,
  m as env,
  p as nextTick,
  w as platform,
  b as release,
  x as title,
  T as versions
};
//# sourceMappingURL=node-process-shim.js.map

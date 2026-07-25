import { c as d, d as u, n as f, j as o, i as r, e as i, f as m, g as l, r as p } from "./node-compat-core-ibTnNoud.js";
function t() {
  return p("path");
}
function x(e) {
  const n = l(e), s = i(n), c = m(e);
  return {
    root: r(e) ? "/" : "",
    dir: c,
    base: n,
    ext: s,
    name: s ? n.slice(0, -s.length) : n
  };
}
function P(e) {
  const n = String(e.dir || e.root || ""), s = String(
    e.base || `${String(e.name || "")}${String(e.ext || "")}`
  );
  return n ? o(n, s) : s;
}
const a = {
  basename: l,
  delimiter: ":",
  dirname: m,
  extname: i,
  format: P,
  isAbsolute: r,
  join: o,
  normalize: f,
  parse: x,
  relative: u,
  resolve: d,
  sep: "/",
  toNamespacedPath: (e) => String(e ?? "")
};
a.posix = a;
a.win32 = {
  ...a,
  delimiter: ";",
  sep: "\\"
};
const v = new Proxy(a, {
  get(e, n) {
    const s = t()?.[n] ?? e[n];
    return typeof s == "function" ? s.bind(t() ?? e) : s;
  }
}), h = (...e) => (t()?.basename ?? a.basename)(...e), g = t()?.delimiter ?? a.delimiter, w = (...e) => (t()?.dirname ?? a.dirname)(...e), z = (...e) => (t()?.extname ?? a.extname)(...e), A = (...e) => (t()?.format ?? a.format)(...e), N = (...e) => (t()?.isAbsolute ?? a.isAbsolute)(...e), S = (...e) => (t()?.join ?? a.join)(...e), $ = (...e) => (t()?.normalize ?? a.normalize)(...e), k = (...e) => (t()?.parse ?? a.parse)(...e), y = t()?.posix ?? a.posix, j = (...e) => (t()?.relative ?? a.relative)(...e), M = (...e) => (t()?.resolve ?? a.resolve)(...e), F = t()?.sep ?? a.sep, q = (...e) => (t()?.toNamespacedPath ?? a.toNamespacedPath)(...e), B = t()?.win32 ?? a.win32;
export {
  h as basename,
  v as default,
  g as delimiter,
  w as dirname,
  z as extname,
  A as format,
  N as isAbsolute,
  S as join,
  $ as normalize,
  k as parse,
  y as posix,
  j as relative,
  M as resolve,
  F as sep,
  q as toNamespacedPath,
  B as win32
};
//# sourceMappingURL=node-path-shim.js.map

import o, { win32 as s } from "./node-path-shim.js";
const t = s ?? o, n = (...e) => t.basename(...e), r = t.delimiter, i = (...e) => t.dirname(...e), c = (...e) => t.extname(...e), m = (...e) => t.format(...e), l = (...e) => t.isAbsolute(...e), p = (...e) => t.join(...e), d = (...e) => t.normalize(...e), b = (...e) => t.parse(...e), f = (...e) => t.relative(...e), h = (...e) => t.resolve(...e), v = t.sep, x = (...e) => t.toNamespacedPath(...e);
export {
  n as basename,
  t as default,
  r as delimiter,
  i as dirname,
  c as extname,
  m as format,
  l as isAbsolute,
  p as join,
  d as normalize,
  b as parse,
  f as relative,
  h as resolve,
  v as sep,
  x as toNamespacedPath
};
//# sourceMappingURL=node-path-win32-shim.js.map

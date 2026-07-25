import { r as p } from "./node-compat-core-ibTnNoud.js";
function a() {
  return p("querystring");
}
function u(e) {
  return a()?.escape?.(e) ?? encodeURIComponent(e);
}
function d(e) {
  return a()?.unescape?.(e) ?? decodeURIComponent(e);
}
function c(e) {
  const t = a()?.parse;
  if (t)
    return t(e);
  const n = {}, s = new URLSearchParams(String(e || "").replace(/^\?/, ""));
  for (const [r, o] of s) {
    const i = n[r];
    i === void 0 ? n[r] = o : Array.isArray(i) ? i.push(o) : n[r] = [i, o];
  }
  return n;
}
function f(e) {
  const t = a()?.stringify;
  if (t)
    return t(e);
  const n = new URLSearchParams();
  for (const [s, r] of Object.entries(e || {}))
    if (Array.isArray(r))
      for (const o of r)
        n.append(s, String(o ?? ""));
    else r !== void 0 && n.append(s, String(r ?? ""));
  return n.toString();
}
const g = c, y = f, S = {
  decode: g,
  encode: y,
  escape: u,
  parse: c,
  stringify: f,
  unescape: d
};
export {
  g as decode,
  S as default,
  y as encode,
  u as escape,
  c as parse,
  f as stringify,
  d as unescape
};
//# sourceMappingURL=node-querystring-shim.js.map

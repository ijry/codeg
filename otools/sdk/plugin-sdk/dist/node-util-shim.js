import { r as p } from "./node-compat-core-ibTnNoud.js";
function o() {
  return p("util");
}
function s(t) {
  if (typeof t == "string")
    return t;
  try {
    return JSON.stringify(t);
  } catch {
    return String(t);
  }
}
function u(t, ...i) {
  const n = o()?.format;
  if (n)
    return n(t, ...i);
  let e = 0;
  return [String(t ?? "").replace(/%[sdjifoO%]/g, (f) => {
    if (f === "%%")
      return "%";
    const c = i[e++];
    return f === "%d" || f === "%i" ? String(parseInt(String(c ?? 0), 10)) : f === "%f" ? String(parseFloat(String(c ?? 0))) : s(c);
  }), ...i.slice(e).map(s)].join(" ");
}
function y(t) {
  return o()?.inspect?.(t) ?? s(t);
}
function l(t, i) {
  const n = o()?.inherits;
  if (n) {
    n(t, i);
    return;
  }
  typeof t == "function" && typeof i == "function" && (t.prototype = Object.create(i.prototype), Object.defineProperty(t.prototype, "constructor", {
    configurable: !0,
    value: t,
    writable: !0
  }));
}
function m(t) {
  const i = o()?.promisify;
  return i ? i(t) : (...n) => new Promise((e, r) => {
    t(
      ...n,
      (a, f) => a ? r(a) : e(f)
    );
  });
}
function d(t) {
  const i = o()?.callbackify;
  return i ? i(t) : (...n) => {
    const e = n.pop();
    t(...n).then(
      (r) => {
        typeof e == "function" && e(null, r);
      },
      (r) => {
        typeof e == "function" && e(r);
      }
    );
  };
}
const g = o()?.types ?? {
  isArrayBuffer: (t) => t instanceof ArrayBuffer,
  isDate: (t) => t instanceof Date,
  isMap: (t) => t instanceof Map,
  isRegExp: (t) => t instanceof RegExp,
  isSet: (t) => t instanceof Set,
  isUint8Array: (t) => t instanceof Uint8Array
}, b = {
  callbackify: d,
  format: u,
  inherits: l,
  inspect: y,
  promisify: m,
  types: g
};
export {
  d as callbackify,
  b as default,
  u as format,
  l as inherits,
  y as inspect,
  m as promisify,
  g as types
};
//# sourceMappingURL=node-util-shim.js.map

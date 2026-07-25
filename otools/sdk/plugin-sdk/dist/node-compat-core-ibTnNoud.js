function l() {
  return typeof window > "u" ? null : window;
}
function f(s) {
  try {
    const t = l()?.__OTOOLS_NODER__?.require?.(s);
    return t && typeof t == "object" ? t : null;
  } catch {
    return null;
  }
}
function h() {
  const s = String(l()?.__OToolsEnv?.platform || "").toLowerCase();
  return s.includes("win") ? "win32" : s.includes("mac") || s === "darwin" ? "darwin" : s.includes("linux") ? "linux" : "browser";
}
function u(s) {
  return String(s ?? "").replace(/\\/g, "/");
}
function c(s) {
  const t = String(s ?? "");
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(t);
}
function d(s) {
  const t = u(s).replace(/\/+$/, "");
  if (!t || t === ".")
    return ".";
  const e = t.lastIndexOf("/");
  return e <= 0 ? e === 0 ? "/" : "." : t.slice(0, e);
}
function a(s, t = "") {
  const e = u(s).replace(/\/+$/, ""), n = e.slice(e.lastIndexOf("/") + 1), r = String(t || "");
  return r && n.endsWith(r) ? n.slice(0, -r.length) : n;
}
function m(s) {
  const t = a(s), e = t.lastIndexOf(".");
  return e > 0 ? t.slice(e) : "";
}
function o(...s) {
  const t = s.map((i) => u(i)).filter(Boolean).join("/"), e = t.startsWith("/"), n = [];
  for (const i of t.split("/"))
    if (!(!i || i === ".")) {
      if (i === "..") {
        n.length && n[n.length - 1] !== ".." ? n.pop() : e || n.push(i);
        continue;
      }
      n.push(i);
    }
  const r = n.join("/");
  return e ? `/${r}` || "/" : r || ".";
}
function p(...s) {
  return o(...s);
}
function g(...s) {
  let t = "";
  for (let e = s.length - 1; e >= 0; e -= 1) {
    const n = u(s[e]);
    if (n && (t = t ? `${n}/${t}` : n, c(n)))
      break;
  }
  return c(t) || (t = `/${t}`), o(t);
}
function b(s, t) {
  const e = o(s).split("/").filter(Boolean), n = o(t).split("/").filter(Boolean);
  for (; e.length && n.length && e[0] === n[0]; )
    e.shift(), n.shift();
  return [...e.map(() => ".."), ...n].join("/") || "";
}
class w {
  constructor() {
    this.buckets = /* @__PURE__ */ new Map();
  }
  on(t, e) {
    const n = this.buckets.get(t) ?? /* @__PURE__ */ new Set();
    return n.add(e), this.buckets.set(t, n), this;
  }
  addListener(t, e) {
    return this.on(t, e);
  }
  once(t, e) {
    const n = (...r) => {
      this.off(t, n), e(...r);
    };
    return this.on(t, n);
  }
  off(t, e) {
    return this.buckets.get(t)?.delete(e), this;
  }
  removeListener(t, e) {
    return this.off(t, e);
  }
  removeAllListeners(t) {
    return t === void 0 ? this.buckets.clear() : this.buckets.delete(t), this;
  }
  emit(t, ...e) {
    const n = [...this.buckets.get(t) ?? []];
    for (const r of n)
      r(...e);
    return n.length > 0;
  }
  listeners(t) {
    return [...this.buckets.get(t) ?? []];
  }
  listenerCount(t) {
    return this.buckets.get(t)?.size ?? 0;
  }
  eventNames() {
    return [...this.buckets.keys()];
  }
}
export {
  w as C,
  l as a,
  h as b,
  g as c,
  b as d,
  m as e,
  d as f,
  a as g,
  c as i,
  p as j,
  o as n,
  f as r
};
//# sourceMappingURL=node-compat-core-ibTnNoud.js.map

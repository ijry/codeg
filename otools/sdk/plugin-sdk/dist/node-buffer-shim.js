import { r as b } from "./node-compat-core-ibTnNoud.js";
function c(r) {
  return new TextEncoder().encode(String(r ?? ""));
}
function o(r) {
  return Object.defineProperty(r, "toString", {
    configurable: !0,
    value(e = "utf8") {
      if (e === "base64") {
        let t = "";
        for (const n of r)
          t += String.fromCharCode(n);
        return globalThis.btoa(t);
      }
      return e === "hex" ? [...r].map((t) => t.toString(16).padStart(2, "0")).join("") : new TextDecoder().decode(r);
    }
  }), r;
}
const a = {
  alloc(r, e = 0, t) {
    const n = new Uint8Array(Math.max(0, Math.trunc(Number(r) || 0)));
    if (typeof e == "number")
      n.fill(e);
    else if (e != null) {
      const u = a.from(String(e), t);
      for (let f = 0; f < n.length; f += 1)
        n[f] = u[f % u.length] ?? 0;
    }
    return o(n);
  },
  allocUnsafe(r) {
    return o(
      new Uint8Array(Math.max(0, Math.trunc(Number(r) || 0)))
    );
  },
  byteLength(r, e) {
    return a.from(r, e).length;
  },
  from(r, e) {
    if (typeof r == "string") {
      if (e === "base64") {
        const t = globalThis.atob(r);
        return o(
          new Uint8Array([...t].map((n) => n.charCodeAt(0)))
        );
      }
      if (e === "hex") {
        const t = r.match(/.{1,2}/g)?.map((n) => parseInt(n, 16)) ?? [];
        return o(new Uint8Array(t));
      }
      return o(new Uint8Array(c(r)));
    }
    if (ArrayBuffer.isView(r)) {
      const t = r, n = new Uint8Array(t.byteLength);
      return n.set(new Uint8Array(t.buffer, t.byteOffset, t.byteLength)), o(n);
    }
    return r instanceof ArrayBuffer ? o(new Uint8Array(r.slice(0))) : Array.isArray(r) ? o(new Uint8Array(r)) : o(new Uint8Array(c(r)));
  },
  isBuffer(r) {
    return r instanceof Uint8Array;
  }
};
function s() {
  return b("buffer")?.Buffer ?? a;
}
const y = new Proxy(a, {
  get(r, e) {
    const t = s()?.[e] ?? r[e];
    return typeof t == "function" ? t.bind(s()) : t;
  }
}), A = globalThis.atob?.bind(globalThis), h = globalThis.btoa?.bind(globalThis), i = {
  MAX_LENGTH: Number.MAX_SAFE_INTEGER,
  MAX_STRING_LENGTH: Number.MAX_SAFE_INTEGER
}, d = 50, g = i.MAX_LENGTH, m = i.MAX_STRING_LENGTH, l = {
  Buffer: y,
  INSPECT_MAX_BYTES: d,
  atob: A,
  btoa: h,
  constants: i,
  kMaxLength: g,
  kStringMaxLength: m
};
export {
  y as Buffer,
  d as INSPECT_MAX_BYTES,
  A as atob,
  h as btoa,
  i as constants,
  l as default,
  g as kMaxLength,
  m as kStringMaxLength
};
//# sourceMappingURL=node-buffer-shim.js.map

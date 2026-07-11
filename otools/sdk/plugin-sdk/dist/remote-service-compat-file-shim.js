import { convertFileSrc as c } from "./tauri-core-shim.js";
import { isNativeTauriRuntime as s } from "./remote-service-runtime-shim.js";
const l = "/__tauri_remote_service_file__", m = (r) => String(r || "").replace(/\/+$/, ""), i = (r) => {
  const t = String(r || "");
  return t.startsWith("/") || /^[A-Za-z]:[\\/]/.test(t);
}, o = (r) => {
  const t = String(r || "").trim();
  if (!t)
    return t;
  if (t.startsWith("file://"))
    try {
      const e = new URL(t);
      let n = decodeURIComponent(e.pathname);
      return n.startsWith("/") && /^[A-Za-z]:/.test(n.slice(1)) && (n = n.slice(1)), n;
    } catch {
      return t;
    }
  return t;
}, a = (r) => {
  const t = o(r);
  if (!i(t))
    return t;
  const e = typeof window < "u" ? m(window.location.origin || "") : "";
  return e ? `${e}${l}?path=${encodeURIComponent(
    t
  )}` : t;
}, p = async (r) => {
  const t = o(r);
  return i(t) ? s() ? c(t) : a(t) : r;
}, d = (r) => {
  const t = o(r);
  return i(t) ? s() ? c(t) : a(t) : r;
};
export {
  l as REMOTE_SERVICE_FILE_ROUTE,
  a as buildRemoteFileUrl,
  p as convertFileSrcCompat,
  d as convertFileSrcCompatSync,
  i as isLocalFilePath,
  o as normalizeLocalFilePath
};
//# sourceMappingURL=remote-service-compat-file-shim.js.map

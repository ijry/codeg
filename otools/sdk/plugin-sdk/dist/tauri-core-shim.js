import { i as u } from "./remote-service-api-event-shim-CD-wuaHi.js";
import { registerTransformCallback as m } from "./native-event-bridge.js";
const r = () => {
  if (!(typeof window > "u"))
    return window.__TAURI_INTERNALS__;
}, a = () => typeof r()?.invoke == "function", c = (o, e = "asset") => {
  const t = String(o ?? "").trim();
  if (!t)
    return t;
  const n = r();
  if (typeof n?.convertFileSrc == "function")
    return n.convertFileSrc(t, e);
  if (/^(data|blob|https?|asset|file):/i.test(t) || !(t.startsWith("/") || /^[A-Za-z]:[\\/]/.test(t)))
    return t;
  const i = encodeURIComponent(t);
  return `${e}://localhost/${i}`;
};
export {
  c as convertFileSrc,
  u as invoke,
  a as isTauri,
  m as transformCallback
};
//# sourceMappingURL=tauri-core-shim.js.map

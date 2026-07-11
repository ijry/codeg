import { beep as o, openPath as n, openExternal as s, open as i, showItemInFolder as c, trashItem as l } from "../../../remote-service-compat-shell-shim.js";
import { listHostDir as p } from "./fs.js";
import { isRemoteServiceRuntime as m } from "../transport/hostBridge.js";
const f = (e) => {
  const t = String(e || "").trim().replace(/[\\/]+$/, "");
  if (!t)
    return "";
  const r = Math.max(
    t.lastIndexOf("/"),
    t.lastIndexOf("\\")
  );
  return r < 0 ? "" : r === 0 ? t.slice(0, 1) : r === 2 && /^[A-Za-z]:[\\/]/.test(t) ? t.slice(0, 3) : t.slice(0, r);
}, a = async (e) => {
  try {
    return await p(e), !0;
  } catch {
    return !1;
  }
}, y = async (e, t) => i(e, t), H = async (e) => {
  await n(e);
}, I = async (e) => {
  const t = String(e || "").trim();
  if (!t)
    return;
  if (await a(t)) {
    await n(t);
    return;
  }
  const r = f(t);
  if (r && await a(r)) {
    await n(r);
    return;
  }
  await n(t);
}, d = async (e) => {
  await c(e);
}, x = async (e) => {
  await l(e);
}, g = async (e) => {
  const t = String(e || "").trim();
  if (t) {
    if (m()) {
      window.open(t, "_blank", "noopener,noreferrer");
      return;
    }
    await s(t);
  }
}, S = async () => {
  await o();
};
export {
  S as beepHostShell,
  I as openHostDirectoryTarget,
  g as openHostExternal,
  H as openHostPath,
  y as openHostShell,
  d as showHostItemInFolder,
  x as trashHostItem
};
//# sourceMappingURL=shell.js.map

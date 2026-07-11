import { normalizeLocalFilePath as a, isLocalFilePath as s } from "./remote-service-compat-file-shim.js";
import { isRemoteServiceRuntime as l } from "./remote-service-runtime-shim.js";
import { shellBeep as c, shellOpenExternal as o, shellOpenPath as i, shellOpen as m, shellShowItemInFolder as h, shellTrashItem as p } from "./remote-service-host-shell-shim.js";
const f = /^(https?:\/\/|mailto:|tel:)/i;
async function w(t, e) {
  const n = String(t || "").trim();
  if (!n)
    return;
  if (f.test(n)) {
    await o(n);
    return;
  }
  const r = a(n);
  if (s(r)) {
    await i(r);
    return;
  }
  await m(n, e);
}
const E = async (t) => i(String(t || "")), y = async (t) => h(String(t || "")), I = async (t) => p(String(t || "")), d = async (t) => {
  const e = String(t || "").trim();
  if (e) {
    if (l()) {
      window.open(e, "_blank", "noopener,noreferrer");
      return;
    }
    return o(e);
  }
}, F = async () => c();
export {
  F as beep,
  w as open,
  d as openExternal,
  E as openPath,
  y as showItemInFolder,
  I as trashItem
};
//# sourceMappingURL=remote-service-compat-shell-shim.js.map

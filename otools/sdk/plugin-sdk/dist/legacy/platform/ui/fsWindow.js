import { createApp as i } from "vue";
import s from "element-plus";
import m from "./common/FsWindow.vue";
import { t as d } from "../i18n.js";
import { isRemoteServiceRuntime as p, hostInvoke as u } from "../transport/hostBridge.js";
const c = (t = {}) => {
  if (typeof document > "u")
    return Promise.resolve();
  const e = document.createElement("div");
  document.body.appendChild(e);
  const n = i(m, {
    request: t,
    onClose: () => {
      window.setTimeout(() => {
        n.unmount(), e.remove();
      }, 0);
    },
    onError: (r) => {
      console.error("showFsWindow failed:", r);
    }
  });
  return n.use(s), n.mount(e), Promise.resolve();
}, v = async (t, e = {}) => {
  const o = String(t || "").trim();
  if (p())
    return c({
      title: e.title || d("platform.fsWindow.title"),
      defaultPath: o || void 0
    });
  o && await u("open_directory", { path: o });
};
export {
  v as openHostFsWindow,
  c as showFsWindow
};
//# sourceMappingURL=fsWindow.js.map

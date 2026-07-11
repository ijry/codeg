import { e as d, i as p, l as v, o as l } from "./remote-service-api-event-shim-CD-wuaHi.js";
import { hasHostBridgeRuntime as R, isNativeTauriRuntime as x, isRemoteServiceRuntime as f } from "./remote-service-runtime-shim.js";
import { createOtoolsWebFacade as h, installOtoolsWebRuntime as k } from "./remote-service-otools-web-shim.js";
const n = async () => {
}, s = () => {
}, c = async () => {
}, a = (e, o, i) => import("./runtime.js").then(({ invoke: t }) => t(e, o));
export {
  h as createOtoolsWebFacade,
  s as disconnect,
  d as emit,
  c as ensureConnected,
  R as hasHostBridgeRuntime,
  n as init,
  k as installOtoolsWebRuntime,
  p as invoke,
  x as isNativeTauriRuntime,
  f as isRemoteServiceRuntime,
  v as listen,
  l as once,
  a as sendRpc
};
//# sourceMappingURL=remote-service-shim.js.map

import { C as c, r as i } from "./node-compat-core-ibTnNoud.js";
function r() {
  return i("events");
}
class o extends c {
}
function a(n, e) {
  return r()?.listenerCount?.(n, e) ?? n.listenerCount(e);
}
function d(n, e) {
  const t = r()?.once;
  return t ? t(n, e) : new Promise((s) => {
    n.once(e, (...u) => s(u));
  });
}
const l = Object.assign(o, {
  EventEmitter: o,
  listenerCount: a,
  once: d
});
export {
  o as EventEmitter,
  l as default,
  a as listenerCount,
  d as once
};
//# sourceMappingURL=node-events-shim.js.map

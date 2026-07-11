function e() {
  return typeof window < "u" && typeof window.__TAURI_INTERNALS__?.invoke == "function";
}
function n() {
  return e() ? !1 : typeof window < "u" && (window.__TAURI_REMOTE_SERVICE__ === !0 || window.__OTOOLS_REMOTE_SERVICE__ === !0);
}
function i() {
  return e() || n();
}
export {
  i as hasHostBridgeRuntime,
  e as isNativeTauriRuntime,
  n as isRemoteServiceRuntime
};
//# sourceMappingURL=remote-service-runtime-shim.js.map

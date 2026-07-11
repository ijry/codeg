export function isNativeTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__?.invoke === "function"
  );
}

export function isRemoteServiceRuntime(): boolean {
  if (isNativeTauriRuntime()) {
    return false;
  }
  return (
    typeof window !== "undefined" &&
    (window.__TAURI_REMOTE_SERVICE__ === true ||
      window.__OTOOLS_REMOTE_SERVICE__ === true)
  );
}

export function hasHostBridgeRuntime(): boolean {
  return isNativeTauriRuntime() || isRemoteServiceRuntime();
}

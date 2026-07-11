export { invoke } from "./runtime";
export { registerTransformCallback as transformCallback } from "./native-event-bridge";
import type { TauriInternals } from "./otools-globals";

const getTauriInternals = (): TauriInternals | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__TAURI_INTERNALS__;
};

export const isTauri = (): boolean =>
  typeof getTauriInternals()?.invoke === "function";

export const convertFileSrc = (filePath: string, protocol = "asset"): string => {
  const normalized = String(filePath ?? "").trim();
  if (!normalized) {
    return normalized;
  }
  const internals = getTauriInternals();
  if (typeof internals?.convertFileSrc === "function") {
    return internals.convertFileSrc(normalized, protocol);
  }
  if (/^(data|blob|https?|asset|file):/i.test(normalized)) {
    return normalized;
  }
  const isLocalPath =
    normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
  if (!isLocalPath) {
    return normalized;
  }
  const encoded = encodeURIComponent(normalized);
  return `${protocol}://localhost/${encoded}`;
};

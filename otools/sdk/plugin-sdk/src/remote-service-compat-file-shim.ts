import { convertFileSrc } from "./tauri-core-shim";
import { isNativeTauriRuntime } from "./remote-service-runtime-shim";

export const REMOTE_SERVICE_FILE_ROUTE = "/__tauri_remote_service_file__";

const trimRightSlash = (value: string) => String(value || "").replace(/\/+$/, "");

export const isLocalFilePath = (value: string) => {
  const raw = String(value || "");
  return raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
};

export const normalizeLocalFilePath = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("file://")) {
    try {
      const url = new URL(raw);
      let path = decodeURIComponent(url.pathname);
      if (path.startsWith("/") && /^[A-Za-z]:/.test(path.slice(1))) {
        path = path.slice(1);
      }
      return path;
    } catch {
      return raw;
    }
  }
  return raw;
};

export const buildRemoteFileUrl = (path: string) => {
  const normalized = normalizeLocalFilePath(path);
  if (!isLocalFilePath(normalized)) {
    return normalized;
  }
  const origin =
    typeof window !== "undefined" ? trimRightSlash(window.location.origin || "") : "";
  if (!origin) {
    return normalized;
  }
  return `${origin}${REMOTE_SERVICE_FILE_ROUTE}?path=${encodeURIComponent(
    normalized,
  )}`;
};

export const convertFileSrcCompat = async (value: string) => {
  const normalized = normalizeLocalFilePath(value);
  if (!isLocalFilePath(normalized)) {
    return value;
  }
  if (isNativeTauriRuntime()) {
    return convertFileSrc(normalized);
  }
  return buildRemoteFileUrl(normalized);
};

export const convertFileSrcCompatSync = (value: string) => {
  const normalized = normalizeLocalFilePath(value);
  if (!isLocalFilePath(normalized)) {
    return value;
  }
  if (isNativeTauriRuntime()) {
    return convertFileSrc(normalized);
  }
  return buildRemoteFileUrl(normalized);
};

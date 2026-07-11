import { isLocalFilePath, normalizeLocalFilePath } from "./remote-service-compat-file-shim";
import { isRemoteServiceRuntime } from "./remote-service-runtime-shim";
import {
  shellBeep,
  shellOpen,
  shellOpenExternal,
  shellOpenPath,
  shellShowItemInFolder,
  shellTrashItem,
} from "./remote-service-host-shell-shim";

const EXTERNAL_SCHEME_RE = /^(https?:\/\/|mailto:|tel:)/i;

export async function open(path: string, openWith?: string): Promise<void> {
  const target = String(path || "").trim();
  if (!target) {
    return;
  }
  if (EXTERNAL_SCHEME_RE.test(target)) {
    await shellOpenExternal(target);
    return;
  }
  const normalized = normalizeLocalFilePath(target);
  if (isLocalFilePath(normalized)) {
    await shellOpenPath(normalized);
    return;
  }
  await shellOpen(target, openWith);
}

export const openPath = async (path: string) => shellOpenPath(String(path || ""));

export const showItemInFolder = async (path: string) =>
  shellShowItemInFolder(String(path || ""));

export const trashItem = async (path: string) =>
  shellTrashItem(String(path || ""));

export const openExternal = async (url: string) => {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }
  if (isRemoteServiceRuntime()) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }
  return shellOpenExternal(target);
};

export const beep = async () => shellBeep();

import {
  beep,
  open,
  openExternal,
  openPath,
  showItemInFolder,
  trashItem,
} from "../../../remote-service-compat-shell-shim";
import { isRemoteServiceRuntime } from "../runtime";
import { listHostDir } from "./fs";

const resolveParentPath = (value: string): string => {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/]+$/, "");
  if (!normalized) {
    return "";
  }

  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  if (separatorIndex < 0) {
    return "";
  }
  if (separatorIndex === 0) {
    return normalized.slice(0, 1);
  }
  if (separatorIndex === 2 && /^[A-Za-z]:[\\/]/.test(normalized)) {
    return normalized.slice(0, 3);
  }
  return normalized.slice(0, separatorIndex);
};

const isHostDirectory = async (path: string): Promise<boolean> => {
  try {
    await listHostDir(path);
    return true;
  } catch {
    return false;
  }
};

export const openHostShell = async (
  path: string,
  openWith?: string,
): Promise<void> => open(path, openWith);

export const openHostPath = async (path: string): Promise<void> => {
  await openPath(path);
};

export const openHostDirectoryTarget = async (
  path: string,
): Promise<void> => {
  const target = String(path || "").trim();
  if (!target) {
    return;
  }

  if (await isHostDirectory(target)) {
    await openPath(target);
    return;
  }

  const parentPath = resolveParentPath(target);
  if (parentPath && (await isHostDirectory(parentPath))) {
    await openPath(parentPath);
    return;
  }

  await openPath(target);
};

export const showHostItemInFolder = async (path: string): Promise<void> => {
  await showItemInFolder(path);
};

export const trashHostItem = async (path: string): Promise<void> => {
  await trashItem(path);
};

export const openHostExternal = async (url: string): Promise<void> => {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  if (isRemoteServiceRuntime()) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  await openExternal(target);
};

export const beepHostShell = async (): Promise<void> => {
  await beep();
};

import { invoke } from "../../../runtime";
import {
  browseDialog,
  createDir,
  homeDir,
  joinPath,
  listDir,
  pickFiles,
  pickFolder,
  pickSavePath,
  readFile,
  removeEntry,
  renameEntry,
  touchFile,
  writeFile,
} from "../../../remote-service-host-fs-shim";

export interface PickHostFolderOptions {
  title?: string;
  defaultPath?: string;
}

export interface HostFileFilter {
  name: string;
  extensions: string[];
}

export interface HostFilePickerOptions {
  multiple?: boolean;
  title?: string;
  directory?: string;
  filters?: HostFileFilter[];
}

export interface HostSaveFileOptions {
  title?: string;
  suggestedName?: string;
  directory?: string;
  filters?: HostFileFilter[];
}

export interface HostPickFolderOptions {
  title?: string;
  directory?: string;
}

export interface HostPickedFile {
  path: string;
  name: string;
  size: number;
  mime: string;
  lastModified?: number | null;
}

export interface HostReadFilePayload {
  path: string;
  name: string;
  size: number;
  mime: string;
  lastModified?: number | null;
  dataBase64: string;
}

export interface HostPickedFolder {
  path: string;
  name: string;
}

export interface HostSaveFileMeta {
  path: string;
  name: string;
}

export interface HostDirEntry {
  name: string;
  path: string;
  kind: string;
  size: number;
  mime: string;
  lastModified?: number | null;
}

export interface HostBrowseDialogRequest {
  path?: string;
}

export interface HostBrowseDialogPayload {
  currentPath: string;
  parentPath?: string | null;
  fileName?: string | null;
  roots: HostPickedFolder[];
  entries: HostDirEntry[];
}

export interface HostWriteFileRequest {
  path: string;
  dataBase64: string;
}

const normalizePickedPath = (value: string | null | undefined): string | null => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

export const pickHostFolder = async (
  options: PickHostFolderOptions = {},
): Promise<string | null> => {
  const selected = await pickFolder({
    title: options.title,
    directory: options.defaultPath,
  });
  const folder = selected as HostPickedFolder | string | null;
  return normalizePickedPath(
    typeof folder === "string" ? folder : folder?.path,
  );
};

export const pickGitRepoFolder = async (
  options: PickHostFolderOptions = {},
): Promise<string | null> => {
  const path = await pickHostFolder(options);
  if (!path) {
    return null;
  }

  const isValidRepo = await invoke<boolean>("validate_git_repo", {
    repoPath: path,
  });
  if (!isValidRepo) {
    throw new Error("请选择有效的 Git 仓库目录");
  }

  return path;
};

export const pickHostFiles = async (
  options: HostFilePickerOptions = {},
): Promise<HostPickedFile[]> =>
  pickFiles(options) as Promise<HostPickedFile[]>;

export const readHostFile = async (
  path: string,
): Promise<HostReadFilePayload> =>
  readFile(path) as Promise<HostReadFilePayload>;

export const pickHostSavePath = async (
  options: HostSaveFileOptions = {},
): Promise<HostSaveFileMeta | null> =>
  pickSavePath(options) as Promise<HostSaveFileMeta | null>;

export const pickHostFolderEntry = async (
  options: HostPickFolderOptions = {},
): Promise<HostPickedFolder | null> =>
  pickFolder(options) as Promise<HostPickedFolder | null>;

export const writeHostFile = async (
  request: HostWriteFileRequest,
): Promise<void> => writeFile(request) as Promise<void>;

export const listHostDir = async (path: string): Promise<HostDirEntry[]> =>
  listDir(path) as Promise<HostDirEntry[]>;

export const browseHostDialog = async (
  request: HostBrowseDialogRequest = {},
): Promise<HostBrowseDialogPayload> =>
  browseDialog(request) as Promise<HostBrowseDialogPayload>;

export const homeHostDir = async (): Promise<string> => homeDir();

export const joinHostPath = async (...parts: string[]): Promise<string> =>
  joinPath(...parts);

export const createHostDir = async (path: string): Promise<void> =>
  createDir(path) as Promise<void>;

export const touchHostFile = async (path: string): Promise<void> =>
  touchFile(path) as Promise<void>;

export const removeHostEntry = async (
  path: string,
  recursive?: boolean,
): Promise<void> => removeEntry(path, recursive) as Promise<void>;

export const renameHostEntry = async (
  from: string,
  to: string,
): Promise<void> => renameEntry(from, to) as Promise<void>;

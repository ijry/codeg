import { invoke } from "./runtime";

const remoteServiceCommand = (command: string) =>
  `plugin:remote-service|${command}`;

export const pickFiles = (options: unknown = {}) =>
  invoke(remoteServiceCommand("remote_service_pick_files"), { options });

export const readFile = (path: string) =>
  invoke(remoteServiceCommand("remote_service_read_file"), {
    path: String(path || ""),
  });

export const pickSavePath = (options: unknown = {}) =>
  invoke(remoteServiceCommand("remote_service_pick_save_path"), { options });

export const pickFolder = (options: unknown = {}) =>
  invoke(remoteServiceCommand("remote_service_pick_folder"), { options });

export const writeFile = (request: unknown) =>
  invoke(remoteServiceCommand("remote_service_write_file"), { request });

export const listDir = (path: string) =>
  invoke(remoteServiceCommand("remote_service_list_dir"), {
    path: String(path || ""),
  });

export const browseDialog = (request: unknown = {}) =>
  invoke(remoteServiceCommand("remote_service_browse_dialog"), { request });

export const homeDir = () => invoke<string>(remoteServiceCommand("remote_service_home_dir"));

export const joinPath = (...parts: unknown[]) => {
  const normalized =
    parts.length === 1 && Array.isArray(parts[0]) ? parts[0] : parts;
  return invoke<string>(remoteServiceCommand("remote_service_join_path"), {
    parts: normalized,
  });
};

export const createDir = (path: string) =>
  invoke(remoteServiceCommand("remote_service_create_dir"), {
    path: String(path || ""),
  });

export const touchFile = (path: string) =>
  invoke(remoteServiceCommand("remote_service_touch_file"), {
    path: String(path || ""),
  });

export const removeEntry = (path: string, recursive?: boolean) =>
  invoke(remoteServiceCommand("remote_service_remove_entry"), {
    path: String(path || ""),
    recursive: Boolean(recursive),
  });

export const renameEntry = (from: string, to: string) =>
  invoke(remoteServiceCommand("remote_service_rename_entry"), {
    request: {
      from: String(from || ""),
      to: String(to || ""),
    },
  });

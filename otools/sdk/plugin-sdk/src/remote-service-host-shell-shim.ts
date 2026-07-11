import { invoke } from "./runtime";

const remoteServiceCommand = (command: string) =>
  `plugin:remote-service|${command}`;

export const shellOpen = (path: string, openWith?: string) =>
  invoke(remoteServiceCommand("remote_service_shell_open"), {
    request: {
      path: String(path || ""),
      with: openWith ? String(openWith) : undefined,
    },
  });

export const shellOpenPath = (path: string) =>
  invoke(remoteServiceCommand("remote_service_shell_open_path"), {
    path: String(path || ""),
  });

export const shellShowItemInFolder = (path: string) =>
  invoke(remoteServiceCommand("remote_service_shell_show_item_in_folder"), {
    path: String(path || ""),
  });

export const shellTrashItem = (path: string) =>
  invoke(remoteServiceCommand("remote_service_shell_trash_item"), {
    path: String(path || ""),
  });

export const shellOpenExternal = (url: string) =>
  invoke(remoteServiceCommand("remote_service_shell_open_external"), {
    url: String(url || ""),
  });

export const shellBeep = () =>
  invoke(remoteServiceCommand("remote_service_shell_beep"));

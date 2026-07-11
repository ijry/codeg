import { i as t } from "./remote-service-api-event-shim-CD-wuaHi.js";
const r = (e) => `plugin:remote-service|${e}`, o = (e, s) => t(r("remote_service_shell_open"), {
  request: {
    path: String(e || ""),
    with: s ? String(s) : void 0
  }
}), n = (e) => t(r("remote_service_shell_open_path"), {
  path: String(e || "")
}), _ = (e) => t(r("remote_service_shell_show_item_in_folder"), {
  path: String(e || "")
}), h = (e) => t(r("remote_service_shell_trash_item"), {
  path: String(e || "")
}), i = (e) => t(r("remote_service_shell_open_external"), {
  url: String(e || "")
}), m = () => t(r("remote_service_shell_beep"));
export {
  m as shellBeep,
  o as shellOpen,
  i as shellOpenExternal,
  n as shellOpenPath,
  _ as shellShowItemInFolder,
  h as shellTrashItem
};
//# sourceMappingURL=remote-service-host-shell-shim.js.map

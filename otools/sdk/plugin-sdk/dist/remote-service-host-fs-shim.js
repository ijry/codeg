import { i as r } from "./remote-service-api-event-shim-CD-wuaHi.js";
const t = (e) => `plugin:remote-service|${e}`, c = (e = {}) => r(t("remote_service_pick_files"), { options: e }), _ = (e) => r(t("remote_service_read_file"), {
  path: String(e || "")
}), s = (e = {}) => r(t("remote_service_pick_save_path"), { options: e }), n = (e = {}) => r(t("remote_service_pick_folder"), { options: e }), m = (e) => r(t("remote_service_write_file"), { request: e }), a = (e) => r(t("remote_service_list_dir"), {
  path: String(e || "")
}), v = (e = {}) => r(t("remote_service_browse_dialog"), { request: e }), l = () => r(t("remote_service_home_dir")), h = (...e) => {
  const i = e.length === 1 && Array.isArray(e[0]) ? e[0] : e;
  return r(t("remote_service_join_path"), {
    parts: i
  });
}, p = (e) => r(t("remote_service_create_dir"), {
  path: String(e || "")
}), g = (e) => r(t("remote_service_touch_file"), {
  path: String(e || "")
}), d = (e, i) => r(t("remote_service_remove_entry"), {
  path: String(e || ""),
  recursive: !!i
}), S = (e, i) => r(t("remote_service_rename_entry"), {
  request: {
    from: String(e || ""),
    to: String(i || "")
  }
});
export {
  v as browseDialog,
  p as createDir,
  l as homeDir,
  h as joinPath,
  a as listDir,
  c as pickFiles,
  n as pickFolder,
  s as pickSavePath,
  _ as readFile,
  d as removeEntry,
  S as renameEntry,
  g as touchFile,
  m as writeFile
};
//# sourceMappingURL=remote-service-host-fs-shim.js.map

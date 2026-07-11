import { buildRemoteFileUrl as p, isLocalFilePath as c, normalizeLocalFilePath as h } from "../../remote-service-compat-file-shim.js";
import { beep as F, open as P, openExternal as d, openPath as x, showItemInFolder as f, trashItem as k } from "../../remote-service-compat-shell-shim.js";
import { browseDialog as v, createDir as D, homeDir as b, joinPath as w, listDir as E, pickFiles as I, pickFolder as R, pickSavePath as y, readFile as C, removeEntry as L, renameEntry as S, touchFile as g, writeFile as j } from "../../remote-service-host-fs-shim.js";
let e = null;
const i = () => (e || (e = import("../../remote-service-api-core-shim.js")), e), n = (o, r, l) => i().then(
  ({ invoke: t }) => t(o, r)
);
export {
  F as beep,
  v as browseDialog,
  p as buildRemoteFileUrl,
  D as createDir,
  b as homeDir,
  n as invokeRemoteService,
  c as isLocalFilePath,
  w as joinPath,
  E as listDir,
  h as normalizeLocalFilePath,
  P as open,
  d as openExternal,
  x as openPath,
  I as pickFiles,
  R as pickFolder,
  y as pickSavePath,
  C as readFile,
  L as removeEntry,
  S as renameEntry,
  f as showItemInFolder,
  g as touchFile,
  k as trashItem,
  j as writeFile
};
//# sourceMappingURL=remoteServiceBridge.js.map

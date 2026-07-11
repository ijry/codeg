import { i as n } from "../../../remote-service-api-event-shim-CD-wuaHi.js";
import { browseDialog as i, createDir as r, homeDir as c, joinPath as a, listDir as l, pickFiles as y, pickFolder as s, pickSavePath as p, readFile as d, removeEntry as h, renameEntry as m, touchFile as H, writeFile as F } from "../../../remote-service-host-fs-shim.js";
const k = (t) => String(t || "").trim() || null, u = async (t = {}) => {
  const e = await s({
    title: t.title,
    directory: t.defaultPath
  });
  return k(
    typeof e == "string" ? e : e?.path
  );
}, P = async (t = {}) => {
  const o = await u(t);
  if (!o)
    return null;
  if (!await n("validate_git_repo", {
    repoPath: o
  }))
    throw new Error("请选择有效的 Git 仓库目录");
  return o;
}, f = async (t = {}) => y(t), v = async (t) => d(t), E = async (t = {}) => p(t), g = async (t = {}) => s(t), z = async (t) => F(t), R = async (t) => l(t), S = async (t = {}) => i(t), b = async () => c(), j = async (...t) => a(...t), G = async (t) => r(t), V = async (t) => H(t), _ = async (t, o) => h(t, o), x = async (t, o) => m(t, o);
export {
  S as browseHostDialog,
  G as createHostDir,
  b as homeHostDir,
  j as joinHostPath,
  R as listHostDir,
  P as pickGitRepoFolder,
  f as pickHostFiles,
  u as pickHostFolder,
  g as pickHostFolderEntry,
  E as pickHostSavePath,
  v as readHostFile,
  _ as removeHostEntry,
  x as renameHostEntry,
  V as touchHostFile,
  z as writeHostFile
};
//# sourceMappingURL=fs.js.map

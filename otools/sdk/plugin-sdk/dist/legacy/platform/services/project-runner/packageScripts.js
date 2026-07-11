import { hostInvoke as c } from "../../transport/hostBridge.js";
const s = ["dev", "build"], p = (e, n) => {
  const r = s.indexOf(e), t = s.indexOf(n), o = r !== -1, i = t !== -1;
  return o && i ? r - t : o ? -1 : i ? 1 : e.localeCompare(n);
}, a = async (e) => c("project_runner_read_scripts", {
  workingDir: e
}), f = (e) => {
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const t = (r.name.split(":")[0] || r.name).trim() || r.name, o = n.get(t) || [];
    o.push(r), n.set(t, o);
  }
  return Array.from(n.entries()).map(([r, t]) => ({
    prefix: r,
    items: [...t].sort((o, i) => o.name.localeCompare(i.name))
  })).sort((r, t) => p(r.prefix, t.prefix));
}, u = (e, n) => `${n || "npm run "}${e}`.trim();
export {
  u as buildProjectScriptCommand,
  f as groupProjectScripts,
  a as readProjectScripts
};
//# sourceMappingURL=packageScripts.js.map

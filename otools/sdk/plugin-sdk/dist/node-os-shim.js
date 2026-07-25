import { r as t, a as o, b as s } from "./node-compat-core-ibTnNoud.js";
function e() {
  return t("os");
}
const n = e()?.EOL ?? `
`, r = () => e()?.arch?.() ?? "unknown", a = () => e()?.cpus?.() ?? [], m = () => e()?.endianness?.() ?? "LE", c = () => e()?.freemem?.() ?? 0, d = () => e()?.homedir?.() ?? o()?.__OToolsEnv?.paths?.home ?? "", p = () => e()?.hostname?.() ?? "", i = () => e()?.platform?.() ?? s(), l = () => e()?.release?.() ?? "", h = () => e()?.tmpdir?.() ?? o()?.__OToolsEnv?.paths?.temp ?? "", u = () => e()?.totalmem?.() ?? 0, f = () => e()?.type?.() ?? "Browser", E = {
  EOL: n,
  arch: r,
  cpus: a,
  endianness: m,
  freemem: c,
  homedir: d,
  hostname: p,
  platform: i,
  release: l,
  tmpdir: h,
  totalmem: u,
  type: f
};
export {
  n as EOL,
  r as arch,
  a as cpus,
  E as default,
  m as endianness,
  c as freemem,
  d as homedir,
  p as hostname,
  i as platform,
  l as release,
  h as tmpdir,
  u as totalmem,
  f as type
};
//# sourceMappingURL=node-os-shim.js.map

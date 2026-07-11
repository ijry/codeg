import { homeDir as a } from "./remote-service-host-fs-shim.js";
const r = async (...o) => {
  const { joinPath: t } = await import("./remote-service-host-fs-shim.js");
  return t(...o);
};
export {
  a as homeDir,
  r as join
};
//# sourceMappingURL=remote-service-compat-path-shim.js.map

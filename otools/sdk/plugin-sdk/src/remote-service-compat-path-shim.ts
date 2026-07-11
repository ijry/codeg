export { homeDir } from "./remote-service-host-fs-shim";

export const join = async (...parts: unknown[]) => {
  const { joinPath } = await import("./remote-service-host-fs-shim");
  return joinPath(...parts);
};

export { invoke } from "./runtime";
export { emit, listen, once } from "./runtime";
export {
  hasHostBridgeRuntime,
  isNativeTauriRuntime,
  isRemoteServiceRuntime,
} from "./remote-service-runtime-shim";
export {
  createOtoolsWebFacade,
  installOtoolsWebRuntime,
  type OtoolsWebRuntimeOptions,
} from "./remote-service-otools-web-shim";

export const init = async () => undefined;
export const disconnect = () => undefined;
export const ensureConnected = async () => undefined;
export const sendRpc = <T = unknown>(
  command: string,
  args?: Record<string, unknown>,
  _options?: unknown,
) => import("./runtime").then(({ invoke }) => invoke<T>(command, args));

export { invoke } from './runtime';
export { emit, listen, once } from './runtime';
export { hasHostBridgeRuntime, isNativeTauriRuntime, isRemoteServiceRuntime, } from './remote-service-runtime-shim';
export { createOtoolsWebFacade, installOtoolsWebRuntime, type OtoolsWebRuntimeOptions, } from './remote-service-otools-web-shim';
export declare const init: () => Promise<undefined>;
export declare const disconnect: () => undefined;
export declare const ensureConnected: () => Promise<undefined>;
export declare const sendRpc: <T = unknown>(command: string, args?: Record<string, unknown>, _options?: unknown) => Promise<T>;

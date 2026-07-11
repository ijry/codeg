export type InvokeArgs = Record<string, unknown> | undefined;
export type HostUnlistenFn = () => void | Promise<void>;
export type HostEventTarget = string | {
    kind: string;
    label?: string;
};
export interface HostBridgeConfig {
    includeAncestors?: boolean;
}
export interface HostListenOptions extends HostBridgeConfig {
    target?: HostEventTarget;
}
type NativeInvokeFn = (command: string, args?: InvokeArgs, options?: unknown) => Promise<unknown>;
type NativeConvertFileSrcFn = (value: string, protocol?: string) => string;
type NativeTransformCallbackFn = (callback?: unknown, once?: boolean) => number;
type NativeUnregisterCallbackFn = (id: number) => void;
type NativeUnregisterListenerFn = (event: string, eventId: number) => void;
interface NativeTauriContext {
    invoke?: NativeInvokeFn;
    convertFileSrc?: NativeConvertFileSrcFn;
    transformCallback?: NativeTransformCallbackFn;
    unregisterCallback?: NativeUnregisterCallbackFn;
    unregisterListener?: NativeUnregisterListenerFn;
}
export declare const resolveNativeTauriContext: (config?: HostBridgeConfig) => NativeTauriContext | null;
export declare const isNativeTauriRuntime: (config?: HostBridgeConfig) => boolean;
export declare const isRemoteServiceRuntime: () => boolean;
export declare const hasHostBridgeRuntime: (config?: HostBridgeConfig) => boolean;
export declare const hostInvoke: <T = unknown>(command: string, args?: InvokeArgs, options?: unknown, config?: HostBridgeConfig) => Promise<T>;
export declare const hostConvertFileSrc: (value: string, protocol?: string, config?: HostBridgeConfig) => string;
export declare const createNativeCallbackChannel: <T = unknown>(callback?: (payload: T) => void, once?: boolean, config?: HostBridgeConfig) => number;
export declare const unregisterNativeCallbackChannel: (id: number, config?: HostBridgeConfig) => void;
export declare const unregisterNativeEventListener: (event: string, eventId: number, config?: HostBridgeConfig) => Promise<void>;
export declare const hostListen: <T = unknown>(event: string, handler: (payload: {
    event: string;
    id: number | string;
    payload: T;
}) => void, options?: HostListenOptions) => Promise<HostUnlistenFn>;
export declare const hostOnce: <T = unknown>(event: string, handler: (payload: {
    event: string;
    id: number | string;
    payload: T;
}) => void, options?: HostListenOptions) => Promise<HostUnlistenFn>;
export declare const hostEmit: (event: string, payload?: unknown, config?: HostBridgeConfig) => Promise<void>;
export {};

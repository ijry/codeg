import { OToolsAPI } from './otools-globals';
type InvokePayload = unknown;
export declare const getOtoolsApi: () => OToolsAPI | undefined;
export declare const isOtoolsPluginRuntime: () => boolean;
export declare function invoke<T = unknown>(command: string, payload?: InvokePayload): Promise<T>;
export interface Event<T> {
    event: string;
    id: number;
    payload: T;
}
export type UnlistenFn = () => Promise<void> | void;
export declare function listen<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
export declare function emit<T = unknown>(event: string, payload?: T): Promise<void>;
export declare function once<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
export declare function openExternal(url: string): boolean;
export declare function openPath(fullPath: string): boolean;
export {};

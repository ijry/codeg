export type NoderRequire = ((specifier: string) => unknown) & {
    resolve?: (specifier: string) => string;
};
export type NoderWindow = Window & {
    __OTOOLS_NODER__?: {
        require?: NoderRequire;
    };
    __OToolsEnv?: {
        appName?: string;
        appVersion?: string;
        isDev?: boolean;
        paths?: Record<string, string>;
        platform?: string;
        processEnv?: Record<string, string>;
    };
};
export declare function runtimeWindow(): NoderWindow | null;
export declare function readNoderModule<T = Record<string, unknown>>(specifier: string): T | null;
export declare function readRuntimePlatform(): "linux" | "darwin" | "win32" | "browser";
export declare function slashNormalize(path: unknown): string;
export declare function isAbsolutePath(path: unknown): boolean;
export declare function dirname(path: unknown): string;
export declare function basename(path: unknown, ext?: string): string;
export declare function extname(path: unknown): string;
export declare function normalizePath(...parts: unknown[]): string;
export declare function joinPath(...parts: unknown[]): string;
export declare function resolvePath(...parts: unknown[]): string;
export declare function relativePath(from: unknown, to: unknown): string;
export declare class CompatEventEmitter {
    private readonly buckets;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
    addListener(event: string | symbol, listener: (...args: unknown[]) => void): this;
    once(event: string | symbol, listener: (...args: unknown[]) => void): this;
    off(event: string | symbol, listener: (...args: unknown[]) => void): this;
    removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string | symbol): this;
    emit(event: string | symbol, ...args: unknown[]): boolean;
    listeners(event: string | symbol): ((...args: unknown[]) => void)[];
    listenerCount(event: string | symbol): number;
    eventNames(): (string | symbol)[];
}

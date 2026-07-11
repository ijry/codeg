export type OToolsPlatform = "macos" | "windows" | "linux" | "unknown";
export interface OToolsDialogFilter {
    name: string;
    extensions: string[];
}
export interface OToolsDialogButtons {
    ok?: string;
}
export interface OToolsDialogOpenOptions {
    directory?: boolean;
    multiple?: boolean;
    title?: string;
    defaultPath?: string;
    filters?: OToolsDialogFilter[];
}
export interface OToolsDialogSaveOptions {
    title?: string;
    defaultPath?: string;
    filters?: OToolsDialogFilter[];
}
export interface OToolsDialogMessageOptions {
    title?: string;
    kind?: "info" | "warning" | "error";
    okLabel?: string;
    buttons?: OToolsDialogButtons;
}
export interface OToolsDialogConfirmOptions extends OToolsDialogMessageOptions {
    cancelLabel?: string;
}
export interface OToolsDialogAPI {
    open(options?: OToolsDialogOpenOptions): Promise<string | string[] | null>;
    save(options?: OToolsDialogSaveOptions): Promise<string | null>;
    message(messageText: string, options?: string | OToolsDialogMessageOptions): Promise<void>;
    confirm(messageText: string, options?: string | OToolsDialogConfirmOptions): Promise<boolean>;
    ask(messageText: string, options?: string | OToolsDialogConfirmOptions): Promise<boolean>;
}
export interface OToolsShellAPI {
    open?(path: string, openWith?: string): Promise<void>;
    openPath?(fullPath: string): Promise<void>;
    showItemInFolder?(fullPath: string): Promise<void>;
    trashItem?(fullPath: string): Promise<void>;
    openExternal?(url: string): Promise<void>;
    beep?(): Promise<void>;
}
export interface OToolsRuntimeAPI {
    dialog?: OToolsDialogAPI | null;
    shell?: OToolsShellAPI | null;
}
export interface OToolsEnv {
    appName?: string;
    appVersion?: string;
    nativeId?: string;
    pluginUuid?: string;
    platform?: OToolsPlatform | string;
    isDev?: boolean;
    currentFolderPath?: string;
    currentBrowserUrl?: string;
    paths?: Record<string, string>;
}
export interface OToolsAPI {
    isDev(): boolean;
    isMacOS(): boolean;
    isWindows(): boolean;
    isLinux(): boolean;
    getAppName?(): string;
    getAppVersion?(): string;
    getPluginUuid?(): string;
    invokeNative<T = unknown>(method: string, payload?: unknown): Promise<T>;
    invokeNativePlugin?<T = unknown>(uuid: string, method: string, payload?: unknown): Promise<T>;
    invokeNativeRaw<T = unknown>(method: string, payload?: unknown): Promise<T>;
    reloadNative(): Promise<unknown>;
    probeNative(): Promise<unknown>;
    shellOpen?(path: string, openWith?: string): Promise<void>;
    shellOpenExternal(url: string): void;
    shellOpenPath(fullPath: string): void;
    shellShowItemInFolder?(fullPath: string): void;
    listenNative?(handler: (event: {
        event?: string;
        id?: number;
        payload?: {
            topic?: string;
            payload?: unknown;
        };
    } | unknown) => void, options?: unknown): Promise<() => Promise<void> | void>;
    getPluginLocalState<T = unknown>(plugin?: string, scheme?: string | null): Promise<T | null>;
    savePluginLocalState(plugin?: string, state?: unknown, scheme?: string | null): Promise<void>;
    getPluginLocalStateValue<T = unknown>(plugin?: string, key?: string, scheme?: string | null): Promise<T | null>;
    savePluginLocalStateValue(plugin?: string, key?: string, value?: unknown, scheme?: string | null): Promise<void>;
    patchPluginLocalState(plugin?: string, patch?: Record<string, unknown>, scheme?: string | null): Promise<void>;
    runtime?: OToolsRuntimeAPI;
    dialog?: OToolsDialogAPI;
    shell?: OToolsShellAPI;
}
export interface TauriInternals {
    invoke<T = unknown>(command: string, payload?: Record<string, unknown>, options?: unknown): Promise<T>;
    transformCallback?(callback: (response: {
        payload?: unknown;
    } | unknown) => void, once?: boolean): number;
    unregisterCallback?(id: number): void;
    convertFileSrc?(filePath: string, protocol?: string): string;
}
export interface TauriEventPluginInternals {
    unregisterListener(event: string, eventId: number): void;
}
declare global {
    interface Window {
        otools?: OToolsAPI;
        utools?: OToolsAPI;
        __OToolsEnv?: OToolsEnv;
        __TAURI_INTERNALS__?: TauriInternals;
        __TAURI_EVENT_PLUGIN_INTERNALS__: TauriEventPluginInternals;
        __TAURI_REMOTE_SERVICE__?: boolean;
        __OTOOLS_REMOTE_SERVICE__?: boolean;
    }
}

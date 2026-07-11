import { Event, UnlistenFn } from './runtime';
import { getCurrentWindow } from './tauri-window-shim';
export type WebviewWindowOptions = {
    url?: string;
    title?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    center?: boolean;
    focus?: boolean;
    resizable?: boolean;
    decorations?: boolean;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    hiddenTitle?: boolean;
    titleBarStyle?: string;
    trafficLightPosition?: unknown;
};
export declare class WebviewWindow {
    readonly label: string;
    private childWindow;
    private pendingError;
    constructor(label: string, options?: WebviewWindowOptions);
    static getByLabel(_label: string): Promise<WebviewWindow | null>;
    static getAll(): Promise<WebviewWindow[]>;
    listen<T>(eventName: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    once<T>(eventName: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    emit<T>(eventName: string, payload?: T): Promise<void>;
    close(): Promise<void>;
    hide(): Promise<void>;
    show(): Promise<void>;
    setFocus(): Promise<void>;
    setAlwaysOnTop(_alwaysOnTop: boolean): Promise<void>;
    setVisibleOnAllWorkspaces(_visible: boolean): Promise<void>;
    setPosition(_position: unknown): Promise<void>;
    setSize(_size: unknown): Promise<void>;
    setTitle(title: string): Promise<void>;
    innerSize(): Promise<{
        width: number;
        height: number;
    }>;
    outerSize(): Promise<{
        width: number;
        height: number;
    }>;
}
export declare function getCurrentWebviewWindow(): ReturnType<typeof getCurrentWindow>;
export declare function getAllWebviewWindows(): Promise<WebviewWindow[]>;

type Listener = (...args: unknown[]) => void;
declare class EventEmitter {
    private readonly listeners;
    on(event: string, listener: Listener): this;
    once(event: string, listener: Listener): this;
    off(event: string, listener: Listener): this;
    removeListener(event: string, listener: Listener): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: unknown[]): boolean;
}
declare class NativeImage {
    private readonly dataUrl;
    constructor(dataUrl?: string);
    isEmpty(): boolean;
    getSize(): {
        width: number;
        height: number;
    };
    toDataURL(): string;
    toPNG(): Uint8Array<ArrayBuffer>;
    toJPEG(): Uint8Array<ArrayBuffer>;
    resize(): NativeImage;
    crop(): NativeImage;
}
declare class FallbackBrowserWindow extends EventEmitter {
    readonly id: number;
    readonly webContents: EventEmitter & {
        getURL: () => string;
        reload: () => void;
        send: () => undefined;
    };
    static getFocusedWindow(): FallbackBrowserWindow;
    static getAllWindows(): FallbackBrowserWindow[];
    show(): void;
    hide(): void;
    focus(): void;
    close(): void;
    isDestroyed(): boolean;
    isVisible(): boolean;
}
declare class FallbackMenu {
    static buildFromTemplate(template: unknown[]): {
        items: unknown[];
        popup: () => undefined;
    };
}
declare class FallbackNotification extends EventEmitter {
    static isSupported(): boolean;
    show(): void;
}
declare class FallbackTray extends EventEmitter {
}
declare const electronProxy: Record<PropertyKey, unknown>;
export declare const app: EventEmitter & {
    isReady: () => true;
    whenReady: () => Promise<void>;
    getName: () => string;
    getVersion: () => string;
    getAppPath: () => string;
    getPath: (name: string) => string;
    getLocale: () => string;
    quit: () => void | undefined;
    exit: () => void | undefined;
};
export declare const BrowserWindow: typeof FallbackBrowserWindow;
export declare const clipboard: {
    availableFormats: () => string[];
    clear: () => void;
    readText: () => string;
    writeText: (text: string) => void;
    readHTML: () => string;
    writeHTML: () => undefined;
    readImage: () => NativeImage;
    writeImage: (image: {
        toDataURL?: () => string;
        isEmpty?: () => boolean;
    }) => void;
};
export declare const contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => void;
};
export declare const dialog: {
    showOpenDialog: () => Promise<{
        canceled: boolean;
        filePaths: never[];
    }>;
    showOpenDialogSync: () => undefined;
    showSaveDialog: () => Promise<{
        canceled: boolean;
        filePath: undefined;
    }>;
    showSaveDialogSync: () => undefined;
    showMessageBox: () => Promise<{
        response: number;
        checkboxChecked: boolean;
    }>;
    showMessageBoxSync: () => number;
    showErrorBox: (title: string, content: string) => void;
};
export declare const globalShortcut: {
    isRegistered: () => boolean;
    register: () => boolean;
    registerAll: () => undefined;
    unregister: () => undefined;
    unregisterAll: () => undefined;
};
export declare const ipcMain: EventEmitter;
export declare const ipcRenderer: EventEmitter & {
    invoke: () => Promise<null>;
    send: () => undefined;
    sendSync: () => null;
    postMessage: () => undefined;
    sendToHost: () => undefined;
};
export declare const Menu: typeof FallbackMenu;
export declare const nativeImage: {
    NativeImage: typeof NativeImage;
    createEmpty: () => NativeImage;
    createFromBitmap: () => NativeImage;
    createFromBuffer: () => NativeImage;
    createFromDataURL: (dataUrl: string) => NativeImage;
    createFromNamedImage: () => NativeImage;
    createFromPath: () => NativeImage;
};
export declare const nativeTheme: EventEmitter & {
    shouldUseDarkColors: boolean;
    themeSource: string;
};
export declare const Notification: typeof FallbackNotification;
export declare const powerMonitor: EventEmitter;
export declare const remote: unknown;
export declare const screen: {
    getCursorScreenPoint: () => {
        x: number;
        y: number;
    };
    getPrimaryDisplay: () => {
        id: number;
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        workArea: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        scaleFactor: number;
    };
    getAllDisplays: () => {
        id: number;
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        workArea: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        scaleFactor: number;
    }[];
};
export declare const shell: {
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<string>;
    showItemInFolder: (path: string) => void;
    trashItem: (path: string) => Promise<void>;
    moveItemToTrash: (path: string) => Promise<void>;
    beep: () => void;
};
export declare const systemPreferences: {
    getAccentColor: () => string;
    getColor: () => string;
    getEffectiveAppearance: () => string;
    isDarkMode: () => boolean;
};
export declare const Tray: typeof FallbackTray;
export declare const webFrame: {
    getZoomFactor: () => number;
    setZoomFactor: () => undefined;
    getZoomLevel: () => number;
    setZoomLevel: () => undefined;
};
export default electronProxy;

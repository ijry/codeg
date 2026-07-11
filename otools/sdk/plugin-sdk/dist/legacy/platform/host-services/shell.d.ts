export declare const openHostShell: (path: string, openWith?: string) => Promise<void>;
export declare const openHostPath: (path: string) => Promise<void>;
export declare const openHostDirectoryTarget: (path: string) => Promise<void>;
export declare const showHostItemInFolder: (path: string) => Promise<void>;
export declare const trashHostItem: (path: string) => Promise<void>;
export declare const openHostExternal: (url: string) => Promise<void>;
export declare const beepHostShell: () => Promise<void>;

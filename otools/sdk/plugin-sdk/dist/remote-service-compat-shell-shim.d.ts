export declare function open(path: string, openWith?: string): Promise<void>;
export declare const openPath: (path: string) => Promise<unknown>;
export declare const showItemInFolder: (path: string) => Promise<unknown>;
export declare const trashItem: (path: string) => Promise<unknown>;
export declare const openExternal: (url: string) => Promise<unknown>;
export declare const beep: () => Promise<unknown>;

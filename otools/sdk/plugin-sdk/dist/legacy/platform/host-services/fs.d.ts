export interface PickHostFolderOptions {
    title?: string;
    defaultPath?: string;
}
export interface HostFileFilter {
    name: string;
    extensions: string[];
}
export interface HostFilePickerOptions {
    multiple?: boolean;
    title?: string;
    directory?: string;
    filters?: HostFileFilter[];
}
export interface HostSaveFileOptions {
    title?: string;
    suggestedName?: string;
    directory?: string;
    filters?: HostFileFilter[];
}
export interface HostPickFolderOptions {
    title?: string;
    directory?: string;
}
export interface HostPickedFile {
    path: string;
    name: string;
    size: number;
    mime: string;
    lastModified?: number | null;
}
export interface HostReadFilePayload {
    path: string;
    name: string;
    size: number;
    mime: string;
    lastModified?: number | null;
    dataBase64: string;
}
export interface HostPickedFolder {
    path: string;
    name: string;
}
export interface HostSaveFileMeta {
    path: string;
    name: string;
}
export interface HostDirEntry {
    name: string;
    path: string;
    kind: string;
    size: number;
    mime: string;
    lastModified?: number | null;
}
export interface HostBrowseDialogRequest {
    path?: string;
}
export interface HostBrowseDialogPayload {
    currentPath: string;
    parentPath?: string | null;
    fileName?: string | null;
    roots: HostPickedFolder[];
    entries: HostDirEntry[];
}
export interface HostWriteFileRequest {
    path: string;
    dataBase64: string;
}
export declare const pickHostFolder: (options?: PickHostFolderOptions) => Promise<string | null>;
export declare const pickGitRepoFolder: (options?: PickHostFolderOptions) => Promise<string | null>;
export declare const pickHostFiles: (options?: HostFilePickerOptions) => Promise<HostPickedFile[]>;
export declare const readHostFile: (path: string) => Promise<HostReadFilePayload>;
export declare const pickHostSavePath: (options?: HostSaveFileOptions) => Promise<HostSaveFileMeta | null>;
export declare const pickHostFolderEntry: (options?: HostPickFolderOptions) => Promise<HostPickedFolder | null>;
export declare const writeHostFile: (request: HostWriteFileRequest) => Promise<void>;
export declare const listHostDir: (path: string) => Promise<HostDirEntry[]>;
export declare const browseHostDialog: (request?: HostBrowseDialogRequest) => Promise<HostBrowseDialogPayload>;
export declare const homeHostDir: () => Promise<string>;
export declare const joinHostPath: (...parts: string[]) => Promise<string>;
export declare const createHostDir: (path: string) => Promise<void>;
export declare const touchHostFile: (path: string) => Promise<void>;
export declare const removeHostEntry: (path: string, recursive?: boolean) => Promise<void>;
export declare const renameHostEntry: (from: string, to: string) => Promise<void>;

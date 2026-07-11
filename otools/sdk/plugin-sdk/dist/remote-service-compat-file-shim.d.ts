export declare const REMOTE_SERVICE_FILE_ROUTE = "/__tauri_remote_service_file__";
export declare const isLocalFilePath: (value: string) => boolean;
export declare const normalizeLocalFilePath: (value: string) => string;
export declare const buildRemoteFileUrl: (path: string) => string;
export declare const convertFileSrcCompat: (value: string) => Promise<string>;
export declare const convertFileSrcCompatSync: (value: string) => string;

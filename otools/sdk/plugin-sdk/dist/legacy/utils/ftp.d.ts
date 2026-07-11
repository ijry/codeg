export interface FtpConnection {
    id: string;
    name: string;
    protocol: "ftp" | "ftps-explicit";
    transferMode: "passive" | "active";
    host: string;
    port: number;
    username: string;
    password: string;
    tlsVerify: boolean;
    initialRemotePath: string;
}
export interface FtpDirectoryEntry {
    name: string;
    path: string;
    is_directory: boolean;
    size?: number | null;
    modified_time?: string | null;
}
export interface FtpTransferEvent {
    taskId: string;
    kind: "upload" | "download";
    status: "running" | "completed" | "failed";
    progress: number;
    source: string;
    target: string;
    currentItem?: string | null;
    totalFiles: number;
    completedFiles: number;
    bytesTotal: number;
    bytesTransferred: number;
    error?: string | null;
}
export declare const createFtpConnection: () => FtpConnection;
export declare const loadFtpConnections: () => FtpConnection[];
export declare const saveFtpConnections: (connections: FtpConnection[]) => void;
export declare const protocolLabel: (protocol: FtpConnection["protocol"]) => "FTPS" | "FTP";
export declare const transferModeLabel: (mode: FtpConnection["transferMode"]) => "主动" | "被动";
export declare const loadFtpLocalRoot: () => string;
export declare const saveFtpLocalRoot: (path: string) => void;
export declare const normalizeRemotePath: (path: string) => string;
export declare const parentRemotePath: (path: string) => string;
export declare const basenamePath: (path: string) => string;
export declare const parentLocalPath: (path: string) => string;
export declare const formatBytes: (bytes?: number | null) => string;
export declare const isProbablyTextFile: (path: string) => boolean;
export declare class FtpApi {
    static getDefaultLocalRoot(): Promise<string>;
    static getConnectedIds(): Promise<string[]>;
    static connect(connection: FtpConnection): Promise<void>;
    static disconnect(connectionId: string): Promise<void>;
    static listDirectory(connection: FtpConnection, path: string): Promise<FtpDirectoryEntry[]>;
    static readTextFile(connection: FtpConnection, path: string): Promise<string>;
    static writeTextFile(connection: FtpConnection, path: string, content: string): Promise<void>;
    static uploadPath(connection: FtpConnection, taskId: string, localPath: string, remoteDir: string): Promise<void>;
    static downloadPath(connection: FtpConnection, taskId: string, remotePath: string, localDir: string): Promise<void>;
    static listenTransfers(handler: (event: FtpTransferEvent) => void): Promise<import('@tauri-apps/api/event').UnlistenFn>;
}

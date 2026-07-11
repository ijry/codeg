import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const FTP_CONNECTIONS_KEY = "otools:ftp:connections";
const FTP_LOCAL_ROOT_KEY = "otools:ftp:local-root";

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

const toConfig = (connection: FtpConnection) => ({
  connection_id: connection.id,
  protocol: connection.protocol,
  transfer_mode: connection.transferMode,
  host: connection.host,
  port: connection.port,
  username: connection.username,
  password: connection.password,
  tls_verify: connection.tlsVerify,
});

export const createFtpConnection = (): FtpConnection => ({
  id: `ftp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  name: "",
  protocol: "ftp",
  transferMode: "passive",
  host: "",
  port: 21,
  username: "",
  password: "",
  tlsVerify: true,
  initialRemotePath: "/",
});

export const loadFtpConnections = (): FtpConnection[] => {
  try {
    const raw = localStorage.getItem(FTP_CONNECTIONS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(Boolean).map((item) => ({
      ...createFtpConnection(),
      ...item,
      initialRemotePath: normalizeRemotePath(item?.initialRemotePath || "/"),
    }));
  } catch (error) {
    console.error("加载 FTP 连接失败:", error);
    return [];
  }
};

export const saveFtpConnections = (connections: FtpConnection[]) => {
  localStorage.setItem(FTP_CONNECTIONS_KEY, JSON.stringify(connections));
};

export const protocolLabel = (protocol: FtpConnection["protocol"]) => {
  return protocol === "ftps-explicit" ? "FTPS" : "FTP";
};

export const transferModeLabel = (mode: FtpConnection["transferMode"]) => {
  return mode === "active" ? "主动" : "被动";
};

export const loadFtpLocalRoot = () =>
  localStorage.getItem(FTP_LOCAL_ROOT_KEY) || "";

export const saveFtpLocalRoot = (path: string) => {
  localStorage.setItem(FTP_LOCAL_ROOT_KEY, path);
};

export const normalizeRemotePath = (path: string) => {
  if (!path) {
    return "/";
  }
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "/") {
    return "/";
  }
  const withLeadingSlash = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
};

export const parentRemotePath = (path: string) => {
  const normalized = normalizeRemotePath(path);
  if (normalized === "/") {
    return "/";
  }
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return normalized.slice(0, index);
};

export const basenamePath = (path: string) => {
  if (!path) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
};

export const parentLocalPath = (path: string) => {
  if (!path) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  parts.pop();
  const parent = parts.join("/");
  return parent || normalized;
};

export const formatBytes = (bytes?: number | null) => {
  const value = Number(bytes || 0);
  if (!value) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1,
  )} ${units[index]}`;
};

const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "json",
  "js",
  "ts",
  "tsx",
  "jsx",
  "vue",
  "html",
  "css",
  "scss",
  "less",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "conf",
  "log",
  "sh",
  "py",
  "rb",
  "rs",
  "go",
  "java",
  "php",
  "sql",
  "csv",
  "env",
]);

export const isProbablyTextFile = (path: string) => {
  const extension = basenamePath(path).split(".").pop()?.toLowerCase() || "";
  return TEXT_FILE_EXTENSIONS.has(extension);
};

export class FtpApi {
  static async getDefaultLocalRoot() {
    return await invoke<string>("ftp_get_default_local_root");
  }

  static async getConnectedIds() {
    return await invoke<string[]>("ftp_get_connected_ids");
  }

  static async connect(connection: FtpConnection) {
    return await invoke<void>("ftp_connect", {
      config: toConfig(connection),
    });
  }

  static async disconnect(connectionId: string) {
    return await invoke<void>("ftp_disconnect", {
      connectionId,
    });
  }

  static async listDirectory(connection: FtpConnection, path: string) {
    return await invoke<FtpDirectoryEntry[]>("ftp_list_directory", {
      config: toConfig(connection),
      path: normalizeRemotePath(path),
    });
  }

  static async readTextFile(connection: FtpConnection, path: string) {
    return await invoke<string>("ftp_read_text_file", {
      config: toConfig(connection),
      path: normalizeRemotePath(path),
    });
  }

  static async writeTextFile(
    connection: FtpConnection,
    path: string,
    content: string,
  ) {
    return await invoke<void>("ftp_write_text_file", {
      config: toConfig(connection),
      path: normalizeRemotePath(path),
      content,
    });
  }

  static async uploadPath(
    connection: FtpConnection,
    taskId: string,
    localPath: string,
    remoteDir: string,
  ) {
    return await invoke<void>("ftp_upload_path", {
      config: toConfig(connection),
      taskId,
      localPath,
      remoteDir: normalizeRemotePath(remoteDir),
    });
  }

  static async downloadPath(
    connection: FtpConnection,
    taskId: string,
    remotePath: string,
    localDir: string,
  ) {
    return await invoke<void>("ftp_download_path", {
      config: toConfig(connection),
      taskId,
      remotePath: normalizeRemotePath(remotePath),
      localDir,
    });
  }

  static async listenTransfers(handler: (event: FtpTransferEvent) => void) {
    return await listen<FtpTransferEvent>("ftp-transfer-event", (event) => {
      handler(event.payload);
    });
  }
}

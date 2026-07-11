import { invoke } from "@tauri-apps/api/core";

export type HttpNodeType = "folder" | "request";
export type HttpBodyType =
  | "none"
  | "json"
  | "text"
  | "xml"
  | "form"
  | "binary";

export interface HttpKeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpRequestConfig {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: HttpKeyValue[];
  cookies: HttpKeyValue[];
  params: HttpKeyValue[];
  body_type: HttpBodyType;
  body: string;
  timeout_secs: number;
  follow_redirects: boolean;
}

export interface HttpTreeNode {
  id: string;
  name: string;
  node_type: HttpNodeType;
  children: HttpTreeNode[];
  request: HttpRequestConfig | null;
  created_at: string;
  updated_at: string;
}

export interface HttpWorkspace {
  nodes: HttpTreeNode[];
}

export interface HttpImportResult {
  sourceName: string;
  detectedFormat: string;
  nodes: HttpTreeNode[];
}

export interface HttpCodeScanResult {
  sourceRoot: string;
  routeCount: number;
  nodes: HttpTreeNode[];
  warnings: string[];
}

export interface HttpExportArtifact {
  format: string;
  filePath: string;
}

export interface HttpResponseHeader {
  key: string;
  value: string;
}

export interface HttpResponseData {
  status: number;
  status_text: string;
  headers: HttpResponseHeader[];
  cookies: string[];
  elapsed_ms: number;
  content_type: string;
  size: number;
  body_text: string | null;
  body_base64: string;
  is_image: boolean;
  file_name: string;
  final_url: string;
}

export class HttpApi {
  static async getWorkspace(): Promise<HttpWorkspace> {
    return await invoke<HttpWorkspace>("get_http_workspace");
  }

  static async saveWorkspace(workspace: HttpWorkspace): Promise<void> {
    return await invoke<void>("save_http_workspace", { workspace });
  }

  static async sendRequest(
    request: HttpRequestConfig,
  ): Promise<HttpResponseData> {
    return await invoke<HttpResponseData>("send_http_request", { request });
  }

  static async saveFile(filePath: string, dataBase64: string): Promise<void> {
    return await invoke<void>("save_http_file", { filePath, dataBase64 });
  }

  static async importSpecFromPath(path: string): Promise<HttpImportResult> {
    return await invoke<HttpImportResult>("import_http_spec_from_path", {
      path,
    });
  }

  static async exportDocuments(
    workspace: HttpWorkspace,
    outputDir: string,
    formats: string[],
    title?: string,
  ): Promise<HttpExportArtifact[]> {
    return await invoke<HttpExportArtifact[]>("export_http_documents", {
      workspace,
      outputDir,
      formats,
      title,
    });
  }

  static async scanCodeDirectory(
    rootPath: string,
  ): Promise<HttpCodeScanResult> {
    return await invoke<HttpCodeScanResult>("scan_http_code_directory", {
      rootPath,
    });
  }
}

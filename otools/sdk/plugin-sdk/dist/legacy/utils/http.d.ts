export type HttpNodeType = "folder" | "request";
export type HttpBodyType = "none" | "json" | "text" | "xml" | "form" | "binary";
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
export declare class HttpApi {
    static getWorkspace(): Promise<HttpWorkspace>;
    static saveWorkspace(workspace: HttpWorkspace): Promise<void>;
    static sendRequest(request: HttpRequestConfig): Promise<HttpResponseData>;
    static saveFile(filePath: string, dataBase64: string): Promise<void>;
    static importSpecFromPath(path: string): Promise<HttpImportResult>;
    static exportDocuments(workspace: HttpWorkspace, outputDir: string, formats: string[], title?: string): Promise<HttpExportArtifact[]>;
    static scanCodeDirectory(rootPath: string): Promise<HttpCodeScanResult>;
}

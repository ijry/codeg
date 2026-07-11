export interface PakcapMapLocalRule {
    id: string;
    enabled: boolean;
    hostContains: string;
    pathContains: string;
    localFilePath: string;
    contentType: string;
}
export interface PakcapRewriteRule {
    id: string;
    enabled: boolean;
    hostContains: string;
    pathContains: string;
    headerKey: string;
    headerValue: string;
}
export interface PakcapResponseRewriteRule {
    id: string;
    enabled: boolean;
    hostContains: string;
    pathContains: string;
    headerKey: string;
    headerValue: string;
    bodyContains: string;
    bodyReplace: string;
}
export interface PakcapBreakpointRule {
    id: string;
    enabled: boolean;
    hostContains: string;
    pathContains: string;
    method: string;
}
export interface PakcapRuleSettings {
    mapLocalRules: PakcapMapLocalRule[];
    rewriteRules: PakcapRewriteRule[];
    responseRewriteRules: PakcapResponseRewriteRule[];
    breakpointRules: PakcapBreakpointRule[];
    latencyMs: number;
    throttleKbps: number;
    breakpointPauseMs: number;
    breakpointIntercept: boolean;
}
export interface PakcapStartRequest {
    listenHost: string;
    listenPort: number;
    enableHttpsDecrypt: boolean;
    maxCaptureBytes: number;
    rules: PakcapRuleSettings;
}
export interface PakcapRuntimeState {
    running: boolean;
    listenAddress: string;
    sessionCount: number;
    pendingBreakpointCount: number;
    enableHttpsDecrypt: boolean;
    httpsDecryptReady: boolean;
    note: string;
}
export interface PakcapCertificateState {
    caCertPath: string;
    caExists: boolean;
    installed: boolean;
    note: string;
}
export interface PakcapHeader {
    key: string;
    value: string;
}
export interface PakcapWebSocketFrame {
    id: string;
    capturedAt: string;
    direction: string;
    opcode: number;
    opcodeName: string;
    fin: boolean;
    rsv1: boolean;
    payloadSize: number;
    payloadPreview: string;
    payloadBase64?: string | null;
    truncated: boolean;
}
export interface PakcapWebSocketMessage {
    id: string;
    capturedAt: string;
    direction: string;
    messageType: string;
    compressed: boolean;
    payloadSize: number;
    payloadPreview: string;
    payloadBase64?: string | null;
    truncated: boolean;
    note: string;
}
export interface PakcapPendingEditableRequest {
    method: string;
    path: string;
    headers: PakcapHeader[];
    bodyPreview: string;
    bodyBase64?: string | null;
    bodyTruncated: boolean;
    bodySize: number;
}
export interface PakcapSession {
    id: string;
    startedAt: string;
    finishedAt: string;
    method: string;
    protocol: string;
    host: string;
    ip: string;
    port: number;
    path: string;
    requestUrl: string;
    requestHttpVersion: string;
    responseHttpVersion: string;
    requestContentEncoding: string;
    responseContentEncoding: string;
    status: number;
    durationMs: number;
    requestSize: number;
    responseSize: number;
    requestHeaders: PakcapHeader[];
    responseHeaders: PakcapHeader[];
    requestBodyPreview: string;
    responseBodyPreview: string;
    requestBodyDecodedPreview: string;
    responseBodyDecodedPreview: string;
    requestBodyTruncated: boolean;
    responseBodyTruncated: boolean;
    requestBodyFilePath: string;
    responseBodyFilePath: string;
    requestBodyFromDisk: boolean;
    responseBodyFromDisk: boolean;
    isWebsocket: boolean;
    websocketFrames: PakcapWebSocketFrame[];
    websocketMessages: PakcapWebSocketMessage[];
    note: string;
    matchedBreakpoint: boolean;
}
export interface PakcapSessionSummary {
    id: string;
    startedAt: string;
    method: string;
    protocol: string;
    host: string;
    ip: string;
    port: number;
    path: string;
    status: number;
    durationMs: number;
    requestSize: number;
    responseSize: number;
    note: string;
    matchedBreakpoint: boolean;
}
export interface PakcapSessionFilter {
    keyword?: string;
    domain?: string;
    ip?: string;
    method?: string;
    protocol?: string;
    statusGroup?: string;
}
export interface PakcapPendingBreakpoint {
    id: string;
    sessionId: string;
    createdAt: string;
    method: string;
    protocol: string;
    host: string;
    path: string;
    note: string;
    editableRequest?: PakcapPendingEditableRequest | null;
}
export interface PakcapBreakpointOverrideRequest {
    method?: string;
    path?: string;
    headers?: PakcapHeader[];
    bodyText?: string;
    bodyBase64?: string;
}
export interface PakcapBodyLoadResponse {
    sessionId: string;
    kind: string;
    fromDisk: boolean;
    contentEncoding: string;
    isBinary: boolean;
    text: string;
    base64?: string | null;
    size: number;
}
export declare const createDefaultPakcapConfig: () => PakcapStartRequest;
export declare class PakcapApi {
    static startCapture(config: PakcapStartRequest): Promise<PakcapRuntimeState>;
    static stopCapture(): Promise<PakcapRuntimeState>;
    static getRuntimeState(): Promise<PakcapRuntimeState>;
    static listSessions(filter?: PakcapSessionFilter): Promise<PakcapSessionSummary[]>;
    static getSessionDetail(id: string): Promise<PakcapSession | null>;
    static clearSessions(): Promise<void>;
    static exportSessions(filePath: string): Promise<void>;
    static exportHar(filePath: string): Promise<void>;
    static getSessionCurl(id: string): Promise<string | null>;
    static replaySession(id: string): Promise<string>;
    static listPendingBreakpoints(): Promise<PakcapPendingBreakpoint[]>;
    static resolvePendingBreakpoint(id: string, action: "continue" | "drop", overrideRequest?: PakcapBreakpointOverrideRequest): Promise<string>;
    static loadSessionBody(id: string, kind: "request" | "response", decoded?: boolean): Promise<PakcapBodyLoadResponse>;
    static getCertificateState(): Promise<PakcapCertificateState>;
    static setCertificateInstalled(installed: boolean): Promise<string>;
    static regenerateCertificate(): Promise<string>;
    static setSystemProxy(enabled: boolean, host: string, port: number): Promise<string>;
}

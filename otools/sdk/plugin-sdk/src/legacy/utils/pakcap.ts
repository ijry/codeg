import { invoke } from "@tauri-apps/api/core";

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

export const createDefaultPakcapConfig = (): PakcapStartRequest => ({
  listenHost: "127.0.0.1",
  listenPort: 8899,
  enableHttpsDecrypt: true,
  maxCaptureBytes: 128 * 1024,
  rules: {
    mapLocalRules: [],
    rewriteRules: [],
    responseRewriteRules: [],
    breakpointRules: [],
    latencyMs: 0,
    throttleKbps: 0,
    breakpointPauseMs: 0,
    breakpointIntercept: false,
  },
});

export class PakcapApi {
  static async startCapture(
    config: PakcapStartRequest,
  ): Promise<PakcapRuntimeState> {
    return await invoke<PakcapRuntimeState>("pakcap_start_capture", {
      config,
    });
  }

  static async stopCapture(): Promise<PakcapRuntimeState> {
    return await invoke<PakcapRuntimeState>("pakcap_stop_capture");
  }

  static async getRuntimeState(): Promise<PakcapRuntimeState> {
    return await invoke<PakcapRuntimeState>("pakcap_get_runtime_state");
  }

  static async listSessions(
    filter?: PakcapSessionFilter,
  ): Promise<PakcapSessionSummary[]> {
    return await invoke<PakcapSessionSummary[]>("pakcap_list_sessions", {
      filter,
    });
  }

  static async getSessionDetail(id: string): Promise<PakcapSession | null> {
    return await invoke<PakcapSession | null>("pakcap_get_session_detail", {
      id,
    });
  }

  static async clearSessions(): Promise<void> {
    return await invoke<void>("pakcap_clear_sessions");
  }

  static async exportSessions(filePath: string): Promise<void> {
    return await invoke<void>("pakcap_export_sessions", { filePath });
  }

  static async exportHar(filePath: string): Promise<void> {
    return await invoke<void>("pakcap_export_har", { filePath });
  }

  static async getSessionCurl(id: string): Promise<string | null> {
    return await invoke<string | null>("pakcap_get_session_curl", { id });
  }

  static async replaySession(id: string): Promise<string> {
    return await invoke<string>("pakcap_replay_session", { id });
  }

  static async listPendingBreakpoints(): Promise<PakcapPendingBreakpoint[]> {
    return await invoke<PakcapPendingBreakpoint[]>(
      "pakcap_list_pending_breakpoints",
    );
  }

  static async resolvePendingBreakpoint(
    id: string,
    action: "continue" | "drop",
    overrideRequest?: PakcapBreakpointOverrideRequest,
  ): Promise<string> {
    return await invoke<string>("pakcap_resolve_pending_breakpoint", {
      request: { id, action, overrideRequest },
    });
  }

  static async loadSessionBody(
    id: string,
    kind: "request" | "response",
    decoded = true,
  ): Promise<PakcapBodyLoadResponse> {
    return await invoke<PakcapBodyLoadResponse>("pakcap_load_session_body", {
      id,
      kind,
      decoded,
    });
  }

  static async getCertificateState(): Promise<PakcapCertificateState> {
    return await invoke<PakcapCertificateState>("pakcap_get_certificate_state");
  }

  static async setCertificateInstalled(installed: boolean): Promise<string> {
    return await invoke<string>("pakcap_set_certificate_installed", {
      installed,
    });
  }

  static async regenerateCertificate(): Promise<string> {
    return await invoke<string>("pakcap_regenerate_certificate");
  }

  static async setSystemProxy(
    enabled: boolean,
    host: string,
    port: number,
  ): Promise<string> {
    return await invoke<string>("pakcap_set_system_proxy", {
      enabled,
      host,
      port,
    });
  }
}

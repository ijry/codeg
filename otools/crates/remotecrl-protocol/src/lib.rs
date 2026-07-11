use serde::{Deserialize, Serialize};

pub const REMOTECRL_EVENT_NAME: &str = "remotecrl-event";
pub const DEFAULT_DIRECT_PORT: u16 = 39_991;
pub const DEFAULT_RELAY_BIND: &str = "0.0.0.0:39992";
pub const OFFICIAL_RELAY_HOST: &str = "remotecrl-relay.lingyun.net";
pub const OFFICIAL_RELAY_URL: &str = "wss://remotecrl-relay.lingyun.net";
pub const DEFAULT_RELAY_URL: &str = OFFICIAL_RELAY_URL;
pub const FILE_CHUNK_SIZE: usize = 48 * 1024;
pub const DEFAULT_HEARTBEAT_INTERVAL_MS: u64 = 12_000;
pub const DEFAULT_RELAY_IDLE_TIMEOUT_MS: u64 = 45_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemotecrlConnectionMode {
    Direct,
    Relay,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteFileTransferDirection {
    Download,
    Upload,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteFileConflictStrategy {
    Overwrite,
    Rename,
    Skip,
    Resume,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteClipboardKind {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemotePeerInfo {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub hostname: String,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHostRegistration {
    pub host: RemotePeerInfo,
    pub password: String,
    pub requested_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHostRegistered {
    pub relay_code: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectRequest {
    pub mode: RemotecrlConnectionMode,
    pub password: String,
    pub relay_code: Option<String>,
    pub controller: RemotePeerInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectionAccepted {
    pub session_id: String,
    pub host: RemotePeerInfo,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectionRejected {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDesktopFrame {
    pub session_id: String,
    pub width: u32,
    pub height: u32,
    pub image_format: String,
    pub data_base64: String,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteInputKind {
    PointerMove,
    PointerDown,
    PointerUp,
    PointerClick,
    PointerDoubleClick,
    Scroll,
    KeyTap,
    KeyDown,
    KeyUp,
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInputEvent {
    pub session_id: String,
    pub kind: RemoteInputKind,
    pub x_ratio: Option<f64>,
    pub y_ratio: Option<f64>,
    pub button: Option<String>,
    pub delta_x: Option<i32>,
    pub delta_y: Option<i32>,
    pub key: Option<String>,
    pub text: Option<String>,
    pub modifiers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteClipboardMessage {
    pub session_id: String,
    pub kind: RemoteClipboardKind,
    pub text: Option<String>,
    pub image_format: Option<String>,
    pub image_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteClipboardRequest {
    pub session_id: String,
    pub kind: Option<RemoteClipboardKind>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileListRequest {
    pub session_id: String,
    pub path: Option<String>,
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileListResponse {
    pub session_id: String,
    pub path: String,
    pub entries: Vec<RemoteFileEntry>,
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileDownloadRequest {
    pub session_id: String,
    pub transfer_id: String,
    pub path: String,
    pub resume_from: Option<u64>,
    pub conflict_strategy: Option<RemoteFileConflictStrategy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileTransferStart {
    pub session_id: String,
    pub transfer_id: String,
    pub direction: RemoteFileTransferDirection,
    pub path: String,
    pub file_name: String,
    pub total_bytes: u64,
    pub resume_from: Option<u64>,
    pub conflict_strategy: Option<RemoteFileConflictStrategy>,
    pub relative_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileChunk {
    pub session_id: String,
    pub transfer_id: String,
    pub direction: RemoteFileTransferDirection,
    pub chunk_index: u64,
    pub data_base64: String,
    pub is_last: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileTransferComplete {
    pub session_id: String,
    pub transfer_id: String,
    pub direction: RemoteFileTransferDirection,
    pub success: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileTransferCancel {
    pub session_id: String,
    pub transfer_id: String,
    pub direction: RemoteFileTransferDirection,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteErrorMessage {
    pub session_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePing {
    pub ts: i64,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDisconnect {
    pub session_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum RemotecrlMessage {
    RegisterHost(RemoteHostRegistration),
    HostRegistered(RemoteHostRegistered),
    ConnectRequest(RemoteConnectRequest),
    ConnectionAccepted(RemoteConnectionAccepted),
    ConnectionRejected(RemoteConnectionRejected),
    Frame(RemoteDesktopFrame),
    Input(RemoteInputEvent),
    Clipboard(RemoteClipboardMessage),
    ClipboardRequest(RemoteClipboardRequest),
    FileListRequest(RemoteFileListRequest),
    FileListResponse(RemoteFileListResponse),
    FileDownloadRequest(RemoteFileDownloadRequest),
    FileTransferStart(RemoteFileTransferStart),
    FileChunk(RemoteFileChunk),
    FileTransferComplete(RemoteFileTransferComplete),
    FileTransferCancel(RemoteFileTransferCancel),
    Error(RemoteErrorMessage),
    Ping(RemotePing),
    Pong(RemotePing),
    Disconnect(RemoteDisconnect),
}

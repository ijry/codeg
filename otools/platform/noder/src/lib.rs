use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::borrow::Cow;
use std::collections::HashMap;
#[cfg(unix)]
use std::ffi::CStr;
#[cfg(target_os = "macos")]
use std::ffi::CString;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::time::UNIX_EPOCH;
use http::{Request, Response, StatusCode};

pub const NODER_PROTOCOL_SCHEME: &str = "otools-noder";

const RUNTIME_SCRIPT: &str = include_str!("runtime.js");

pub fn runtime_script() -> &'static str {
    RUNTIME_SCRIPT
}

pub fn wrap_preload_script(source: &str, filename: &str) -> String {
    let serialized_filename =
        serde_json::to_string(filename).unwrap_or_else(|_| "\"preload.js\"".to_string());
    format!(
        r#"(function() {{
  var __otoolsNoder = window.__OTOOLS_NODER__;
  if (__otoolsNoder && typeof __otoolsNoder.runEntryModule === "function") {{
    __otoolsNoder.runEntryModule({serialized_filename}, function(exports, require, module, __filename, __dirname, process, Buffer, global) {{
{source}
    }});
    return;
  }}
{source}
}})();"#,
    )
}

fn apply_command_background_mode(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct NoderBridgeRequest {
    op: String,
    args: Value,
}

impl Default for NoderBridgeRequest {
    fn default() -> Self {
        Self {
            op: String::new(),
            args: Value::Null,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoderBridgeResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<NoderErrorPayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoderErrorPayload {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    errno: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    syscall: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsPathRequest {
    path: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsWriteFileRequest {
    path: String,
    data_base64: String,
    append: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsReadDirRequest {
    path: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsMkdirRequest {
    path: String,
    recursive: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsRemoveRequest {
    path: String,
    recursive: Option<bool>,
    force: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsRenameRequest {
    from: String,
    to: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct FsCopyFileRequest {
    from: String,
    to: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ChildProcessRunRequest {
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    shell: Option<Value>,
    input_base64: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ChildProcessPollRequest {
    id: u64,
    cursor: Option<u64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ChildProcessKillRequest {
    id: u64,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ChildProcessDisposeRequest {
    id: u64,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ChildProcessStdinWriteRequest {
    id: u64,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntryPayload {
    name: String,
    path: String,
    is_file: bool,
    is_directory: bool,
    is_symlink: bool,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    accessed_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuTimesPayload {
    user: u64,
    nice: u64,
    sys: u64,
    idle: u64,
    irq: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuPayload {
    model: String,
    speed: u32,
    times: CpuTimesPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChildProcessEventPayload {
    seq: u64,
    #[serde(rename = "type")]
    event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data_base64: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signal: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    success: Option<bool>,
}

struct ChildProcessSession {
    pid: u32,
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    events: Arc<Mutex<Vec<ChildProcessEventPayload>>>,
    next_seq: Arc<AtomicU64>,
    done: Arc<AtomicBool>,
}

lazy_static! {
    static ref CHILD_PROCESS_SESSIONS: Mutex<HashMap<u64, ChildProcessSession>> =
        Mutex::new(HashMap::new());
}

static CHILD_PROCESS_SESSION_ID: AtomicU64 = AtomicU64::new(1);

fn response_with_status(
    status: StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", content_type)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "*")
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap()
}

fn json_response(status: StatusCode, payload: &NoderBridgeResponse) -> Response<Vec<u8>> {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| {
        br#"{"ok":false,"error":{"message":"Failed to serialize noder response","code":"EIO"}}"#
            .to_vec()
    });
    response_with_status(status, "application/json; charset=utf-8", body)
}

fn json_ok(value: Value) -> Response<Vec<u8>> {
    json_response(
        StatusCode::OK,
        &NoderBridgeResponse {
            ok: true,
            value: Some(value),
            error: None,
        },
    )
}

fn json_error(status: StatusCode, error: NoderErrorPayload) -> Response<Vec<u8>> {
    json_response(
        status,
        &NoderBridgeResponse {
            ok: false,
            value: None,
            error: Some(error),
        },
    )
}

fn invalid_request_error(message: impl Into<String>) -> NoderErrorPayload {
    NoderErrorPayload {
        message: message.into(),
        code: Some("EINVAL".to_string()),
        errno: None,
        syscall: None,
        path: None,
    }
}

fn io_error_code(kind: std::io::ErrorKind) -> &'static str {
    match kind {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        std::io::ErrorKind::AlreadyExists => "EEXIST",
        std::io::ErrorKind::WouldBlock => "EWOULDBLOCK",
        std::io::ErrorKind::InvalidInput => "EINVAL",
        std::io::ErrorKind::InvalidData => "EINVAL",
        std::io::ErrorKind::TimedOut => "ETIMEDOUT",
        std::io::ErrorKind::WriteZero => "EIO",
        std::io::ErrorKind::Interrupted => "EINTR",
        std::io::ErrorKind::UnexpectedEof => "EOF",
        std::io::ErrorKind::Unsupported => "ENOSYS",
        _ => "EIO",
    }
}

fn io_error_payload(
    error: &std::io::Error,
    syscall: impl Into<String>,
    path: Option<String>,
) -> NoderErrorPayload {
    NoderErrorPayload {
        message: error.to_string(),
        code: Some(io_error_code(error.kind()).to_string()),
        errno: error.raw_os_error(),
        syscall: Some(syscall.into()),
        path,
    }
}

fn value_as_object<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, NoderErrorPayload> {
    serde_json::from_value(value).map_err(|error| invalid_request_error(error.to_string()))
}

fn normalize_path(text: &str) -> Result<PathBuf, NoderErrorPayload> {
    let path = text.trim();
    if path.is_empty() {
        return Err(invalid_request_error("path is required"));
    }
    Ok(PathBuf::from(path))
}

fn file_time_to_millis(time: Result<std::time::SystemTime, std::io::Error>) -> Option<u64> {
    time.ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

#[cfg(unix)]
fn metadata_mode(metadata: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::MetadataExt as _;

    Some(metadata.mode())
}

#[cfg(not(unix))]
fn metadata_mode(_: &fs::Metadata) -> Option<u32> {
    None
}

fn build_entry_payload(path: PathBuf, metadata: fs::Metadata) -> FsEntryPayload {
    let is_file = metadata.is_file();
    let is_directory = metadata.is_dir();
    let is_symlink = metadata.file_type().is_symlink();
    FsEntryPayload {
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: path.to_string_lossy().to_string(),
        is_file,
        is_directory,
        is_symlink,
        size: if is_file { metadata.len() } else { 0 },
        modified_at_ms: file_time_to_millis(metadata.modified()),
        created_at_ms: file_time_to_millis(metadata.created()),
        accessed_at_ms: file_time_to_millis(metadata.accessed()),
        mode: metadata_mode(&metadata),
    }
}

fn handle_fs_read_file(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let bytes = fs::read(&path).map_err(|error| {
        io_error_payload(&error, "readFile", Some(path.to_string_lossy().to_string()))
    })?;
    Ok(json!({
        "path": path.to_string_lossy(),
        "dataBase64": BASE64_STANDARD.encode(bytes),
    }))
}

fn handle_fs_write_file(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsWriteFileRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let bytes = BASE64_STANDARD
        .decode(request.data_base64.trim())
        .map_err(|error| invalid_request_error(format!("invalid base64 payload: {error}")))?;

    if request.append.unwrap_or(false) {
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| {
                io_error_payload(
                    &error,
                    "appendFile",
                    Some(path.to_string_lossy().to_string()),
                )
            })?;
        file.write_all(&bytes).map_err(|error| {
            io_error_payload(
                &error,
                "appendFile",
                Some(path.to_string_lossy().to_string()),
            )
        })?;
    } else {
        fs::write(&path, &bytes).map_err(|error| {
            io_error_payload(
                &error,
                "writeFile",
                Some(path.to_string_lossy().to_string()),
            )
        })?;
    }

    Ok(json!({
        "path": path.to_string_lossy(),
        "size": bytes.len(),
    }))
}

fn handle_fs_exists(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    Ok(json!({ "exists": path.exists() }))
}

fn handle_fs_stat(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let metadata = fs::metadata(&path).map_err(|error| {
        io_error_payload(&error, "stat", Some(path.to_string_lossy().to_string()))
    })?;
    serde_json::to_value(build_entry_payload(path, metadata))
        .map_err(|error| invalid_request_error(error.to_string()))
}

fn handle_fs_lstat(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        io_error_payload(&error, "lstat", Some(path.to_string_lossy().to_string()))
    })?;
    serde_json::to_value(build_entry_payload(path, metadata))
        .map_err(|error| invalid_request_error(error.to_string()))
}

fn handle_fs_readdir(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsReadDirRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let read_dir = fs::read_dir(&path).map_err(|error| {
        io_error_payload(&error, "readdir", Some(path.to_string_lossy().to_string()))
    })?;
    let mut entries = Vec::new();
    for item in read_dir {
        let entry = item.map_err(|error| {
            io_error_payload(&error, "readdir", Some(path.to_string_lossy().to_string()))
        })?;
        let entry_path = entry.path();
        let metadata = fs::symlink_metadata(&entry_path).map_err(|error| {
            io_error_payload(
                &error,
                "readdir",
                Some(entry_path.to_string_lossy().to_string()),
            )
        })?;
        entries.push(build_entry_payload(entry_path, metadata));
    }
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    serde_json::to_value(entries).map_err(|error| invalid_request_error(error.to_string()))
}

fn handle_fs_mkdir(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsMkdirRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    if request.recursive.unwrap_or(false) {
        fs::create_dir_all(&path).map_err(|error| {
            io_error_payload(&error, "mkdir", Some(path.to_string_lossy().to_string()))
        })?;
    } else {
        fs::create_dir(&path).map_err(|error| {
            io_error_payload(&error, "mkdir", Some(path.to_string_lossy().to_string()))
        })?;
    }
    Ok(json!({ "path": path.to_string_lossy() }))
}

fn handle_fs_remove(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsRemoveRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let force = request.force.unwrap_or(false);
    let recursive = request.recursive.unwrap_or(false);

    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) => {
            if force && error.kind() == std::io::ErrorKind::NotFound {
                return Ok(json!({ "path": path.to_string_lossy(), "removed": false }));
            }
            return Err(io_error_payload(
                &error,
                "rm",
                Some(path.to_string_lossy().to_string()),
            ));
        }
    };

    let result = if metadata.is_dir() {
        if recursive {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_dir(&path)
        }
    } else {
        fs::remove_file(&path)
    };

    result.map_err(|error| {
        io_error_payload(&error, "rm", Some(path.to_string_lossy().to_string()))
    })?;

    Ok(json!({ "path": path.to_string_lossy(), "removed": true }))
}

fn handle_fs_rename(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsRenameRequest = value_as_object(args)?;
    let from = normalize_path(&request.from)?;
    let to = normalize_path(&request.to)?;
    fs::rename(&from, &to).map_err(|error| {
        io_error_payload(
            &error,
            "rename",
            Some(format!(
                "{} -> {}",
                from.to_string_lossy(),
                to.to_string_lossy()
            )),
        )
    })?;
    Ok(json!({
        "from": from.to_string_lossy(),
        "to": to.to_string_lossy(),
    }))
}

fn handle_fs_copy_file(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsCopyFileRequest = value_as_object(args)?;
    let from = normalize_path(&request.from)?;
    let to = normalize_path(&request.to)?;
    let size = fs::copy(&from, &to).map_err(|error| {
        io_error_payload(
            &error,
            "copyFile",
            Some(format!(
                "{} -> {}",
                from.to_string_lossy(),
                to.to_string_lossy()
            )),
        )
    })?;
    Ok(json!({
        "from": from.to_string_lossy(),
        "to": to.to_string_lossy(),
        "size": size,
    }))
}

fn handle_fs_realpath(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    let resolved = fs::canonicalize(&path).map_err(|error| {
        io_error_payload(&error, "realpath", Some(path.to_string_lossy().to_string()))
    })?;
    Ok(json!({ "path": resolved.to_string_lossy() }))
}

fn handle_fs_access(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: FsPathRequest = value_as_object(args)?;
    let path = normalize_path(&request.path)?;
    fs::metadata(&path).map_err(|error| {
        io_error_payload(&error, "access", Some(path.to_string_lossy().to_string()))
    })?;
    Ok(json!({ "path": path.to_string_lossy(), "ok": true }))
}

#[cfg(unix)]
fn unix_uname() -> Option<libc::utsname> {
    let mut uts = std::mem::MaybeUninit::<libc::utsname>::zeroed();
    let status = unsafe { libc::uname(uts.as_mut_ptr()) };
    if status == 0 {
        Some(unsafe { uts.assume_init() })
    } else {
        None
    }
}

#[cfg(unix)]
fn uname_text(field: &[libc::c_char]) -> String {
    unsafe { CStr::from_ptr(field.as_ptr()) }
        .to_string_lossy()
        .trim()
        .to_string()
}

#[cfg(target_os = "macos")]
fn sysctl_string(name: &str) -> Option<String> {
    let cname = CString::new(name).ok()?;
    let mut size: usize = 0;
    let len_status = unsafe {
        libc::sysctlbyname(
            cname.as_ptr(),
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if len_status != 0 || size == 0 {
        return None;
    }
    let mut buffer = vec![0_u8; size];
    let value_status = unsafe {
        libc::sysctlbyname(
            cname.as_ptr(),
            buffer.as_mut_ptr() as *mut _,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if value_status != 0 {
        return None;
    }
    if let Some(0) = buffer.last().copied() {
        buffer.pop();
    }
    String::from_utf8(buffer)
        .ok()
        .map(|text| text.trim().to_string())
}

#[cfg(target_os = "macos")]
fn sysctl_u64(name: &str) -> Option<u64> {
    let cname = CString::new(name).ok()?;
    let mut value: u64 = 0;
    let mut size = std::mem::size_of::<u64>();
    let status = unsafe {
        libc::sysctlbyname(
            cname.as_ptr(),
            &mut value as *mut _ as *mut _,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if status == 0 {
        Some(value)
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
fn linux_cpu_model() -> Option<String> {
    let content = fs::read_to_string("/proc/cpuinfo").ok()?;
    content
        .lines()
        .find_map(|line| line.split_once(':'))
        .and_then(|(key, value)| {
            if key.trim() == "model name" {
                Some(value.trim().to_string())
            } else {
                None
            }
        })
}

#[cfg(target_os = "windows")]
fn windows_memory_info() -> (u64, u64) {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..unsafe { std::mem::zeroed() }
    };
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok == 0 {
        (0, 0)
    } else {
        (status.ullTotalPhys, status.ullAvailPhys)
    }
}

fn cpu_model() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Some(value) = sysctl_string("machdep.cpu.brand_string") {
            if !value.is_empty() {
                return value;
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(value) = linux_cpu_model() {
            if !value.is_empty() {
                return value;
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(value) = std::env::var("PROCESSOR_IDENTIFIER") {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    std::env::consts::ARCH.to_string()
}

fn os_platform_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

fn os_type_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "Darwin",
        "windows" => "Windows_NT",
        "linux" => "Linux",
        other => other,
    }
}

fn os_release_value() -> String {
    #[cfg(unix)]
    {
        if let Some(uts) = unix_uname() {
            let text = uname_text(&uts.release);
            if !text.is_empty() {
                return text;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(value) = std::env::var("OS") {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        return "Windows_NT".to_string();
    }

    #[cfg(not(target_os = "windows"))]
    {
        String::new()
    }
}

fn hostname_value() -> String {
    #[cfg(unix)]
    {
        if let Some(uts) = unix_uname() {
            let text = uname_text(&uts.nodename);
            if !text.is_empty() {
                return text;
            }
        }
    }

    for key in ["HOSTNAME", "COMPUTERNAME"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    String::new()
}

#[cfg(target_os = "linux")]
fn total_and_free_memory() -> (u64, u64) {
    let mut info = std::mem::MaybeUninit::<libc::sysinfo>::zeroed();
    let status = unsafe { libc::sysinfo(info.as_mut_ptr()) };
    if status == 0 {
        let info = unsafe { info.assume_init() };
        let unit = u64::from(info.mem_unit);
        (
            (info.totalram as u64).saturating_mul(unit),
            (info.freeram as u64).saturating_mul(unit),
        )
    } else {
        (0, 0)
    }
}

#[cfg(target_os = "macos")]
fn total_and_free_memory() -> (u64, u64) {
    (sysctl_u64("hw.memsize").unwrap_or(0), 0)
}

#[cfg(target_os = "windows")]
fn total_and_free_memory() -> (u64, u64) {
    windows_memory_info()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn total_and_free_memory() -> (u64, u64) {
    (0, 0)
}

fn current_dir_value() -> String {
    std::env::current_dir()
        .ok()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

fn handle_os_info() -> Value {
    let cpu_count = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1);
    let model = cpu_model();
    let cpus = (0..cpu_count)
        .map(|_| CpuPayload {
            model: model.clone(),
            speed: 0,
            times: CpuTimesPayload {
                user: 0,
                nice: 0,
                sys: 0,
                idle: 0,
                irq: 0,
            },
        })
        .collect::<Vec<CpuPayload>>();
    let (total_mem, free_mem) = total_and_free_memory();

    json!({
        "arch": std::env::consts::ARCH,
        "platform": os_platform_name(),
        "type": os_type_name(),
        "release": os_release_value(),
        "hostname": hostname_value(),
        "homedir": dirs::home_dir().map(|path| path.to_string_lossy().to_string()).unwrap_or_default(),
        "tmpdir": std::env::temp_dir().to_string_lossy().to_string(),
        "endianness": if cfg!(target_endian = "little") { "LE" } else { "BE" },
        "eol": if cfg!(windows) { "\r\n" } else { "\n" },
        "cpus": cpus,
        "totalmem": total_mem,
        "freemem": free_mem,
        "cwd": current_dir_value(),
    })
}

fn build_shell_command(shell: Option<&Value>, command: &str) -> (String, Vec<String>) {
    match shell {
        Some(Value::String(program)) if !program.trim().is_empty() => {
            #[cfg(target_os = "windows")]
            {
                return (
                    program.trim().to_string(),
                    vec!["/C".to_string(), command.to_string()],
                );
            }
            #[cfg(not(target_os = "windows"))]
            {
                return (
                    program.trim().to_string(),
                    vec!["-c".to_string(), command.to_string()],
                );
            }
        }
        _ => {
            #[cfg(target_os = "windows")]
            {
                return (
                    "cmd".to_string(),
                    vec!["/C".to_string(), command.to_string()],
                );
            }
            #[cfg(not(target_os = "windows"))]
            {
                return (
                    "/bin/sh".to_string(),
                    vec!["-c".to_string(), command.to_string()],
                );
            }
        }
    }
}

fn prepare_child_process(
    request: &ChildProcessRunRequest,
) -> Result<(Command, Option<Vec<u8>>, String), NoderErrorPayload> {
    let command_text = request.command.trim();
    if command_text.is_empty() {
        return Err(invalid_request_error("command is required"));
    }

    let shell_enabled = request
        .shell
        .as_ref()
        .map(|value| match value {
            Value::Bool(flag) => *flag,
            Value::String(text) => !text.trim().is_empty(),
            _ => false,
        })
        .unwrap_or(false);

    let (program, args) = if shell_enabled {
        build_shell_command(request.shell.as_ref(), command_text)
    } else {
        (command_text.to_string(), request.args.clone())
    };

    let mut command = Command::new(&program);
    apply_command_background_mode(&mut command);
    if !args.is_empty() {
        command.args(&args);
    }
    if let Some(cwd) = request
        .cwd
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        command.current_dir(cwd);
    }
    if let Some(env) = request.env.as_ref() {
        for (key, value) in env {
            command.env(key, value);
        }
    }
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let input_bytes = request
        .input_base64
        .as_ref()
        .map(|value| BASE64_STANDARD.decode(value.trim()))
        .transpose()
        .map_err(|error| invalid_request_error(format!("invalid process input base64: {error}")))?;

    command.stdin(Stdio::piped());

    Ok((
        command,
        input_bytes,
        if shell_enabled {
            program
        } else {
            command_text.to_string()
        },
    ))
}

fn decode_process_signal(_status: &std::process::ExitStatus) -> Option<i32> {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt as _;
        _status.signal()
    }

    #[cfg(not(unix))]
    {
        None
    }
}

fn push_child_process_event(
    events: &Arc<Mutex<Vec<ChildProcessEventPayload>>>,
    next_seq: &Arc<AtomicU64>,
    event_type: &str,
    stream: Option<&str>,
    data_base64: Option<String>,
    message: Option<String>,
    status: Option<i32>,
    signal: Option<i32>,
    success: Option<bool>,
) {
    let seq = next_seq.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut guard) = events.lock() {
        guard.push(ChildProcessEventPayload {
            seq,
            event_type: event_type.to_string(),
            stream: stream.map(|value| value.to_string()),
            data_base64,
            message,
            status,
            signal,
            success,
        });
    }
}

fn spawn_process_output_reader<R: Read + Send + 'static>(
    mut reader: R,
    stream: &'static str,
    events: Arc<Mutex<Vec<ChildProcessEventPayload>>>,
    next_seq: Arc<AtomicU64>,
    active_streams: Arc<AtomicU64>,
) {
    thread::spawn(move || {
        let mut buffer = vec![0_u8; 16 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    push_child_process_event(
                        &events,
                        &next_seq,
                        "data",
                        Some(stream),
                        Some(BASE64_STANDARD.encode(&buffer[..size])),
                        None,
                        None,
                        None,
                        None,
                    );
                }
                Err(error) => {
                    push_child_process_event(
                        &events,
                        &next_seq,
                        "error",
                        Some(stream),
                        None,
                        Some(error.to_string()),
                        None,
                        None,
                        None,
                    );
                    break;
                }
            }
        }
        active_streams.fetch_sub(1, Ordering::Relaxed);
    });
}

fn spawn_process_waiter(
    child: Arc<Mutex<Child>>,
    events: Arc<Mutex<Vec<ChildProcessEventPayload>>>,
    next_seq: Arc<AtomicU64>,
    done: Arc<AtomicBool>,
    active_streams: Arc<AtomicU64>,
) {
    thread::spawn(move || loop {
        let status = {
            let mut guard = match child.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    push_child_process_event(
                        &events,
                        &next_seq,
                        "error",
                        None,
                        None,
                        Some("child process lock poisoned".to_string()),
                        None,
                        None,
                        None,
                    );
                    done.store(true, Ordering::Relaxed);
                    return;
                }
            };
            guard.try_wait()
        };

        match status {
            Ok(Some(exit_status)) => {
                while active_streams.load(Ordering::Relaxed) > 0 {
                    thread::sleep(Duration::from_millis(10));
                }
                push_child_process_event(
                    &events,
                    &next_seq,
                    "close",
                    None,
                    None,
                    None,
                    exit_status.code(),
                    decode_process_signal(&exit_status),
                    Some(exit_status.success()),
                );
                done.store(true, Ordering::Relaxed);
                return;
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(60));
            }
            Err(error) => {
                push_child_process_event(
                    &events,
                    &next_seq,
                    "error",
                    None,
                    None,
                    Some(error.to_string()),
                    None,
                    None,
                    None,
                );
                done.store(true, Ordering::Relaxed);
                return;
            }
        }
    });
}

fn run_child_process(request: ChildProcessRunRequest) -> Result<Value, NoderErrorPayload> {
    let (mut command, input_bytes, display_path) = prepare_child_process(&request)?;

    let child_result = command.spawn();
    let mut child =
        child_result.map_err(|error| io_error_payload(&error, "spawn", Some(display_path)))?;

    if let Some(bytes) = input_bytes {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(&bytes)
                .map_err(|error| io_error_payload(&error, "write", None))?;
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| io_error_payload(&error, "wait", None))?;

    Ok(json!({
        "status": output.status.code(),
        "success": output.status.success(),
        "signal": decode_process_signal(&output.status),
        "stdoutBase64": BASE64_STANDARD.encode(output.stdout),
        "stderrBase64": BASE64_STANDARD.encode(output.stderr),
    }))
}

fn spawn_child_process(request: ChildProcessRunRequest) -> Result<Value, NoderErrorPayload> {
    let (mut command, input_bytes, display_path) = prepare_child_process(&request)?;
    let mut child = command
        .spawn()
        .map_err(|error| io_error_payload(&error, "spawn", Some(display_path)))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();

    let child = Arc::new(Mutex::new(child));
    let stdin = Arc::new(Mutex::new(stdin));
    let events = Arc::new(Mutex::new(Vec::new()));
    let next_seq = Arc::new(AtomicU64::new(1));
    let done = Arc::new(AtomicBool::new(false));
    let active_streams = Arc::new(AtomicU64::new(0));

    if let Some(stdout) = stdout {
        active_streams.fetch_add(1, Ordering::Relaxed);
        spawn_process_output_reader(
            stdout,
            "stdout",
            events.clone(),
            next_seq.clone(),
            active_streams.clone(),
        );
    }
    if let Some(stderr) = stderr {
        active_streams.fetch_add(1, Ordering::Relaxed);
        spawn_process_output_reader(
            stderr,
            "stderr",
            events.clone(),
            next_seq.clone(),
            active_streams.clone(),
        );
    }

    if let Some(bytes) = input_bytes {
        let stdin_handle = stdin.clone();
        let events_handle = events.clone();
        let next_seq_handle = next_seq.clone();
        thread::spawn(move || {
            let mut guard = match stdin_handle.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            if let Some(stdin) = guard.as_mut() {
                if let Err(error) = stdin.write_all(&bytes) {
                    push_child_process_event(
                        &events_handle,
                        &next_seq_handle,
                        "error",
                        Some("stdin"),
                        None,
                        Some(error.to_string()),
                        None,
                        None,
                        None,
                    );
                }
            }
        });
    }

    spawn_process_waiter(
        child.clone(),
        events.clone(),
        next_seq.clone(),
        done.clone(),
        active_streams,
    );

    let session_id = CHILD_PROCESS_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let session = ChildProcessSession {
        pid,
        child,
        stdin,
        events,
        next_seq,
        done,
    };

    CHILD_PROCESS_SESSIONS
        .lock()
        .map_err(|_| invalid_request_error("child process registry is unavailable"))?
        .insert(session_id, session);

    Ok(json!({
        "id": session_id,
        "pid": pid,
    }))
}

fn child_process_session(
    _id: u64,
) -> Result<std::sync::MutexGuard<'static, HashMap<u64, ChildProcessSession>>, NoderErrorPayload> {
    CHILD_PROCESS_SESSIONS
        .lock()
        .map_err(|_| invalid_request_error("child process registry is unavailable"))
}

fn handle_child_process_poll(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: ChildProcessPollRequest = value_as_object(args)?;
    if request.id == 0 {
        return Err(invalid_request_error("child process id is required"));
    }
    let sessions = child_process_session(request.id)?;
    let session = sessions
        .get(&request.id)
        .ok_or_else(|| invalid_request_error("child process session not found"))?;
    let cursor = request.cursor.unwrap_or(0);
    let events = session
        .events
        .lock()
        .map_err(|_| invalid_request_error("child process event queue is unavailable"))?
        .iter()
        .filter(|item| item.seq > cursor)
        .cloned()
        .collect::<Vec<ChildProcessEventPayload>>();
    Ok(json!({
        "id": request.id,
        "pid": session.pid,
        "cursor": events.last().map(|item| item.seq).unwrap_or(cursor),
        "done": session.done.load(Ordering::Relaxed),
        "nextSeq": session.next_seq.load(Ordering::Relaxed),
        "events": events,
    }))
}

fn handle_child_process_kill(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: ChildProcessKillRequest = value_as_object(args)?;
    if request.id == 0 {
        return Err(invalid_request_error("child process id is required"));
    }
    let sessions = child_process_session(request.id)?;
    let session = sessions
        .get(&request.id)
        .ok_or_else(|| invalid_request_error("child process session not found"))?;
    if session.done.load(Ordering::Relaxed) {
        return Ok(json!({ "id": request.id, "killed": false, "done": true }));
    }
    session
        .child
        .lock()
        .map_err(|_| invalid_request_error("child process handle is unavailable"))?
        .kill()
        .map_err(|error| io_error_payload(&error, "kill", Some(session.pid.to_string())))?;
    Ok(json!({ "id": request.id, "killed": true }))
}

fn handle_child_process_dispose(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: ChildProcessDisposeRequest = value_as_object(args)?;
    if request.id == 0 {
        return Err(invalid_request_error("child process id is required"));
    }
    let removed = CHILD_PROCESS_SESSIONS
        .lock()
        .map_err(|_| invalid_request_error("child process registry is unavailable"))?
        .remove(&request.id)
        .is_some();
    Ok(json!({ "id": request.id, "removed": removed }))
}

fn handle_child_process_stdin_write(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: ChildProcessStdinWriteRequest = value_as_object(args)?;
    if request.id == 0 {
        return Err(invalid_request_error("child process id is required"));
    }
    let bytes = BASE64_STANDARD
        .decode(request.data_base64.trim())
        .map_err(|error| invalid_request_error(format!("invalid stdin base64 payload: {error}")))?;
    let sessions = child_process_session(request.id)?;
    let session = sessions
        .get(&request.id)
        .ok_or_else(|| invalid_request_error("child process session not found"))?;
    let mut stdin = session
        .stdin
        .lock()
        .map_err(|_| invalid_request_error("child process stdin is unavailable"))?;
    let stdin = stdin
        .as_mut()
        .ok_or_else(|| invalid_request_error("child process stdin is closed"))?;
    stdin
        .write_all(&bytes)
        .map_err(|error| io_error_payload(&error, "write", Some(session.pid.to_string())))?;
    Ok(json!({ "id": request.id, "written": bytes.len() }))
}

fn handle_child_process_stdin_end(args: Value) -> Result<Value, NoderErrorPayload> {
    let request: ChildProcessDisposeRequest = value_as_object(args)?;
    if request.id == 0 {
        return Err(invalid_request_error("child process id is required"));
    }
    let sessions = child_process_session(request.id)?;
    let session = sessions
        .get(&request.id)
        .ok_or_else(|| invalid_request_error("child process session not found"))?;
    let closed = session
        .stdin
        .lock()
        .map_err(|_| invalid_request_error("child process stdin is unavailable"))?
        .take()
        .is_some();
    Ok(json!({ "id": request.id, "closed": closed }))
}

fn handle_process_cwd() -> Value {
    json!({
        "cwd": current_dir_value(),
    })
}

fn handle_bridge_request(request: NoderBridgeRequest) -> Result<Value, NoderErrorPayload> {
    match request.op.trim() {
        "fs.readFile" => handle_fs_read_file(request.args),
        "fs.writeFile" => handle_fs_write_file(request.args),
        "fs.exists" => handle_fs_exists(request.args),
        "fs.stat" => handle_fs_stat(request.args),
        "fs.lstat" => handle_fs_lstat(request.args),
        "fs.readdir" => handle_fs_readdir(request.args),
        "fs.mkdir" => handle_fs_mkdir(request.args),
        "fs.rm" => handle_fs_remove(request.args),
        "fs.rename" => handle_fs_rename(request.args),
        "fs.copyFile" => handle_fs_copy_file(request.args),
        "fs.realpath" => handle_fs_realpath(request.args),
        "fs.access" => handle_fs_access(request.args),
        "os.info" => Ok(handle_os_info()),
        "childProcess.run" => {
            let payload: ChildProcessRunRequest = value_as_object(request.args)?;
            run_child_process(payload)
        }
        "childProcess.spawn" => {
            let payload: ChildProcessRunRequest = value_as_object(request.args)?;
            spawn_child_process(payload)
        }
        "childProcess.poll" => handle_child_process_poll(request.args),
        "childProcess.kill" => handle_child_process_kill(request.args),
        "childProcess.dispose" => handle_child_process_dispose(request.args),
        "childProcess.stdinWrite" => handle_child_process_stdin_write(request.args),
        "childProcess.stdinEnd" => handle_child_process_stdin_end(request.args),
        "process.cwd" => Ok(handle_process_cwd()),
        other => Err(invalid_request_error(format!(
            "Unsupported noder operation: {other}"
        ))),
    }
}

pub fn handle_protocol_request(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method().as_str().eq_ignore_ascii_case("OPTIONS") {
        return response_with_status(
            StatusCode::NO_CONTENT,
            "text/plain; charset=utf-8",
            Vec::new(),
        );
    }

    let uri = request.uri().path().to_string();
    if !uri.starts_with("/invoke") {
        return response_with_status(
            StatusCode::NOT_FOUND,
            "application/json; charset=utf-8",
            br#"{"ok":false,"error":{"message":"Not found","code":"ENOENT"}}"#.to_vec(),
        );
    }

    let body = if request.body().is_empty() {
        Cow::Borrowed("{}")
    } else {
        String::from_utf8_lossy(request.body())
    };

    let payload = match serde_json::from_str::<NoderBridgeRequest>(&body) {
        Ok(payload) => payload,
        Err(error) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                invalid_request_error(format!("Invalid noder payload: {error}")),
            );
        }
    };

    match handle_bridge_request(payload) {
        Ok(value) => json_ok(value),
        Err(error) => json_error(StatusCode::BAD_REQUEST, error),
    }
}

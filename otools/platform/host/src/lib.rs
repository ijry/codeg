use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use walkdir::WalkDir;

use otools_core::HostError;

#[cfg(target_os = "windows")]
use csv::ReaderBuilder;

#[cfg(target_os = "linux")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "linux")]
use std::time::{Duration, Instant};

#[cfg(target_os = "linux")]
const HOST_LINUX_SUDO_PASSWORD_INVALID: &str = "SERVRUN_LINUX_SUDO_PASSWORD_INVALID";
#[cfg(target_os = "linux")]
const HOST_LINUX_SUDO_PASSWORD_REQUIRED: &str = "SERVRUN_LINUX_SUDO_PASSWORD_REQUIRED";
#[cfg(target_os = "linux")]
const HOST_LINUX_PRIVILEGE_CACHE_TTL_SECS: u64 = 15 * 60;

#[cfg(target_os = "linux")]
struct LinuxPrivilegeCacheEntry {
    encrypted_password: Vec<u8>,
    expires_at: Instant,
}

#[cfg(target_os = "linux")]
static HOST_LINUX_PRIVILEGE_CACHE: OnceLock<Mutex<Option<LinuxPrivilegeCacheEntry>>> =
    OnceLock::new();
#[cfg(target_os = "linux")]
static HOST_LINUX_PRIVILEGE_KEY: OnceLock<Vec<u8>> = OnceLock::new();

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewFileMeta {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub last_modified: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewReadFilePayload {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub last_modified: Option<u64>,
    pub data_base64: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewDirEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub mime: String,
    pub last_modified: Option<u64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewWriteFileRequest {
    pub path: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewRenameEntryRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScriptInfo {
    pub name: String,
    pub command: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScriptsResponse {
    pub has_package_json: bool,
    pub package_manager: String,
    pub command_prefix: String,
    pub scripts: Vec<ProjectScriptInfo>,
}
pub async fn tools_webview_read_file(path: String) -> Result<WebviewReadFilePayload, HostError> {
    let target = PathBuf::from(require_non_empty(path, "path")?);
    let meta = build_file_meta(&target)?;
    let bytes = fs::read(&target).map_err(HostError::io)?;
    Ok(WebviewReadFilePayload {
        path: meta.path,
        name: meta.name,
        size: meta.size,
        mime: meta.mime,
        last_modified: meta.last_modified,
        data_base64: BASE64_STANDARD.encode(bytes),
    })
}

pub async fn tools_webview_write_file(request: WebviewWriteFileRequest) -> Result<(), HostError> {
    let path = require_non_empty(request.path, "path")?;
    let bytes = BASE64_STANDARD
        .decode(request.data_base64.trim())
        .map_err(|error| {
            HostError::invalid_input("Invalid base64 file payload").with_detail(error.to_string())
        })?;
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }
    fs::write(target, bytes).map_err(HostError::io)
}

pub async fn tools_webview_list_dir(path: String) -> Result<Vec<WebviewDirEntry>, HostError> {
    build_dir_entries(&PathBuf::from(require_non_empty(path, "path")?))
}

pub async fn tools_webview_home_dir() -> Result<String, HostError> {
    Ok(default_dialog_dir().to_string_lossy().to_string())
}

pub async fn tools_webview_join_path(parts: Vec<String>) -> Result<String, HostError> {
    let filtered = parts
        .into_iter()
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if filtered.is_empty() {
        return Err(HostError::invalid_input("Path parts are required"));
    }
    let mut path = PathBuf::from(&filtered[0]);
    for part in filtered.iter().skip(1) {
        path.push(part);
    }
    Ok(path.to_string_lossy().to_string())
}

pub async fn tools_webview_create_dir(path: String) -> Result<(), HostError> {
    fs::create_dir_all(require_non_empty(path, "path")?).map_err(HostError::io)
}

pub async fn tools_webview_touch_file(path: String) -> Result<(), HostError> {
    let target = PathBuf::from(require_non_empty(path, "path")?);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }
    fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(target)
        .map(|_| ())
        .map_err(HostError::io)
}

pub async fn tools_webview_remove_entry(
    path: String,
    recursive: Option<bool>,
) -> Result<(), HostError> {
    let target = PathBuf::from(require_non_empty(path, "path")?);
    let meta = fs::metadata(&target).map_err(HostError::io)?;
    if meta.is_dir() {
        if recursive.unwrap_or(false) {
            fs::remove_dir_all(target).map_err(HostError::io)
        } else {
            fs::remove_dir(target).map_err(HostError::io)
        }
    } else {
        fs::remove_file(target).map_err(HostError::io)
    }
}

pub async fn tools_webview_rename_entry(
    request: WebviewRenameEntryRequest,
) -> Result<(), HostError> {
    let from = require_non_empty(request.from, "from")?;
    let to = require_non_empty(request.to, "to")?;
    fs::rename(from, to).map_err(HostError::io)
}

pub async fn tools_webview_browse_dialog(path: Option<String>) -> Result<Value, HostError> {
    let current_dir = path
        .as_deref()
        .map(PathBuf::from)
        .filter(|path| path.exists() && path.is_dir())
        .unwrap_or_else(default_dialog_dir);
    let parent_path = current_dir
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .filter(|path| !path.trim().is_empty());
    Ok(json!({
        "currentPath": current_dir.to_string_lossy(),
        "parentPath": parent_path,
        "fileName": Value::Null,
        "roots": collect_dialog_roots(),
        "entries": build_dir_entries(&current_dir)?,
    }))
}

pub async fn tools_webview_log(message: String) -> Result<(), HostError> {
    let text = message.trim();
    if !text.is_empty() {
        eprintln!("[OTools][WebviewFS] {text}");
    }
    Ok(())
}

pub async fn project_runner_read_scripts(
    working_dir: Option<String>,
) -> Result<ProjectScriptsResponse, HostError> {
    let Some(raw_working_dir) = working_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(empty_project_scripts_response());
    };

    let working_dir = PathBuf::from(&raw_working_dir);
    let package_json_path = working_dir.join("package.json");
    if !package_json_path.is_file() {
        return Ok(empty_project_scripts_response());
    }

    let content = std::fs::read_to_string(&package_json_path).map_err(HostError::io)?;
    let package_json: Value = serde_json::from_str(&content).map_err(|error| {
        HostError::configuration_invalid("Invalid package.json")
            .with_detail(format!("{}: {error}", package_json_path.display()))
    })?;

    let scripts = parse_package_scripts(&package_json);
    let (package_manager, command_prefix) =
        detect_project_package_manager(&working_dir, &package_json);

    Ok(ProjectScriptsResponse {
        has_package_json: true,
        package_manager: package_manager.to_string(),
        command_prefix: command_prefix.to_string(),
        scripts,
    })
}

pub async fn otools_set_status_bar_state(payload: Value) -> Result<Value, HostError> {
    Ok(json!({ "ok": true, "payload": payload }))
}

pub async fn otools_copy_text(text: String) -> Result<bool, HostError> {
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("clip")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(HostError::io)?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes()).map_err(HostError::io)?;
        }
        let status = child.wait().map_err(HostError::io)?;
        return Ok(status.success());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Ok(false)
    }
}

pub async fn otools_show_notification(
    body: String,
    click_feature_code: Option<String>,
) -> Result<(), HostError> {
    let title = click_feature_code.unwrap_or_else(|| "OTools".to_string());
    eprintln!("[OTools][Notification] {title}: {body}");
    Ok(())
}

pub async fn otools_host_scan_storage_catalog(catalog: Vec<Value>) -> Result<Value, HostError> {
    let mut total_bytes = 0_u64;
    let mut existing_items = 0_u64;
    let mut items = Vec::new();

    for item in catalog {
        let paths = value_string_array(item.get("paths")).unwrap_or_default();
        let mut item_bytes = 0_u64;
        let mut item_files = 0_u64;
        let mut path_entries = Vec::new();

        for raw_path in &paths {
            let path = PathBuf::from(expand_home_path(raw_path));
            let stats = scan_path(&path);
            item_bytes = item_bytes.saturating_add(stats.total_bytes);
            item_files = item_files.saturating_add(stats.file_count);
            path_entries.push(json!({
                "path": path.to_string_lossy(),
                "exists": stats.exists,
                "isSymlink": stats.is_symlink,
                "linkTarget": stats.link_target,
                "totalBytes": stats.total_bytes,
                "fileCount": stats.file_count,
            }));
        }

        if item_bytes > 0
            || path_entries
                .iter()
                .any(|entry| entry["exists"].as_bool() == Some(true))
        {
            existing_items += 1;
        }
        total_bytes = total_bytes.saturating_add(item_bytes);
        items.push(json!({
            "id": value_string(item.get("id")),
            "category": value_string(item.get("category")),
            "name": value_string(item.get("name")),
            "note": value_string(item.get("note")),
            "cleanLevel": value_string(item.get("cleanLevel")),
            "recommended": item.get("recommended").and_then(Value::as_bool).unwrap_or(false),
            "paths": paths,
            "pathEntries": path_entries,
            "exists": item_bytes > 0,
            "totalBytes": item_bytes,
            "fileCount": item_files,
        }));
    }

    Ok(json!({
        "os": std::env::consts::OS,
        "scannedAt": chrono::Utc::now().to_rfc3339(),
        "totalBytes": total_bytes,
        "existingItems": existing_items,
        "items": items,
    }))
}

pub async fn otools_host_clean_storage_paths(entries: Vec<Value>) -> Result<Vec<Value>, HostError> {
    let mut results = Vec::new();
    for entry in entries {
        let path = PathBuf::from(expand_home_path(&value_string(entry.get("path"))));
        let before = scan_path(&path).total_bytes;
        let success = clean_path(&path).is_ok();
        let after = scan_path(&path).total_bytes;
        results.push(json!({
            "itemId": value_string(entry.get("itemId")),
            "itemName": value_string(entry.get("itemName")),
            "path": path.to_string_lossy(),
            "beforeBytes": before,
            "afterBytes": after,
            "freedBytes": before.saturating_sub(after),
            "success": success,
            "message": if success { "ok" } else { "failed" },
        }));
    }
    Ok(results)
}

pub async fn otools_host_clean_storage_items(
    catalog: Vec<Value>,
    ids: Vec<String>,
) -> Result<Vec<Value>, HostError> {
    let id_set = ids.into_iter().collect::<std::collections::HashSet<_>>();
    let entries = catalog
        .into_iter()
        .filter(|item| id_set.contains(&value_string(item.get("id"))))
        .flat_map(|item| {
            let item_id = value_string(item.get("id"));
            let item_name = value_string(item.get("name"));
            value_string_array(item.get("paths"))
                .unwrap_or_default()
                .into_iter()
                .map(move |path| json!({ "path": path, "itemId": item_id, "itemName": item_name }))
        })
        .collect::<Vec<_>>();
    otools_host_clean_storage_paths(entries).await
}

pub async fn otools_host_get_package_status(
    manager: Option<String>,
    package_name: String,
    cask: Option<bool>,
) -> Result<Value, HostError> {
    let package_name = require_non_empty(package_name, "packageName")?;
    let manager = manager.unwrap_or_else(default_package_manager);
    let _ = cask;
    let installed = which::which(&package_name).is_ok();
    Ok(json!({
        "packageManager": manager,
        "packageName": package_name,
        "installed": installed,
        "installedVersion": Value::Null,
        "availableVersion": Value::Null,
        "upgradable": false,
        "message": if installed { "installed" } else { "not installed or not on PATH" },
        "command": format!("which {package_name}"),
        "stdout": "",
        "stderr": "",
    }))
}

pub async fn otools_host_get_packages_status(
    manager: Option<String>,
    package_names: Vec<String>,
    cask: Option<bool>,
) -> Result<Vec<Value>, HostError> {
    let mut out = Vec::new();
    for package_name in package_names {
        out.push(otools_host_get_package_status(manager.clone(), package_name, cask).await?);
    }
    Ok(out)
}

pub async fn otools_host_list_listen_processes() -> Result<Vec<Value>, HostError> {
    Ok(list_listen_processes())
}

pub async fn otools_host_kill_process(pid: u32) -> Result<(), HostError> {
    if pid == 0 {
        return Err(HostError::invalid_input("Invalid pid"));
    }
    let status = if cfg!(target_os = "windows") {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
    } else {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
    }
    .map_err(HostError::io)?;
    if status.success() {
        Ok(())
    } else {
        Err(HostError::task_execution_failed("Failed to kill process"))
    }
}

pub async fn otools_host_run_package_action(
    manager: Option<String>,
    package_name: String,
    action: Option<String>,
    version: Option<String>,
) -> Result<Value, HostError> {
    let package_name = require_non_empty(package_name, "packageName")?;
    let action = action.unwrap_or_else(|| "install".to_string());
    Ok(json!({
        "packageManager": manager.unwrap_or_else(default_package_manager),
        "packageName": package_name,
        "action": action,
        "success": false,
        "message": "Package actions require explicit desktop/native host support",
        "command": version.map(|v| format!("{v}")).unwrap_or_default(),
        "stdout": "",
        "stderr": "",
    }))
}

pub async fn otools_host_set_linux_privilege_password(
    password: String,
) -> Result<String, HostError> {
    #[cfg(target_os = "linux")]
    {
        validate_linux_sudo_password(&password)?;
        cache_linux_privilege_password(password.trim_end_matches(['\r', '\n']))?;
        let _ = read_linux_privilege_password()?;
        return Ok("cached".to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = password;
        Err(HostError::task_execution_failed("仅 Linux 支持该操作"))
    }
}

pub async fn otools_host_run_winget_install(
    package_name: String,
    options: Option<Value>,
) -> Result<Value, HostError> {
    let _ = options;
    otools_host_run_package_action(
        Some("winget".to_string()),
        package_name,
        Some("install".to_string()),
        None,
    )
    .await
}

pub async fn otools_host_http_write_base64_file(
    file_path: String,
    data_base64: String,
) -> Result<(), HostError> {
    tools_webview_write_file(WebviewWriteFileRequest {
        path: file_path,
        data_base64,
    })
    .await
}

pub async fn otools_host_http_send(request: Value) -> Result<Value, HostError> {
    let method = value_string(request.get("method")).to_ascii_uppercase();
    let url = require_non_empty(value_string(request.get("url")), "url")?;
    let client = reqwest::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| {
        HostError::invalid_input("Invalid HTTP method").with_detail(error.to_string())
    })?;
    let mut builder = client.request(method, url);
    if let Some(headers) = request.get("headers").and_then(Value::as_object) {
        for (key, value) in headers {
            if let Some(value) = value.as_str() {
                builder = builder.header(key, value);
            }
        }
    }
    if let Some(body) = request.get("body") {
        if let Some(text) = body.as_str() {
            builder = builder.body(text.to_string());
        } else {
            builder = builder.json(body);
        }
    }
    let response = builder.send().await.map_err(|error| {
        HostError::task_execution_failed("OTools HTTP request failed")
            .with_detail(error.to_string())
    })?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(key, value)| {
            (
                key.as_str().to_string(),
                Value::String(value.to_str().unwrap_or_default().to_string()),
            )
        })
        .collect::<serde_json::Map<String, Value>>();
    let bytes = response.bytes().await.map_err(|error| {
        HostError::task_execution_failed("Failed to read OTools HTTP response")
            .with_detail(error.to_string())
    })?;
    Ok(json!({
        "status": status,
        "headers": headers,
        "bodyBase64": BASE64_STANDARD.encode(&bytes),
        "body": String::from_utf8_lossy(&bytes),
    }))
}
fn require_non_empty(value: String, name: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input(format!("{name} is required")));
    }
    Ok(trimmed.to_string())
}

fn empty_project_scripts_response() -> ProjectScriptsResponse {
    ProjectScriptsResponse {
        has_package_json: false,
        package_manager: "npm".to_string(),
        command_prefix: "npm run ".to_string(),
        scripts: Vec::new(),
    }
}

fn detect_project_package_manager(
    working_dir: &Path,
    package_json: &Value,
) -> (&'static str, &'static str) {
    if let Some(package_manager) = package_json
        .get("packageManager")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if package_manager.starts_with("pnpm@") {
            return ("pnpm", "pnpm run ");
        }
        if package_manager.starts_with("yarn@") {
            return ("yarn", "yarn ");
        }
        if package_manager.starts_with("bun@") {
            return ("bun", "bun run ");
        }
        if package_manager.starts_with("npm@") {
            return ("npm", "npm run ");
        }
    }

    if working_dir.join("pnpm-lock.yaml").is_file() {
        return ("pnpm", "pnpm run ");
    }
    if working_dir.join("yarn.lock").is_file() {
        return ("yarn", "yarn ");
    }
    if working_dir.join("package-lock.json").is_file() {
        return ("npm", "npm run ");
    }
    if working_dir.join("bun.lockb").is_file() || working_dir.join("bun.lock").is_file() {
        return ("bun", "bun run ");
    }

    ("npm", "npm run ")
}

fn parse_package_scripts(package_json: &Value) -> Vec<ProjectScriptInfo> {
    let Some(object) = package_json.get("scripts").and_then(Value::as_object) else {
        return Vec::new();
    };

    let sorted: std::collections::BTreeMap<String, String> = object
        .iter()
        .filter_map(|(name, value)| {
            value
                .as_str()
                .map(|command| (name.to_string(), command.to_string()))
        })
        .collect();

    sorted
        .into_iter()
        .map(|(name, command)| ProjectScriptInfo { name, command })
        .collect()
}

fn build_file_meta(path: &Path) -> Result<WebviewFileMeta, HostError> {
    let metadata = fs::metadata(path).map_err(HostError::io)?;
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);
    Ok(WebviewFileMeta {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string()),
        size: metadata.len(),
        mime: guess_mime(path).to_string(),
        last_modified,
    })
}

fn build_dir_entries(target: &Path) -> Result<Vec<WebviewDirEntry>, HostError> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(target).map_err(HostError::io)? {
        let entry = entry.map_err(HostError::io)?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .or_else(|_| fs::metadata(&path))
            .map_err(HostError::io)?;
        let is_dir = metadata.is_dir();
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64);
        entries.push(WebviewDirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            kind: if is_dir { "directory" } else { "file" }.to_string(),
            size: if is_dir { 0 } else { metadata.len() },
            mime: if is_dir {
                "inode/directory".to_string()
            } else {
                guess_mime(&path).to_string()
            },
            last_modified,
        });
    }
    entries.sort_by(
        |left, right| match (left.kind == "directory", right.kind == "directory") {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => left
                .name
                .to_lowercase()
                .cmp(&right.name.to_lowercase())
                .then_with(|| left.name.cmp(&right.name)),
        },
    );
    Ok(entries)
}

fn guess_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") | Some("htm") => "text/html",
        Some("js") | Some("mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("md") | Some("txt") | Some("log") => "text/plain",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn default_dialog_dir() -> PathBuf {
    dirs::home_dir()
        .filter(|path| path.exists() && path.is_dir())
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn collect_dialog_roots() -> Vec<Value> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(json!({
            "path": home.to_string_lossy(),
            "name": "Home",
        }));
    }
    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() && path.is_dir() {
                roots.push(json!({ "path": drive, "name": drive }));
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        roots.push(json!({ "path": "/", "name": "/" }));
    }
    roots
}

#[derive(Debug, Default)]
struct PathStats {
    exists: bool,
    is_symlink: bool,
    link_target: Option<String>,
    total_bytes: u64,
    file_count: u64,
}

fn scan_path(path: &Path) -> PathStats {
    let symlink_metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(_) => return PathStats::default(),
    };
    let is_symlink = symlink_metadata.file_type().is_symlink();
    let link_target = if is_symlink {
        fs::read_link(path)
            .ok()
            .map(|value| value.to_string_lossy().to_string())
    } else {
        None
    };
    if symlink_metadata.is_file() {
        return PathStats {
            exists: true,
            is_symlink,
            link_target,
            total_bytes: symlink_metadata.len(),
            file_count: 1,
        };
    }
    if !symlink_metadata.is_dir() {
        return PathStats {
            exists: true,
            is_symlink,
            link_target,
            total_bytes: 0,
            file_count: 0,
        };
    }

    let mut total_bytes = 0_u64;
    let mut file_count = 0_u64;
    for entry in WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                total_bytes = total_bytes.saturating_add(metadata.len());
                file_count = file_count.saturating_add(1);
            }
        }
    }
    PathStats {
        exists: true,
        is_symlink,
        link_target,
        total_bytes,
        file_count,
    }
}

fn clean_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("canonicalize failed: {error}"))?;
    if is_dangerous_clean_target(&canonical) {
        return Err("refusing to clean dangerous path".to_string());
    }
    let metadata = fs::symlink_metadata(&canonical).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(&canonical).map_err(|error| error.to_string())
    } else {
        fs::remove_file(&canonical).map_err(|error| error.to_string())
    }
}

fn is_dangerous_clean_target(path: &Path) -> bool {
    path.parent().is_none()
        || dirs::home_dir().as_deref() == Some(path)
        || std::env::current_dir()
            .ok()
            .as_deref()
            .is_some_and(|cwd| cwd == path)
}

fn expand_home_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "~" {
        return dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from(trimmed))
            .to_string_lossy()
            .to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    trimmed.to_string()
}

fn value_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn value_string_array(value: Option<&Value>) -> Option<Vec<String>> {
    value.and_then(Value::as_array).map(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect()
    })
}

fn default_package_manager() -> String {
    if cfg!(target_os = "windows") {
        "winget".to_string()
    } else if cfg!(target_os = "macos") {
        "brew".to_string()
    } else {
        "system".to_string()
    }
}

#[cfg(target_os = "linux")]
fn linux_is_root_user() -> bool {
    unsafe { libc::geteuid() == 0 }
}

#[cfg(target_os = "linux")]
fn linux_privilege_cache_ttl() -> Duration {
    Duration::from_secs(HOST_LINUX_PRIVILEGE_CACHE_TTL_SECS)
}

#[cfg(target_os = "linux")]
fn linux_privilege_key() -> &'static [u8] {
    HOST_LINUX_PRIVILEGE_KEY.get_or_init(|| {
        let first = uuid::Uuid::new_v4();
        let second = uuid::Uuid::new_v4();
        let mut bytes = Vec::with_capacity(32);
        bytes.extend_from_slice(first.as_bytes());
        bytes.extend_from_slice(second.as_bytes());
        bytes
    })
}

#[cfg(target_os = "linux")]
fn xor_crypt_bytes(input: &[u8]) -> Vec<u8> {
    let key = linux_privilege_key();
    input
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()])
        .collect()
}

#[cfg(target_os = "linux")]
fn cache_linux_privilege_password(password: &str) -> Result<(), HostError> {
    let cache = HOST_LINUX_PRIVILEGE_CACHE.get_or_init(|| Mutex::new(None));
    let encrypted_password = xor_crypt_bytes(password.as_bytes());
    let expires_at = Instant::now() + linux_privilege_cache_ttl();
    let mut guard = cache.lock().map_err(|_| {
        HostError::task_execution_failed("Linux sudo 缓存锁定失败")
    })?;
    *guard = Some(LinuxPrivilegeCacheEntry {
        encrypted_password,
        expires_at,
    });
    Ok(())
}

#[cfg(target_os = "linux")]
fn read_linux_privilege_password() -> Result<String, HostError> {
    if linux_is_root_user() {
        return Ok(String::new());
    }

    let cache = HOST_LINUX_PRIVILEGE_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().map_err(|_| {
        HostError::task_execution_failed("Linux sudo 缓存锁定失败")
    })?;
    let Some(entry) = guard.as_ref() else {
        return Err(HostError::task_execution_failed(
            HOST_LINUX_SUDO_PASSWORD_REQUIRED,
        ));
    };
    if Instant::now() > entry.expires_at {
        *guard = None;
        return Err(HostError::task_execution_failed(
            HOST_LINUX_SUDO_PASSWORD_REQUIRED,
        ));
    }

    let decrypted = xor_crypt_bytes(&entry.encrypted_password);
    String::from_utf8(decrypted).map_err(|_| {
        HostError::task_execution_failed(HOST_LINUX_SUDO_PASSWORD_REQUIRED)
    })
}

#[cfg(target_os = "linux")]
fn clear_linux_privilege_password() {
    if let Some(cache) = HOST_LINUX_PRIVILEGE_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            *guard = None;
        }
    }
}

#[cfg(target_os = "linux")]
fn validate_linux_sudo_password(password: &str) -> Result<(), HostError> {
    if linux_is_root_user() {
        return Ok(());
    }

    let normalized = password.trim_end_matches(['\r', '\n']);
    if normalized.is_empty() {
        return Err(HostError::task_execution_failed(
            HOST_LINUX_SUDO_PASSWORD_INVALID,
        ));
    }

    let output = Command::new("sudo")
        .args(["-S", "-p", "", "-v"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            if let Some(stdin) = child.stdin.as_mut() {
                stdin.write_all(format!("{normalized}\n").as_bytes())?;
            }
            child.wait_with_output()
        })
        .map_err(HostError::io)?;

    if output.status.success() {
        return Ok(());
    }

    clear_linux_privilege_password();
    Err(HostError::task_execution_failed(
        HOST_LINUX_SUDO_PASSWORD_INVALID,
    ))
}

fn list_listen_processes() -> Vec<Value> {
    collect_listen_processes()
        .unwrap_or_default()
        .into_iter()
        .map(|item| {
            json!({
                "pid": item.pid,
                "name": item.name,
                "command": item.command,
                "ports": item.ports,
            })
        })
        .collect()
}

#[derive(Debug)]
struct ListenProcessInfo {
    pid: u32,
    name: String,
    command: String,
    ports: Vec<u16>,
}

fn build_command_error(program: &str, output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if !stderr.is_empty() {
        format!("Failed to execute {program}: {stderr}")
    } else if !stdout.is_empty() {
        format!("Failed to execute {program}: {stdout}")
    } else {
        format!("Failed to execute {program}")
    }
}

fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to start {program}: {error}"))?;

    if !output.status.success() {
        return Err(build_command_error(program, &output));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn extract_port_from_endpoint(endpoint: &str) -> Option<u16> {
    let target = endpoint.split_whitespace().next()?.trim();
    if target.is_empty() || target.contains("->") {
        return None;
    }

    let raw = target.rsplit(':').next()?.trim();
    let digits = raw.trim_matches(|ch: char| !ch.is_ascii_digit());
    if digits.is_empty() {
        return None;
    }

    digits.parse::<u16>().ok()
}

fn sort_processes(items: &mut [ListenProcessInfo]) {
    items.sort_by(|left, right| {
        right
            .ports
            .len()
            .cmp(&left.ports.len())
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.pid.cmp(&right.pid))
    });
}

#[cfg(not(target_os = "windows"))]
fn collect_ports_by_pid_unix() -> HashMap<u32, BTreeSet<u16>> {
    let output = match run_command("lsof", &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };

    let mut ports_by_pid = HashMap::<u32, BTreeSet<u16>>::new();
    let mut current_pid = None;

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        let mut chars = line.chars();
        let Some(prefix) = chars.next() else {
            continue;
        };
        let payload = chars.as_str().trim();

        match prefix {
            'p' => current_pid = payload.parse::<u32>().ok(),
            'n' => {
                if let (Some(pid), Some(port)) =
                    (current_pid, extract_port_from_endpoint(payload))
                {
                    ports_by_pid.entry(pid).or_default().insert(port);
                }
            }
            _ => {}
        }
    }

    ports_by_pid
}

#[cfg(not(target_os = "windows"))]
fn collect_processes_unix() -> Result<Vec<ListenProcessInfo>, String> {
    let output = run_command("ps", &["-axo", "pid=,comm=,args="])?;
    let ports_by_pid = collect_ports_by_pid_unix();
    let mut processes = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut segments = trimmed.split_whitespace();
        let Some(pid_raw) = segments.next() else {
            continue;
        };
        let Some(name_raw) = segments.next() else {
            continue;
        };
        let Ok(pid) = pid_raw.parse::<u32>() else {
            continue;
        };

        let args = segments.collect::<Vec<_>>().join(" ");
        let name = name_raw.to_string();
        let command = if args.is_empty() { name.clone() } else { args };
        let ports = ports_by_pid
            .get(&pid)
            .map(|set| set.iter().copied().collect::<Vec<_>>())
            .unwrap_or_default();

        processes.push(ListenProcessInfo {
            pid,
            name,
            command,
            ports,
        });
    }

    sort_processes(&mut processes);
    Ok(processes)
}

#[cfg(target_os = "windows")]
fn collect_ports_by_pid_windows() -> HashMap<u32, BTreeSet<u16>> {
    let output = match run_command("netstat", &["-ano", "-p", "tcp"]) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };

    let mut ports_by_pid = HashMap::<u32, BTreeSet<u16>>::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 5 || !parts[3].eq_ignore_ascii_case("LISTENING") {
            continue;
        }

        let Ok(pid) = parts[4].parse::<u32>() else {
            continue;
        };
        if let Some(port) = extract_port_from_endpoint(parts[1]) {
            ports_by_pid.entry(pid).or_default().insert(port);
        }
    }

    ports_by_pid
}

#[cfg(target_os = "windows")]
fn collect_processes_windows() -> Result<Vec<ListenProcessInfo>, String> {
    let output = run_command("tasklist", &["/FO", "CSV", "/NH"])?;
    let ports_by_pid = collect_ports_by_pid_windows();
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .from_reader(output.as_bytes());
    let mut processes = Vec::new();

    for row in reader.records() {
        let Ok(record) = row else {
            continue;
        };
        if record.len() < 2 {
            continue;
        }

        let name = record.get(0).unwrap_or("").trim().to_string();
        let Ok(pid) = record.get(1).unwrap_or("").trim().parse::<u32>() else {
            continue;
        };
        let ports = ports_by_pid
            .get(&pid)
            .map(|set| set.iter().copied().collect::<Vec<_>>())
            .unwrap_or_default();

        processes.push(ListenProcessInfo {
            pid,
            name: name.clone(),
            command: name,
            ports,
        });
    }

    sort_processes(&mut processes);
    Ok(processes)
}

fn collect_listen_processes() -> Result<Vec<ListenProcessInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        return collect_processes_windows();
    }

    #[cfg(not(target_os = "windows"))]
    {
        collect_processes_unix()
    }
}

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use otools_core::HostError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

pub async fn tools_webview_file_meta(path: String) -> Result<WebviewFileMeta, HostError> {
    let target = PathBuf::from(require_non_empty(path, "path")?);
    build_file_meta(&target)
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
    let (current_dir, file_name) = resolve_dialog_target(path.as_deref());
    let parent_path = current_dir
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .filter(|path| !path.trim().is_empty());
    Ok(json!({
        "currentPath": current_dir.to_string_lossy(),
        "parentPath": parent_path,
        "fileName": file_name,
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


fn find_existing_directory(path: &Path) -> Option<PathBuf> {
    let mut current = Some(path.to_path_buf());
    while let Some(candidate) = current {
        if candidate.exists() && candidate.is_dir() {
            return Some(candidate);
        }
        current = candidate.parent().map(|value| value.to_path_buf());
    }
    None
}

fn resolve_dialog_target(path: Option<&str>) -> (PathBuf, Option<String>) {
    let requested = path.unwrap_or_default().trim();
    if requested.is_empty() {
        return (default_dialog_dir(), None);
    }

    let target = PathBuf::from(requested);
    if target.exists() && target.is_dir() {
        return (target, None);
    }

    let file_name = target
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty());

    if let Some(parent) = target.parent().and_then(find_existing_directory) {
        return (parent, file_name);
    }

    if let Some(existing) = find_existing_directory(&target) {
        return (existing, file_name);
    }

    (default_dialog_dir(), file_name)
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

fn require_non_empty(value: String, field: &'static str) -> Result<String, HostError> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(HostError::invalid_input(format!("{field} is required")))
    } else {
        Ok(value)
    }
}

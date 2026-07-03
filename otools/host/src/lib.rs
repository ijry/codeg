use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use walkdir::WalkDir;

mod catalog;
mod dev;
mod park;

pub use dev::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginInput, DevPluginRecord, DevPluginUpdateInput,
    DevPublishVersionInput, DevVersionRecord, DevWorkspace,
};
pub use park::{
    ParkCatalogItem, ParkCategory, ParkInstallInput, ParkInstallResult, ParkReviewItem,
    ParkUninstallInput, ParkUninstallResult, ParkWorkspace,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostErrorCode {
    InvalidInput,
    ConfigurationInvalid,
    NotFound,
    AlreadyExists,
    PermissionDenied,
    IoError,
    TaskExecutionFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{message}")]
pub struct HostError {
    pub code: HostErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl HostError {
    pub fn new(code: HostErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::InvalidInput, message)
    }

    pub fn configuration_invalid(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::ConfigurationInvalid, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::NotFound, message)
    }

    pub fn task_execution_failed(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::TaskExecutionFailed, message)
    }

    pub fn io(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => HostErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => HostErrorCode::PermissionDenied,
            std::io::ErrorKind::AlreadyExists => HostErrorCode::AlreadyExists,
            _ => HostErrorCode::IoError,
        };
        let message = match code {
            HostErrorCode::NotFound => "Resource not found",
            HostErrorCode::PermissionDenied => "Permission denied",
            HostErrorCode::AlreadyExists => "Resource already exists",
            _ => "I/O operation failed",
        };
        Self::new(code, message).with_detail(err.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsNavigationResult {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsPluginInfo {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    pub display_name_cn: Option<String>,
    pub developer_name: Option<String>,
    pub summary: Option<String>,
    pub version: Option<String>,
    pub icon: Option<String>,
    pub entry: String,
    pub open_in_browser: bool,
    pub native_enabled: bool,
    pub source: String,
    pub asset_base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtoolsManifest {
    uuid: Option<String>,
    packid: Option<String>,
    display_name: Option<String>,
    #[serde(alias = "displayNameCN")]
    display_name_cn: Option<String>,
    developer_name: Option<String>,
    summary: Option<String>,
    version: Option<String>,
    icon: Option<String>,
    entry: Option<String>,
    open_in_browser: Option<bool>,
    native: Option<OtoolsNativeManifest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtoolsNativeManifest {
    enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsNativeInvokeRequest {
    pub plugin_uuid: String,
    pub method: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsAssetPayload {
    pub path: String,
    pub mime: String,
    pub data_base64: String,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostInfo {
    pub data_dir: String,
    pub plugin_roots: Vec<String>,
    pub plugin_count: usize,
    pub platform: String,
}

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

pub fn open_otools_window_core() -> OtoolsNavigationResult {
    OtoolsNavigationResult {
        path: "/otools".to_string(),
    }
}

pub async fn otools_list_plugins() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    list_plugins_core()
}

pub async fn otools_host_info() -> Result<OtoolsHostInfo, HostError> {
    Ok(OtoolsHostInfo {
        data_dir: default_data_dir().to_string_lossy().to_string(),
        plugin_roots: plugin_roots()
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        plugin_count: list_plugins_core()?.len(),
        platform: std::env::consts::OS.to_string(),
    })
}

pub async fn otools_get_plugin(plugin_uuid: String) -> Result<OtoolsPluginInfo, HostError> {
    let plugin_uuid = validate_plugin_id(&plugin_uuid)?;
    list_plugins_core()?
        .into_iter()
        .find(|plugin| plugin.uuid == plugin_uuid || plugin.packid == plugin_uuid)
        .ok_or_else(|| HostError::not_found("OTools plugin not found"))
}

pub async fn otools_plugin_state_get(
    plugin_uuid: String,
    scheme: Option<String>,
) -> Result<Value, HostError> {
    let plugin_uuid = validate_plugin_id(&plugin_uuid)?;
    let path = state_path(&plugin_uuid, scheme.as_deref())?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let bytes = fs::read(&path).map_err(HostError::io)?;
    serde_json::from_slice(&bytes).map_err(|error| {
        HostError::configuration_invalid("Invalid OTools plugin state")
            .with_detail(error.to_string())
    })
}

pub async fn otools_plugin_state_set(
    plugin_uuid: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    let plugin_uuid = validate_plugin_id(&plugin_uuid)?;
    let path = state_path(&plugin_uuid, scheme.as_deref())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }
    let bytes = serde_json::to_vec_pretty(&state).map_err(|error| {
        HostError::invalid_input("Invalid OTools plugin state").with_detail(error.to_string())
    })?;
    fs::write(path, bytes).map_err(HostError::io)
}

pub async fn otools_get_plugin_asset(
    plugin_uuid: String,
    asset_path: String,
) -> Result<OtoolsAssetPayload, HostError> {
    let path = resolve_plugin_asset_path(&plugin_uuid, &asset_path)?;
    let bytes = fs::read(&path).map_err(HostError::io)?;
    let mime = guess_mime(&path).to_string();
    let text = if is_text_mime(&mime) {
        Some(String::from_utf8_lossy(&bytes).to_string())
    } else {
        None
    };
    Ok(OtoolsAssetPayload {
        path: path.to_string_lossy().to_string(),
        mime,
        data_base64: BASE64_STANDARD.encode(bytes),
        text,
    })
}

pub async fn dev_get_workspace() -> Result<DevWorkspace, HostError> {
    dev::dev_get_workspace().await
}

pub async fn dev_create_plugin(input: DevPluginInput) -> Result<DevPluginActionResult, HostError> {
    dev::dev_create_plugin(input).await
}

pub async fn dev_update_plugin(
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, HostError> {
    dev::dev_update_plugin(input).await
}

pub async fn dev_bind_plugin_directory(
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, HostError> {
    dev::dev_bind_plugin_directory(input).await
}

pub async fn dev_enable_debug(uuid: String) -> Result<String, HostError> {
    dev::dev_enable_debug(uuid).await
}

pub async fn dev_disable_debug(uuid: String) -> Result<String, HostError> {
    dev::dev_disable_debug(uuid).await
}

pub async fn dev_initialize_vue_project(uuid: String) -> Result<String, HostError> {
    dev::dev_initialize_vue_project(uuid).await
}

pub async fn dev_initialize_native_project(uuid: String) -> Result<String, HostError> {
    dev::dev_initialize_native_project(uuid).await
}

pub async fn dev_build_native_plugin(uuid: String) -> Result<String, HostError> {
    dev::dev_build_native_plugin(uuid).await
}

pub async fn dev_build_native_artifact(uuid: String) -> Result<String, HostError> {
    dev::dev_build_native_artifact(uuid).await
}

pub async fn dev_build_native_artifact_from_dir(
    directory_path: String,
) -> Result<String, HostError> {
    dev::dev_build_native_artifact_from_dir(directory_path).await
}

pub async fn dev_start_native_plugin_build(
    uuid: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    dev::dev_start_native_plugin_build(uuid).await
}

pub async fn dev_start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    dev::dev_start_native_artifact_build_from_dir(directory_path).await
}

pub async fn dev_get_native_build_job(
    job_id: String,
) -> Result<DevNativeBuildJobSnapshot, HostError> {
    dev::dev_get_native_build_job(job_id).await
}

pub async fn dev_get_native_config(uuid: String) -> Result<DevNativeConfig, HostError> {
    dev::dev_get_native_config(uuid).await
}

pub async fn dev_set_native_enabled(uuid: String, enabled: bool) -> Result<String, HostError> {
    dev::dev_set_native_enabled(uuid, enabled).await
}

pub async fn dev_pack_plugin(uuid: String) -> Result<DevPluginActionResult, HostError> {
    dev::dev_pack_plugin(uuid).await
}

pub async fn dev_publish_version(
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, HostError> {
    dev::dev_publish_version(input).await
}

pub async fn park_get_workspace(cate: Option<String>) -> Result<ParkWorkspace, HostError> {
    park::park_get_workspace(cate).await
}

pub async fn park_install_plugin(input: ParkInstallInput) -> Result<ParkInstallResult, HostError> {
    park::park_install_plugin(input).await
}

pub async fn park_install_offline_plugin(
    file_path: String,
) -> Result<ParkInstallResult, HostError> {
    park::park_install_offline_plugin(file_path).await
}

pub async fn park_uninstall_plugin(
    input: ParkUninstallInput,
) -> Result<ParkUninstallResult, HostError> {
    park::park_uninstall_plugin(input).await
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

pub fn resolve_plugin_asset_path(
    plugin_uuid: &str,
    asset_path: &str,
) -> Result<PathBuf, HostError> {
    let plugin = otools_get_plugin_blocking(plugin_uuid)?;
    let root = plugin_root(&plugin.uuid)?;
    let relative = sanitize_relative_path(if asset_path.is_empty() {
        plugin.entry.as_str()
    } else {
        asset_path
    })?;
    let candidate = root.join(relative);
    let canonical_root = root.canonicalize().map_err(HostError::io)?;
    let canonical_file = candidate.canonicalize().map_err(HostError::io)?;
    if !canonical_file.starts_with(&canonical_root) || !canonical_file.is_file() {
        return Err(HostError::not_found("OTools asset not found"));
    }
    Ok(canonical_file)
}

fn otools_get_plugin_blocking(plugin_uuid: &str) -> Result<OtoolsPluginInfo, HostError> {
    let plugin_uuid = validate_plugin_id(plugin_uuid)?;
    list_plugins_core()?
        .into_iter()
        .find(|plugin| plugin.uuid == plugin_uuid || plugin.packid == plugin_uuid)
        .ok_or_else(|| HostError::not_found("OTools plugin not found"))
}

fn list_plugins_core() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    let mut plugins = builtin_plugins();
    for plugin in catalog::read_plugins_file(&catalog::plugins_file_path())?
        .into_iter()
        .map(catalog::tool_plugin_to_info)
    {
        if !plugins
            .iter()
            .any(|existing| existing.uuid == plugin.uuid || existing.packid == plugin.packid)
        {
            plugins.push(plugin);
        }
    }
    for root in plugin_roots() {
        if !root.exists() {
            continue;
        }
        for entry in fs::read_dir(&root).map_err(HostError::io)? {
            let entry = entry.map_err(HostError::io)?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(plugin) = read_plugin_manifest(&path)? {
                if !plugins.iter().any(|existing| {
                    existing.uuid == plugin.uuid || existing.packid == plugin.packid
                }) {
                    plugins.push(plugin);
                }
            }
        }
    }
    plugins.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(plugins)
}

fn builtin_plugins() -> Vec<OtoolsPluginInfo> {
    catalog::inner_plugins()
        .into_iter()
        .map(catalog::tool_plugin_to_info)
        .collect()
}

fn read_plugin_manifest(root: &Path) -> Result<Option<OtoolsPluginInfo>, HostError> {
    let Some(manifest_path) = catalog::resolve_plugin_manifest_path(root) else {
        return Ok(None);
    };
    let bytes = fs::read(&manifest_path).map_err(HostError::io)?;
    let manifest: OtoolsManifest = serde_json::from_slice(&bytes).map_err(|error| {
        HostError::configuration_invalid("Invalid OTools plugin manifest")
            .with_detail(format!("{}: {error}", manifest_path.display()))
    })?;
    let fallback_id = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("otools-plugin")
        .to_string();
    let uuid = validate_plugin_id(manifest.uuid.as_deref().unwrap_or(&fallback_id))?;
    let packid = validate_plugin_id(manifest.packid.as_deref().unwrap_or(&uuid))?;
    let display_name = manifest
        .display_name
        .clone()
        .or_else(|| manifest.display_name_cn.clone())
        .unwrap_or_else(|| uuid.clone());
    let entry = sanitize_relative_path(manifest.entry.as_deref().unwrap_or("index.html"))?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(Some(OtoolsPluginInfo {
        uuid: uuid.clone(),
        packid,
        display_name,
        display_name_cn: manifest.display_name_cn,
        developer_name: manifest.developer_name,
        summary: manifest.summary,
        version: manifest.version,
        icon: manifest.icon,
        entry,
        open_in_browser: manifest.open_in_browser.unwrap_or(false),
        native_enabled: manifest
            .native
            .and_then(|native| native.enabled)
            .unwrap_or(false),
        source: "local".to_string(),
        asset_base_url: format!("/otools-assets/{uuid}"),
    }))
}

fn plugin_root(plugin_uuid: &str) -> Result<PathBuf, HostError> {
    let plugin = otools_get_plugin_blocking(plugin_uuid)?;
    if catalog::is_external_entry(&plugin.entry) {
        return Err(HostError::not_found(
            "OTools plugin does not have a local asset root",
        ));
    }
    for root in plugin_roots() {
        for id in [&plugin.uuid, &plugin.packid] {
            if id.trim().is_empty() {
                continue;
            }
            let candidate = root.join(id);
            if let Some(adapter_root) = catalog::resolve_plugin_adapter_root(&candidate) {
                return Ok(adapter_root);
            }
        }
    }
    Err(HostError::not_found("OTools plugin not found"))
}

fn plugin_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(value) = std::env::var("CODEG_OTOOLS_PLUGIN_DIR") {
        roots.push(PathBuf::from(value));
    }
    roots.push(catalog::installed_plugins_dir());
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("plugins"),
    );
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("MenuGit")
            .join("plugins"),
    );
    roots
}

fn state_path(plugin_uuid: &str, scheme: Option<&str>) -> Result<PathBuf, HostError> {
    let scheme = validate_state_scheme(scheme.unwrap_or("local"))?;
    Ok(catalog::state_dir()
        .join(scheme)
        .join(plugin_uuid)
        .join("state.json"))
}

fn default_data_dir() -> PathBuf {
    dirs::data_dir()
        .map(|dir| dir.join("codeg"))
        .unwrap_or_else(|| PathBuf::from(".codeg-data"))
}

fn validate_plugin_id(value: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(HostError::invalid_input("Invalid OTools plugin id"));
    }
    Ok(trimmed.to_string())
}

pub fn validate_plugin_id_for_host(value: &str) -> Result<String, HostError> {
    validate_plugin_id(value)
}

fn validate_state_scheme(value: &str) -> Result<String, HostError> {
    match value {
        "local" | "sync" => Ok(value.to_string()),
        _ => Err(HostError::invalid_input("Invalid OTools state scheme")),
    }
}

fn sanitize_relative_path(value: &str) -> Result<PathBuf, HostError> {
    let path = Path::new(value.trim_start_matches('/'));
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(HostError::invalid_input("Invalid OTools asset path"));
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => return Err(HostError::invalid_input("Invalid OTools asset path")),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(HostError::invalid_input("Invalid OTools asset path"));
    }
    Ok(clean)
}

fn require_non_empty(value: String, name: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input(format!("{name} is required")));
    }
    Ok(trimmed.to_string())
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

fn is_text_mime(mime: &str) -> bool {
    mime.starts_with("text/")
        || matches!(
            mime,
            "application/json" | "application/javascript" | "application/xml"
        )
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

fn list_listen_processes() -> Vec<Value> {
    if cfg!(target_os = "windows") {
        return Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .ok()
            .map(|output| parse_windows_netstat(&String::from_utf8_lossy(&output.stdout)))
            .unwrap_or_default();
    }

    Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN"])
        .output()
        .ok()
        .map(|output| parse_lsof_listen(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default()
}

fn parse_windows_netstat(output: &str) -> Vec<Value> {
    output
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 5 || !parts[0].eq_ignore_ascii_case("TCP") {
                return None;
            }
            if !parts[3].eq_ignore_ascii_case("LISTENING") {
                return None;
            }
            let pid = parts[4].parse::<u32>().ok()?;
            Some(json!({
                "pid": pid,
                "name": "",
                "command": "",
                "localAddress": parts[1],
                "localPort": parse_port(parts[1]),
                "protocol": "tcp",
            }))
        })
        .collect()
}

fn parse_lsof_listen(output: &str) -> Vec<Value> {
    output
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 9 {
                return None;
            }
            let pid = parts[1].parse::<u32>().ok()?;
            let endpoint = parts.last().copied().unwrap_or_default();
            Some(json!({
                "pid": pid,
                "name": parts[0],
                "command": parts[0],
                "localAddress": endpoint,
                "localPort": parse_port(endpoint),
                "protocol": "tcp",
            }))
        })
        .collect()
}

fn parse_port(endpoint: &str) -> Option<u16> {
    endpoint
        .rsplit(':')
        .next()
        .and_then(|part| part.trim().parse::<u16>().ok())
}

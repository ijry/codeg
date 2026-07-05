use std::fs;
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use otools_core::catalog;
pub use otools_core::{HostError, HostErrorCode, OtoolsPluginInfo};
pub use otools_ai::{
    OtoolsAiChatMessageRecord, OtoolsAiConfigInput, OtoolsAiGenerateTextRequest,
    OtoolsAiGenerateTextResult,
};
pub use otools_platform_filesystem::{
    create_directory, delete_directory, delete_file, read_directory_recursive, read_file_content,
    write_file_content, FsItem,
};
pub use otools_platform_host::{
    project_editor_open, project_runner_open_in_terminal, project_runner_read_scripts,
    OtoolsCopiedFile, ProjectScriptInfo, ProjectScriptsResponse, otools_copy_file,
    otools_copy_image, otools_copy_text, otools_get_copied_files,
    otools_get_file_icon, otools_host_clean_storage_items, otools_host_clean_storage_paths,
    otools_host_get_package_status, otools_host_get_packages_status, otools_host_http_send,
    otools_host_http_write_base64_file, otools_host_kill_process,
    otools_host_list_listen_processes, otools_host_run_package_action,
    otools_host_run_winget_install, otools_host_scan_storage_catalog,
    otools_host_set_linux_privilege_password, otools_set_status_bar_state,
    otools_shell_beep, otools_shell_open_external, otools_shell_open_path,
    otools_shell_show_item_in_folder, otools_shell_trash_item, otools_show_notification,
    resolve_upload_static_path, tools_webview_browse_dialog, tools_webview_create_dir,
    tools_webview_file_meta, tools_webview_home_dir, tools_webview_join_path,
    tools_webview_list_dir, tools_webview_log, tools_webview_read_file,
    tools_webview_remove_entry, tools_webview_rename_entry,
    tools_webview_touch_file, tools_webview_write_file, upload_save_image, SavedImage,
    WebviewDirEntry, WebviewFileMeta, WebviewReadFilePayload,
    WebviewRenameEntryRequest, WebviewWriteFileRequest,
};
pub use otools_plugin_config::{
    get_otools_config, get_otools_config_value, save_otools_config, save_otools_config_value,
    OtoolsConfig, OtoolsConfigTab,
};
pub use otools_plugin_dev::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginInput, DevPluginRecord, DevPluginUpdateInput,
    DevPublishVersionInput, DevVersionRecord, DevWorkspace,
};
pub use otools_plugin_park::{
    ParkCatalogItem, ParkCategory, ParkInstallInput, ParkInstallResult, ParkReviewItem,
    ParkUninstallInput, ParkUninstallResult, ParkWorkspace,
};
pub use otools_plugin_state::{
    get_otools_plugin_localstate, get_otools_plugin_localstate_value,
    get_otools_plugin_localstate_value_with_scheme, get_otools_plugin_localstate_with_scheme,
    get_otools_plugin_syncstate, get_otools_plugin_syncstate_value,
    get_otools_plugin_syncstate_value_with_scheme, get_otools_plugin_syncstate_with_scheme,
    patch_otools_plugin_localstate, patch_otools_plugin_localstate_with_scheme,
    patch_otools_plugin_syncstate, patch_otools_plugin_syncstate_with_scheme,
    save_otools_plugin_localstate, save_otools_plugin_localstate_value,
    save_otools_plugin_localstate_value_with_scheme, save_otools_plugin_localstate_with_scheme,
    save_otools_plugin_syncstate, save_otools_plugin_syncstate_value,
    save_otools_plugin_syncstate_value_with_scheme, save_otools_plugin_syncstate_with_scheme,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsNavigationResult {
    pub path: String,
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
    #[serde(default, deserialize_with = "catalog::deserialize_plugin_permissions")]
    permissions: Vec<String>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsPluginCommandInvokeRequest {
    pub plugin_uuid: String,
    pub command: String,
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
    pub app_name: String,
    pub app_version: String,
    pub data_dir: String,
    pub is_dev: bool,
    pub native_id: String,
    pub plugin_roots: Vec<String>,
    pub plugin_count: usize,
    pub platform: String,
    pub paths: BTreeMap<String, String>,
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
        app_name: "codeg-plus".to_string(),
        app_version: String::new(),
        data_dir: otools_core::default_data_dir()
            .to_string_lossy()
            .to_string(),
        is_dev: cfg!(debug_assertions),
        native_id: get_or_create_otools_native_id()?,
        plugin_roots: plugin_roots()
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        plugin_count: list_plugins_core()?.len(),
        platform: std::env::consts::OS.to_string(),
        paths: build_host_paths(),
    })
}

fn build_host_paths() -> BTreeMap<String, String> {
    let mut paths = BTreeMap::new();
    let data_root = otools_core::default_data_dir();

    insert_path(&mut paths, "home", dirs::home_dir());
    insert_path(&mut paths, "desktop", dirs::desktop_dir());
    insert_path(&mut paths, "documents", dirs::document_dir());
    insert_path(&mut paths, "downloads", dirs::download_dir());
    insert_path(&mut paths, "music", dirs::audio_dir());
    insert_path(&mut paths, "pictures", dirs::picture_dir());
    insert_path(&mut paths, "videos", dirs::video_dir());
    insert_path(&mut paths, "cache", dirs::cache_dir());
    insert_path(&mut paths, "config", dirs::config_dir());
    insert_path(&mut paths, "data", dirs::data_dir());
    insert_path(&mut paths, "localData", dirs::data_local_dir());
    insert_path(&mut paths, "public", dirs::public_dir());
    insert_path(&mut paths, "appData", dirs::data_dir());
    insert_path(&mut paths, "userData", Some(data_root.clone()));
    insert_path(&mut paths, "appConfig", Some(data_root.join("config")));
    insert_path(&mut paths, "appCache", Some(data_root.join("cache")));
    insert_path(&mut paths, "temp", Some(std::env::temp_dir()));
    insert_path(
        &mut paths,
        "resource",
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.to_path_buf())),
    );
    insert_path(&mut paths, "executable", dirs::executable_dir());
    insert_path(&mut paths, "font", dirs::font_dir());
    insert_path(&mut paths, "runtime", dirs::runtime_dir());
    insert_path(&mut paths, "template", dirs::template_dir());
    insert_path(
        &mut paths,
        "logs",
        Some(otools_core::default_data_dir().join("logs")),
    );

    paths
}

fn insert_path(paths: &mut BTreeMap<String, String>, key: &str, value: Option<PathBuf>) {
    let Some(path) = value else {
        return;
    };
    paths.insert(key.to_string(), path.to_string_lossy().to_string());
}

fn get_or_create_otools_native_id() -> Result<String, HostError> {
    let path = catalog::otools_root_dir().join("native-id.txt");

    if let Ok(value) = fs::read_to_string(&path) {
        let native_id = value.trim();
        if !native_id.is_empty() {
            return Ok(native_id.to_string());
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }

    let native_id = uuid::Uuid::new_v4().to_string();
    fs::write(&path, &native_id).map_err(HostError::io)?;
    Ok(native_id)
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
    validate_plugin_id(&plugin_uuid)?;
    otools_plugin_state::otools_plugin_state_get(plugin_uuid, scheme)
}

pub async fn otools_plugin_state_set(
    plugin_uuid: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    validate_plugin_id(&plugin_uuid)?;
    otools_plugin_state::otools_plugin_state_set(plugin_uuid, scheme, state)
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

pub async fn otools_ai_generate_text(
    request: OtoolsAiGenerateTextRequest,
) -> Result<String, HostError> {
    otools_ai::generate_text(request).await.map(|result| result.text)
}

pub async fn otools_host_repair_json_text(raw_text: String) -> Result<String, HostError> {
    otools_ai::repair_json_text(raw_text).await
}

pub async fn otools_ai_load_chat_history(
    prefix: String,
) -> Result<Vec<OtoolsAiChatMessageRecord>, HostError> {
    otools_ai::load_chat_history(prefix).await
}

pub async fn otools_ai_save_chat_history(
    prefix: String,
    messages: Vec<OtoolsAiChatMessageRecord>,
) -> Result<(), HostError> {
    otools_ai::save_chat_history(prefix, messages).await
}

pub async fn otools_plugin_command_invoke(
    request: OtoolsPluginCommandInvokeRequest,
) -> Result<Value, HostError> {
    let plugin_uuid = validate_plugin_id(&request.plugin_uuid)?;
    let command = validate_plugin_command(&request.command)?;
    if otools_plugin_dev::supports_plugin(&plugin_uuid) {
        return otools_plugin_dev::dispatch_command(&command, request.payload).await;
    }
    if otools_plugin_park::supports_plugin(&plugin_uuid) {
        return otools_plugin_park::dispatch_command(&command, request.payload).await;
    }
    Err(HostError::not_found(format!(
        "No OTools host dispatcher registered for plugin: {plugin_uuid}"
    )))
}

pub async fn otools_emit_tools_shell_shortcut(action: String) -> Result<(), HostError> {
    validate_tools_shell_shortcut_action(&action)?;
    Ok(())
}

pub fn native_plugin_invoke(
    uuid: String,
    method: String,
    payload: Value,
) -> Result<Value, HostError> {
    otools_platform_native::native_plugin_invoke(uuid, method, payload)
        .map_err(HostError::task_execution_failed)
}

pub fn native_plugin_reload(uuid: String) -> Result<String, HostError> {
    otools_platform_native::native_plugin_reload(uuid).map_err(HostError::task_execution_failed)
}

pub fn native_plugin_probe(uuid: String) -> Result<Value, HostError> {
    otools_platform_native::native_plugin_probe(uuid).map_err(HostError::task_execution_failed)
}

pub fn native_plugin_poll_events(uuid: String) -> Result<Vec<Value>, HostError> {
    otools_platform_native::native_plugin_poll_events(uuid)
        .map_err(HostError::task_execution_failed)
}

pub async fn otools_get_plugins_file_path() -> Result<String, HostError> {
    Ok(catalog::plugins_file_path().to_string_lossy().to_string())
}

pub async fn dev_get_workspace() -> Result<DevWorkspace, HostError> {
    otools_plugin_dev::dev_get_workspace().await
}

pub async fn dev_create_plugin(input: DevPluginInput) -> Result<DevPluginActionResult, HostError> {
    otools_plugin_dev::dev_create_plugin(input).await
}

pub async fn dev_update_plugin(
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, HostError> {
    otools_plugin_dev::dev_update_plugin(input).await
}

pub async fn dev_bind_plugin_directory(
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, HostError> {
    otools_plugin_dev::dev_bind_plugin_directory(input).await
}

pub async fn dev_enable_debug(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_enable_debug(uuid).await
}

pub async fn dev_disable_debug(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_disable_debug(uuid).await
}

pub async fn dev_initialize_vue_project(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_initialize_vue_project(uuid).await
}

pub async fn dev_initialize_native_project(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_initialize_native_project(uuid).await
}

pub async fn dev_build_native_plugin(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_build_native_plugin(uuid).await
}

pub async fn dev_build_native_artifact(uuid: String) -> Result<String, HostError> {
    otools_plugin_dev::dev_build_native_artifact(uuid).await
}

pub async fn dev_build_native_artifact_from_dir(
    directory_path: String,
) -> Result<String, HostError> {
    otools_plugin_dev::dev_build_native_artifact_from_dir(directory_path).await
}

pub async fn dev_start_native_plugin_build(
    uuid: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    otools_plugin_dev::dev_start_native_plugin_build(uuid).await
}

pub async fn dev_start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    otools_plugin_dev::dev_start_native_artifact_build_from_dir(directory_path).await
}

pub async fn dev_get_native_build_job(
    job_id: String,
) -> Result<DevNativeBuildJobSnapshot, HostError> {
    otools_plugin_dev::dev_get_native_build_job(job_id).await
}

pub async fn dev_get_native_config(uuid: String) -> Result<DevNativeConfig, HostError> {
    otools_plugin_dev::dev_get_native_config(uuid).await
}

pub async fn dev_set_native_enabled(uuid: String, enabled: bool) -> Result<String, HostError> {
    otools_plugin_dev::dev_set_native_enabled(uuid, enabled).await
}

pub async fn dev_pack_plugin(uuid: String) -> Result<DevPluginActionResult, HostError> {
    otools_plugin_dev::dev_pack_plugin(uuid).await
}

pub async fn dev_publish_version(
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, HostError> {
    otools_plugin_dev::dev_publish_version(input).await
}

pub async fn park_get_workspace(cate: Option<String>) -> Result<ParkWorkspace, HostError> {
    otools_plugin_park::park_get_workspace(cate).await
}

pub async fn park_install_plugin(input: ParkInstallInput) -> Result<ParkInstallResult, HostError> {
    otools_plugin_park::park_install_plugin(input).await
}

pub async fn park_install_offline_plugin(
    file_path: String,
) -> Result<ParkInstallResult, HostError> {
    otools_plugin_park::park_install_offline_plugin(file_path).await
}

pub async fn park_uninstall_plugin(
    input: ParkUninstallInput,
) -> Result<ParkUninstallResult, HostError> {
    otools_plugin_park::park_uninstall_plugin(input).await
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
        permissions: manifest.permissions,
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
    let mut roots = catalog::external_plugin_dirs();
    roots.push(catalog::installed_plugins_dir());
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("plugins"),
    );
    roots
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

fn validate_plugin_command(value: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(HostError::invalid_input("Invalid OTools plugin command"));
    }
    Ok(trimmed.to_string())
}

pub fn validate_tools_shell_shortcut_action(value: &str) -> Result<String, HostError> {
    match value.trim() {
        "closeActiveTab" | "activatePrevTab" | "activateNextTab" => {
            Ok(value.trim().to_string())
        }
        _ => Err(HostError::invalid_input(
            "Unsupported tools shell shortcut action",
        )),
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

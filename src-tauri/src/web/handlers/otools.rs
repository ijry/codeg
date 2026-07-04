use axum::{
    body::Body,
    extract::{Path, RawPathParams},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::app_error::AppCommandError;
use crate::commands::otools::{
    self, DevBindDirectoryInput, DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput,
    OtoolsNativeInvokeRequest, ParkInstallInput, ParkUninstallInput, WebviewRenameEntryRequest,
    WebviewWriteFileRequest,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenOtoolsWindowParams {
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginParams {
    pub plugin_uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStateGetParams {
    pub plugin_uuid: String,
    pub scheme: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStateSetParams {
    pub plugin_uuid: String,
    pub scheme: Option<String>,
    pub state: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigValueGetParams {
    pub key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigValueSetParams {
    pub key: String,
    pub value: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefixParams {
    pub prefix: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiChatHistoryParams {
    pub prefix: String,
    pub messages: Vec<otools::OtoolsAiChatMessageRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateTextParams {
    pub request: otools::OtoolsAiGenerateTextRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellShortcutParams {
    pub action: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOtoolsConfigParams {
    pub config: otools::OtoolsConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathParams {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEditorOpenParams {
    pub path: String,
    pub editor_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRunnerOpenInTerminalParams {
    pub working_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetParams {
    pub plugin_uuid: String,
    pub asset_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveEntryParams {
    pub path: String,
    pub recursive: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinPathParams {
    pub parts: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseDialogParams {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageParams {
    pub message: Option<String>,
    pub text: Option<String>,
    pub body: Option<String>,
    pub click_feature_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageScanParams {
    pub catalog: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCleanPathsParams {
    pub entries: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCleanItemsParams {
    pub catalog: Vec<Value>,
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageStatusParams {
    pub manager: Option<String>,
    pub package_name: String,
    pub cask: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagesStatusParams {
    pub manager: Option<String>,
    pub package_names: Vec<String>,
    pub cask: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageActionParams {
    pub manager: Option<String>,
    pub package_name: String,
    pub action: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillProcessParams {
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WingetInstallParams {
    pub package_name: String,
    pub options: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteBase64FileParams {
    pub file_path: String,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UuidParams {
    pub uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBuildJobParams {
    #[serde(alias = "job_id")]
    pub job_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEnabledParams {
    pub uuid: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkWorkspaceParams {
    pub cate: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineInstallParams {
    #[serde(alias = "file_path")]
    pub file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePluginInvokeParams {
    #[serde(alias = "plugin_uuid", alias = "pluginUuid")]
    pub uuid: String,
    pub method: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPathParams {
    #[serde(alias = "directory_path", alias = "path")]
    pub directory_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevCreatePluginParams {
    pub input: DevPluginInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevUpdatePluginParams {
    pub input: DevPluginUpdateInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevBindPluginDirectoryParams {
    pub input: DevBindDirectoryInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevPublishVersionParams {
    pub input: DevPublishVersionInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkInstallPluginParams {
    pub input: ParkInstallInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkUninstallPluginParams {
    pub input: ParkUninstallInput,
}

pub async fn open_otools_window(
    Json(params): Json<OpenOtoolsWindowParams>,
) -> Json<otools::OtoolsNavigationResult> {
    let _ = params.source;
    Json(otools::open_otools_window_core())
}

pub async fn otools_list_plugins() -> Result<Json<Vec<otools::OtoolsPluginInfo>>, AppCommandError> {
    Ok(Json(otools::otools_list_plugins().await?))
}

pub async fn otools_get_all_plugins(
) -> Result<Json<Vec<otools::OtoolsPluginInfo>>, AppCommandError> {
    Ok(Json(otools::otools_get_all_plugins().await?))
}

pub async fn otools_reload_all_plugins() -> Result<Json<()>, AppCommandError> {
    otools::otools_reload_all_plugins().await?;
    Ok(Json(()))
}

pub async fn bridge_ping() -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::bridge_ping().await?))
}

pub async fn otools_show_main_window() -> Result<Json<()>, AppCommandError> {
    otools::otools_show_main_window_core();
    Ok(Json(()))
}

pub async fn project_editor_open(
    Json(params): Json<ProjectEditorOpenParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::project_editor_open(params.path, params.editor_id).await?;
    Ok(Json(()))
}

pub async fn project_runner_open_in_terminal(
    Json(params): Json<ProjectRunnerOpenInTerminalParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::project_runner_open_in_terminal(params.working_dir).await?;
    Ok(Json(()))
}

pub async fn project_runner_read_scripts(
    Json(params): Json<ProjectRunnerOpenInTerminalParams>,
) -> Result<Json<otools::ProjectScriptsResponse>, AppCommandError> {
    Ok(Json(otools::project_runner_read_scripts(params.working_dir).await?))
}

pub async fn otools_host_info() -> Result<Json<otools::OtoolsHostInfo>, AppCommandError> {
    Ok(Json(otools::otools_host_info().await?))
}

pub async fn otools_get_plugin(
    Json(params): Json<PluginParams>,
) -> Result<Json<otools::OtoolsPluginInfo>, AppCommandError> {
    Ok(Json(otools::otools_get_plugin(params.plugin_uuid).await?))
}

pub async fn otools_plugin_state_get(
    Json(params): Json<PluginStateGetParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_plugin_state_get(params.plugin_uuid, params.scheme).await?,
    ))
}

pub async fn otools_plugin_state_set(
    Json(params): Json<PluginStateSetParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_plugin_state_set(params.plugin_uuid, params.scheme, params.state).await?;
    Ok(Json(()))
}

pub async fn otools_get_plugin_asset(
    Json(params): Json<AssetParams>,
) -> Result<Json<otools::OtoolsAssetPayload>, AppCommandError> {
    Ok(Json(
        otools::otools_get_plugin_asset(params.plugin_uuid, params.asset_path).await?,
    ))
}

pub async fn get_otools_config() -> Result<Json<otools::OtoolsConfig>, AppCommandError> {
    Ok(Json(otools::get_otools_config().await?))
}

pub async fn save_otools_config(
    Json(params): Json<SaveOtoolsConfigParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_config(params.config).await?;
    Ok(Json(()))
}

pub async fn get_otools_config_value(
    Json(params): Json<ConfigValueGetParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(otools::get_otools_config_value(params.key).await?))
}

pub async fn save_otools_config_value(
    Json(params): Json<ConfigValueSetParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_config_value(params.key, params.value).await?;
    Ok(Json(()))
}

pub async fn otools_ai_load_chat_history(
    Json(params): Json<PrefixParams>,
) -> Result<Json<Vec<otools::OtoolsAiChatMessageRecord>>, AppCommandError> {
    Ok(Json(otools::otools_ai_load_chat_history(params.prefix).await?))
}

pub async fn otools_ai_generate_text(
    Json(params): Json<AiGenerateTextParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::otools_ai_generate_text(params.request).await?))
}

pub async fn otools_ai_save_chat_history(
    Json(params): Json<SaveAiChatHistoryParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_ai_save_chat_history(params.prefix, params.messages).await?;
    Ok(Json(()))
}

pub async fn otools_emit_tools_shell_shortcut(
    Json(params): Json<ShellShortcutParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_emit_tools_shell_shortcut(params.action).await?;
    Ok(Json(()))
}

pub async fn otools_native_invoke(
    Json(params): Json<OtoolsNativeInvokeRequest>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(otools::otools_native_invoke(params).await?))
}

pub async fn native_plugin_invoke(
    Json(params): Json<NativePluginInvokeParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::native_plugin_invoke(params.uuid, params.method, params.payload).await?,
    ))
}

pub async fn native_plugin_probe(
    Json(params): Json<UuidParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(otools::native_plugin_probe(params.uuid).await?))
}

pub async fn native_plugin_reload(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::native_plugin_reload(params.uuid).await?))
}

pub async fn otools_poll_events() -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(otools::otools_poll_events().await?))
}

pub async fn dev_get_workspace() -> Result<Json<otools::DevWorkspace>, AppCommandError> {
    Ok(Json(otools::dev_get_workspace().await?))
}

pub async fn dev_create_plugin(
    Json(params): Json<DevCreatePluginParams>,
) -> Result<Json<otools::DevPluginActionResult>, AppCommandError> {
    Ok(Json(otools::dev_create_plugin(params.input).await?))
}

pub async fn dev_update_plugin(
    Json(params): Json<DevUpdatePluginParams>,
) -> Result<Json<otools::DevPluginActionResult>, AppCommandError> {
    Ok(Json(otools::dev_update_plugin(params.input).await?))
}

pub async fn dev_bind_plugin_directory(
    Json(params): Json<DevBindPluginDirectoryParams>,
) -> Result<Json<otools::DevPluginActionResult>, AppCommandError> {
    Ok(Json(otools::dev_bind_plugin_directory(params.input).await?))
}

pub async fn dev_enable_debug(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::dev_enable_debug(params.uuid).await?))
}

pub async fn dev_disable_debug(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::dev_disable_debug(params.uuid).await?))
}

pub async fn dev_initialize_vue_project(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::dev_initialize_vue_project(params.uuid).await?))
}

pub async fn dev_initialize_native_project(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(
        otools::dev_initialize_native_project(params.uuid).await?,
    ))
}

pub async fn dev_build_native_plugin(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::dev_build_native_plugin(params.uuid).await?))
}

pub async fn dev_build_native_artifact(
    Json(params): Json<UuidParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::dev_build_native_artifact(params.uuid).await?))
}

pub async fn dev_build_native_artifact_from_dir(
    Json(params): Json<DirectoryPathParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(
        otools::dev_build_native_artifact_from_dir(params.directory_path).await?,
    ))
}

pub async fn dev_start_native_plugin_build(
    Json(params): Json<UuidParams>,
) -> Result<Json<otools::DevNativeBuildJobStart>, AppCommandError> {
    Ok(Json(
        otools::dev_start_native_plugin_build(params.uuid).await?,
    ))
}

pub async fn dev_start_native_artifact_build_from_dir(
    Json(params): Json<DirectoryPathParams>,
) -> Result<Json<otools::DevNativeBuildJobStart>, AppCommandError> {
    Ok(Json(
        otools::dev_start_native_artifact_build_from_dir(params.directory_path).await?,
    ))
}

pub async fn dev_get_native_build_job(
    Json(params): Json<NativeBuildJobParams>,
) -> Result<Json<otools::DevNativeBuildJobSnapshot>, AppCommandError> {
    Ok(Json(otools::dev_get_native_build_job(params.job_id).await?))
}

pub async fn dev_get_native_config(
    Json(params): Json<UuidParams>,
) -> Result<Json<otools::DevNativeConfig>, AppCommandError> {
    Ok(Json(otools::dev_get_native_config(params.uuid).await?))
}

pub async fn dev_set_native_enabled(
    Json(params): Json<NativeEnabledParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(
        otools::dev_set_native_enabled(params.uuid, params.enabled).await?,
    ))
}

pub async fn dev_pack_plugin(
    Json(params): Json<UuidParams>,
) -> Result<Json<otools::DevPluginActionResult>, AppCommandError> {
    Ok(Json(otools::dev_pack_plugin(params.uuid).await?))
}

pub async fn dev_publish_version(
    Json(params): Json<DevPublishVersionParams>,
) -> Result<Json<otools::DevPluginActionResult>, AppCommandError> {
    Ok(Json(otools::dev_publish_version(params.input).await?))
}

pub async fn park_get_workspace(
    Json(params): Json<ParkWorkspaceParams>,
) -> Result<Json<otools::ParkWorkspace>, AppCommandError> {
    Ok(Json(otools::park_get_workspace(params.cate).await?))
}

pub async fn park_install_plugin(
    Json(params): Json<ParkInstallPluginParams>,
) -> Result<Json<otools::ParkInstallResult>, AppCommandError> {
    Ok(Json(otools::park_install_plugin(params.input).await?))
}

pub async fn park_install_offline_plugin(
    Json(params): Json<OfflineInstallParams>,
) -> Result<Json<otools::ParkInstallResult>, AppCommandError> {
    Ok(Json(
        otools::park_install_offline_plugin(params.file_path).await?,
    ))
}

pub async fn park_uninstall_plugin(
    Json(params): Json<ParkUninstallPluginParams>,
) -> Result<Json<otools::ParkUninstallResult>, AppCommandError> {
    Ok(Json(otools::park_uninstall_plugin(params.input).await?))
}

pub async fn tools_webview_read_file(
    Json(params): Json<PathParams>,
) -> Result<Json<otools::WebviewReadFilePayload>, AppCommandError> {
    Ok(Json(otools::tools_webview_read_file(params.path).await?))
}

pub async fn tools_webview_write_file(
    Json(params): Json<WebviewWriteFileRequest>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_write_file(params).await?;
    Ok(Json(()))
}

pub async fn tools_webview_list_dir(
    Json(params): Json<PathParams>,
) -> Result<Json<Vec<otools::WebviewDirEntry>>, AppCommandError> {
    Ok(Json(otools::tools_webview_list_dir(params.path).await?))
}

pub async fn tools_webview_home_dir() -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::tools_webview_home_dir().await?))
}

pub async fn tools_webview_join_path(
    Json(params): Json<JoinPathParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::tools_webview_join_path(params.parts).await?))
}

pub async fn tools_webview_create_dir(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_create_dir(params.path).await?;
    Ok(Json(()))
}

pub async fn tools_webview_touch_file(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_touch_file(params.path).await?;
    Ok(Json(()))
}

pub async fn tools_webview_remove_entry(
    Json(params): Json<RemoveEntryParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_remove_entry(params.path, params.recursive).await?;
    Ok(Json(()))
}

pub async fn tools_webview_rename_entry(
    Json(params): Json<WebviewRenameEntryRequest>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_rename_entry(params).await?;
    Ok(Json(()))
}

pub async fn tools_webview_browse_dialog(
    Json(params): Json<BrowseDialogParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::tools_webview_browse_dialog(params.path).await?,
    ))
}

pub async fn tools_webview_log(
    Json(params): Json<MessageParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_log(params.message.unwrap_or_default()).await?;
    Ok(Json(()))
}

pub async fn otools_set_status_bar_state(
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(otools::otools_set_status_bar_state(payload).await?))
}

pub async fn otools_copy_text(
    Json(params): Json<MessageParams>,
) -> Result<Json<bool>, AppCommandError> {
    Ok(Json(
        otools::otools_copy_text(params.text.unwrap_or_default()).await?,
    ))
}

pub async fn otools_show_notification(
    Json(params): Json<MessageParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_show_notification(params.body.unwrap_or_default(), params.click_feature_code)
        .await?;
    Ok(Json(()))
}

pub async fn otools_host_scan_storage_catalog(
    Json(params): Json<StorageScanParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_host_scan_storage_catalog(params.catalog).await?,
    ))
}

pub async fn otools_host_clean_storage_paths(
    Json(params): Json<StorageCleanPathsParams>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(
        otools::otools_host_clean_storage_paths(params.entries).await?,
    ))
}

pub async fn otools_host_clean_storage_items(
    Json(params): Json<StorageCleanItemsParams>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(
        otools::otools_host_clean_storage_items(params.catalog, params.ids).await?,
    ))
}

pub async fn otools_host_get_package_status(
    Json(params): Json<PackageStatusParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_host_get_package_status(params.manager, params.package_name, params.cask)
            .await?,
    ))
}

pub async fn otools_host_get_packages_status(
    Json(params): Json<PackagesStatusParams>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(
        otools::otools_host_get_packages_status(params.manager, params.package_names, params.cask)
            .await?,
    ))
}

pub async fn otools_host_list_listen_processes() -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(otools::otools_host_list_listen_processes().await?))
}

pub async fn otools_host_kill_process(
    Json(params): Json<KillProcessParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_host_kill_process(params.pid).await?;
    Ok(Json(()))
}

pub async fn otools_host_run_package_action(
    Json(params): Json<PackageActionParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_host_run_package_action(
            params.manager,
            params.package_name,
            params.action,
            params.version,
        )
        .await?,
    ))
}

pub async fn otools_host_run_winget_install(
    Json(params): Json<WingetInstallParams>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_host_run_winget_install(params.package_name, params.options).await?,
    ))
}

pub async fn otools_host_http_write_base64_file(
    Json(params): Json<WriteBase64FileParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_host_http_write_base64_file(params.file_path, params.data_base64).await?;
    Ok(Json(()))
}

pub async fn otools_host_http_send(
    Json(request): Json<Value>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(otools::otools_host_http_send(request).await?))
}

pub async fn otools_asset(
    Path(plugin_uuid): Path<String>,
    raw_params: RawPathParams,
) -> Result<Response, AppCommandError> {
    let asset_path = raw_params
        .iter()
        .find(|(key, _)| *key == "*path" || *key == "path")
        .map(|(_, value)| value.to_string())
        .unwrap_or_default();
    let path = otools::resolve_plugin_asset_path(&plugin_uuid, &asset_path)?;
    let bytes = tokio::fs::read(&path).await.map_err(AppCommandError::io)?;
    let content_type = guess_content_type(&path);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(bytes))
        .map_err(|error| {
            AppCommandError::task_execution_failed("Failed to build OTools asset response")
                .with_detail(error.to_string())
        })
}

fn guess_content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("wasm") => "application/wasm",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

use axum::{
    body::Body,
    extract::{Extension, Path, Query, RawPathParams},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;
use std::io::SeekFrom;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::app_state::AppState;
use crate::app_error::AppCommandError;
use crate::commands::otools::{
    self, DevBindDirectoryInput, DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput,
    OtoolsNativeInvokeRequest, OtoolsPluginCommandInvokeRequest, ParkInstallInput,
    ParkUninstallInput, WebviewRenameEntryRequest, WebviewWriteFileRequest,
};
use crate::web::do_get_web_server_status;
#[cfg(feature = "tauri-runtime")]
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenOtoolsWindowParams {
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteUiParams {
    pub port: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostFileParams {
    pub path: String,
}

#[derive(Debug, Clone, Copy)]
struct OtoolsHostFileByteRange {
    start: u64,
    end: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginParams {
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStateGetParams {
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: String,
    pub scheme: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStateSetParams {
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: String,
    pub scheme: Option<String>,
    pub state: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsPluginStateParams {
    pub plugin: String,
    pub scheme: Option<String>,
    pub state: Option<Value>,
    pub key: Option<String>,
    pub value: Option<Value>,
    pub patch: Option<Value>,
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
pub struct RawTextParams {
    #[serde(alias = "raw_text")]
    pub raw_text: String,
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
pub struct UrlParams {
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEditorOpenParams {
    pub path: String,
    #[serde(alias = "editor_id")]
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
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: String,
    #[serde(alias = "asset_path")]
    pub asset_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentReadParams {
    #[serde(alias = "file_path")]
    pub file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentWriteParams {
    #[serde(alias = "file_path")]
    pub file_path: String,
    pub content: String,
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
pub struct CopyFileParams {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyImageParams {
    pub image: String,
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
    #[serde(alias = "package_name")]
    pub package_name: String,
    pub cask: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagesStatusParams {
    pub manager: Option<String>,
    #[serde(alias = "package_names")]
    pub package_names: Vec<String>,
    pub cask: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageActionParams {
    pub manager: Option<String>,
    #[serde(alias = "package_name")]
    pub package_name: String,
    pub action: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxPrivilegePasswordParams {
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillProcessParams {
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WingetInstallParams {
    #[serde(alias = "package_name")]
    pub package_name: String,
    pub options: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteBase64FileParams {
    #[serde(alias = "file_path")]
    pub file_path: String,
    #[serde(alias = "data_base64")]
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSaveImageParams {
    #[serde(alias = "file_name")]
    pub file_name: String,
    pub mime: String,
    #[serde(alias = "data_base64")]
    pub data_base64: String,
    #[serde(alias = "source_module")]
    pub source_module: Option<String>,
}


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSshServerParams {
    pub config: otools::SshConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendSshInputParams {
    #[serde(default, alias = "server_id")]
    pub server_id: String,
    #[serde(default, alias = "session_id")]
    pub session_id: String,
    #[serde(default)]
    pub input: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectSshServerParams {
    #[serde(default, alias = "server_id")]
    pub server_id: String,
    #[serde(default, alias = "session_id")]
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsSshConnectedParams {
    #[serde(default, alias = "session_id")]
    pub session_id: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UuidParams {
    #[serde(alias = "plugin_uuid", alias = "pluginUuid", alias = "plugin")]
    pub uuid: String,
    #[serde(rename = "intervalMs", alias = "interval_ms")]
    pub interval_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBindingParams {
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBindingUpsertParams {
    pub binding: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAtStartupParams {
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewWindowParams {
    pub label: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    #[serde(alias = "plugin_uuid")]
    pub plugin_uuid: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewLabelParams {
    pub label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSwitchParams {
    pub active_label: Option<String>,
    pub all_labels: Option<Vec<String>>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewLoadingParams {
    pub visible: Option<bool>,
    pub all_labels: Option<Vec<String>>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
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
    #[serde(alias = "plugin_uuid", alias = "pluginUuid", alias = "plugin")]
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

pub async fn otools_reload_all_plugins(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<otools::OtoolsPluginInfo>>, AppCommandError> {
    Ok(Json(
        otools::otools_reload_all_plugins_with_emitter(state.emitter.clone()).await?,
    ))
}

pub async fn bridge_ping() -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::bridge_ping().await?))
}

pub async fn otools_show_main_window(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        crate::commands::windows::show_main_window(&app);
        return Ok(Json(()));
    }

    crate::web::event_bridge::emit_event(
        &state.emitter,
        "otools-show-main-window",
        serde_json::json!({ "ok": true }),
    );
    otools::otools_show_main_window_core();
    Ok(Json(()))
}

pub async fn show_main_window(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        crate::commands::windows::show_main_window(&app);
        return Ok(Json(()));
    }

    crate::web::event_bridge::emit_event(
        &state.emitter,
        "otools-show-main-window",
        serde_json::json!({ "ok": true }),
    );
    otools::otools_show_main_window_core();
    Ok(Json(()))
}

pub async fn otools_hide_main_window(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
        return Ok(Json(()));
    }

    crate::web::event_bridge::emit_event(
        &state.emitter,
        "otools-hide-main-window",
        serde_json::json!({ "ok": true }),
    );
    Ok(Json(()))
}

pub async fn hide_main_window(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<()>, AppCommandError> {
    otools_hide_main_window(Extension(state)).await
}

pub async fn enable_remote_ui(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<RemoteUiParams>,
) -> Result<Json<String>, AppCommandError> {
    let _ = params.port;
    if let Some(info) = do_get_web_server_status(&state.web_server_state) {
        return Ok(Json(format!("Remote Service 已启动，端口: {}", info.port)));
    }
    Ok(Json("Remote Service 由 codeg Web 服务提供".to_string()))
}

pub async fn disable_remote_ui() -> Result<Json<String>, AppCommandError> {
    Ok(Json("Remote Service 由 codeg Web 服务管理".to_string()))
}

pub async fn remote_service_status(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(otools::remote_service_status_value(
        do_get_web_server_status(&state.web_server_state),
    )))
}

pub async fn otools_request_app_exit(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<()>, AppCommandError> {
    crate::web::event_bridge::emit_event(
        &state.emitter,
        "otools-request-app-exit",
        serde_json::json!({ "ok": true }),
    );
    Ok(Json(()))
}

pub async fn otools_get_launch_at_startup(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<bool>, AppCommandError> {
    let _ = &state;

    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        return Ok(Json(otools::otools_get_launch_at_startup(app).await?));
    }

    Ok(Json(false))
}

pub async fn otools_set_launch_at_startup(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<LaunchAtStartupParams>,
) -> Result<Json<bool>, AppCommandError> {
    let _ = &state;

    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        return Ok(Json(
            otools::otools_set_launch_at_startup(app, params.enabled).await?,
        ));
    }

    let _ = params.enabled;
    Ok(Json(false))
}

pub async fn otools_get_global_shortcut_bindings(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    let _ = &state;

    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let shortcut_state = app.state::<otools_platform_shortcuts::OtoolsGlobalShortcutState>();
        let bindings =
            otools_platform_shortcuts::otools_get_global_shortcut_bindings(&shortcut_state)
                .map_err(map_otools_host_error)?
                .into_iter()
                .filter_map(|binding| serde_json::to_value(binding).ok())
                .collect();
        return Ok(Json(bindings));
    }

    Ok(Json(Vec::new()))
}

pub async fn otools_get_global_shortcut_binding(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ShortcutBindingParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let shortcut_state = app.state::<otools_platform_shortcuts::OtoolsGlobalShortcutState>();
        let binding =
            otools_platform_shortcuts::otools_get_global_shortcut_binding(
                params.plugin_uuid,
                &shortcut_state,
            )
            .map_err(map_otools_host_error)?
            .and_then(|binding| serde_json::to_value(binding).ok());
        return Ok(Json(binding));
    }

    let _ = (state, params.plugin_uuid);
    Ok(Json(None))
}

pub async fn otools_upsert_global_shortcut_binding(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ShortcutBindingUpsertParams>,
) -> Result<Json<Value>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let binding =
            serde_json::from_value::<otools_platform_shortcuts::OtoolsGlobalShortcutBinding>(
                params.binding,
            )
            .map_err(|error| AppCommandError::invalid_input(error.to_string()))?;
        let shortcut_state = app.state::<otools_platform_shortcuts::OtoolsGlobalShortcutState>();
        let binding = otools_platform_shortcuts::otools_upsert_global_shortcut_binding(
                app.clone(),
                binding,
                &shortcut_state,
            )
            .map_err(map_otools_host_error)?;
        return serde_json::to_value(binding)
            .map(Json)
            .map_err(|error| AppCommandError::task_execution_failed(error.to_string()));
    }

    let _ = state;
    Ok(Json(params.binding))
}

pub async fn otools_remove_global_shortcut_binding(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ShortcutBindingParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let shortcut_state = app.state::<otools_platform_shortcuts::OtoolsGlobalShortcutState>();
        otools_platform_shortcuts::otools_remove_global_shortcut_binding(
            app.clone(),
            params.plugin_uuid,
            &shortcut_state,
        )
        .map_err(map_otools_host_error)?;
        return Ok(Json(()));
    }

    let _ = (state, params.plugin_uuid);
    Ok(Json(()))
}

pub async fn create_tools_tab_window(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewWindowParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::create_tools_tab_window(
            app,
            params.label.unwrap_or_default(),
            params.title.unwrap_or_default(),
            params.url.unwrap_or_default(),
            params.plugin_uuid,
        )
        .await
        .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn create_embedded_webview(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewWindowParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::create_embedded_webview(
            app,
            params.label.unwrap_or_default(),
            params.title.unwrap_or_default(),
            params.url.unwrap_or_default(),
        )
        .await
        .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn close_tools_tab_window(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewLabelParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::close_tools_tab_window(app, params.label.unwrap_or_default())
            .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn close_embedded_webview(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewLabelParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::close_embedded_webview(app, params.label.unwrap_or_default())
            .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn switch_and_position_tools_windows(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewSwitchParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::switch_and_position_tools_windows(
            app,
            params.active_label,
            params.all_labels.unwrap_or_default(),
            params.x.unwrap_or_default(),
            params.y.unwrap_or_default(),
            params.width.unwrap_or_default(),
            params.height.unwrap_or_default(),
        )
        .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn switch_and_position_embedded_webviews(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewSwitchParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::switch_and_position_embedded_webviews(
            app,
            params.active_label,
            params.all_labels.unwrap_or_default(),
            params.x.unwrap_or_default(),
            params.y.unwrap_or_default(),
            params.width.unwrap_or_default(),
            params.height.unwrap_or_default(),
        )
        .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn set_tools_loading_state(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewLoadingParams>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        otools_platform_webview::set_tools_loading_state(
            app,
            params.visible.unwrap_or(false),
            params.all_labels.unwrap_or_default(),
            params.x.unwrap_or_default(),
            params.y.unwrap_or_default(),
            params.width.unwrap_or_default(),
            params.height.unwrap_or_default(),
        )
        .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = params;
    Ok(Json(()))
}

pub async fn tools_tab_exists(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewLabelParams>,
) -> Result<Json<bool>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        return Ok(Json(otools_platform_webview::tools_tab_exists(
            app,
            params.label.unwrap_or_default(),
        )));
    }

    let _ = state;
    let _ = params;
    Ok(Json(false))
}

pub async fn embedded_webview_exists(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<WebviewLabelParams>,
) -> Result<Json<bool>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        return Ok(Json(otools_platform_webview::embedded_webview_exists(
            app,
            params.label.unwrap_or_default(),
        )));
    }

    let _ = state;
    let _ = params;
    Ok(Json(false))
}

pub async fn tools_sync_child_webview_theme(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let payload =
            serde_json::from_value::<otools_platform_webview::ToolsChildThemePayload>(payload)
                .map_err(|error| AppCommandError::invalid_input(error.to_string()))?;
        otools_platform_webview::tools_sync_child_webview_theme(app, payload)
            .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(()))
}

pub async fn tools_sync_child_webview_locale(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<()>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let payload =
            serde_json::from_value::<otools_platform_webview::ToolsChildLocalePayload>(payload)
                .map_err(|error| AppCommandError::invalid_input(error.to_string()))?;
        otools_platform_webview::tools_sync_child_webview_locale(app, payload)
            .map_err(map_otools_webview_error)?;
        return Ok(Json(()));
    }

    let _ = state;
    let _ = payload;
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

pub async fn otools_get_plugins_file_path() -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::otools_get_plugins_file_path().await?))
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

pub async fn get_otools_plugin_localstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(otools::get_otools_plugin_localstate(params.plugin).await?))
}

pub async fn save_otools_plugin_localstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_localstate(params.plugin, require_state(params.state)?).await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_localstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_localstate_with_scheme(params.plugin, params.scheme).await?,
    ))
}

pub async fn save_otools_plugin_localstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_localstate_with_scheme(
        params.plugin,
        params.scheme,
        require_state(params.state)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_syncstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(otools::get_otools_plugin_syncstate(params.plugin).await?))
}

pub async fn save_otools_plugin_syncstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_syncstate(params.plugin, require_state(params.state)?).await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_syncstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_syncstate_with_scheme(params.plugin, params.scheme).await?,
    ))
}

pub async fn save_otools_plugin_syncstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_syncstate_with_scheme(
        params.plugin,
        params.scheme,
        require_state(params.state)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_localstate_value(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_localstate_value(params.plugin, require_key(params.key)?).await?,
    ))
}

pub async fn save_otools_plugin_localstate_value(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_localstate_value(
        params.plugin,
        require_key(params.key)?,
        require_value(params.value)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn patch_otools_plugin_localstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::patch_otools_plugin_localstate(params.plugin, require_patch(params.patch)?).await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_localstate_value_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_localstate_value_with_scheme(
            params.plugin,
            params.scheme,
            require_key(params.key)?,
        )
        .await?,
    ))
}

pub async fn save_otools_plugin_localstate_value_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_localstate_value_with_scheme(
        params.plugin,
        params.scheme,
        require_key(params.key)?,
        require_value(params.value)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn patch_otools_plugin_localstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::patch_otools_plugin_localstate_with_scheme(
        params.plugin,
        params.scheme,
        require_patch(params.patch)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_syncstate_value(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_syncstate_value(params.plugin, require_key(params.key)?).await?,
    ))
}

pub async fn save_otools_plugin_syncstate_value(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_syncstate_value(
        params.plugin,
        require_key(params.key)?,
        require_value(params.value)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn patch_otools_plugin_syncstate(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::patch_otools_plugin_syncstate(params.plugin, require_patch(params.patch)?).await?;
    Ok(Json(()))
}

pub async fn get_otools_plugin_syncstate_value_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    Ok(Json(
        otools::get_otools_plugin_syncstate_value_with_scheme(
            params.plugin,
            params.scheme,
            require_key(params.key)?,
        )
        .await?,
    ))
}

pub async fn save_otools_plugin_syncstate_value_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::save_otools_plugin_syncstate_value_with_scheme(
        params.plugin,
        params.scheme,
        require_key(params.key)?,
        require_value(params.value)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn patch_otools_plugin_syncstate_with_scheme(
    Json(params): Json<OtoolsPluginStateParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::patch_otools_plugin_syncstate_with_scheme(
        params.plugin,
        params.scheme,
        require_patch(params.patch)?,
    )
    .await?;
    Ok(Json(()))
}

pub async fn otools_get_plugin_asset(
    Json(params): Json<AssetParams>,
) -> Result<Json<otools::OtoolsAssetPayload>, AppCommandError> {
    Ok(Json(
        otools::otools_get_plugin_asset(params.plugin_uuid, params.asset_path).await?,
    ))
}

pub async fn read_file_content(
    Json(params): Json<FileContentReadParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::read_file_content(params.file_path).await?))
}

pub async fn write_file_content(
    Json(params): Json<FileContentWriteParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::write_file_content(params.file_path, params.content).await?;
    Ok(Json(()))
}

pub async fn read_directory_recursive(
    Json(params): Json<PathParams>,
) -> Result<Json<Vec<otools::FsItem>>, AppCommandError> {
    Ok(Json(otools::read_directory_recursive(params.path).await?))
}

pub async fn create_directory(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::create_directory(params.path).await?;
    Ok(Json(()))
}

pub async fn delete_file(Json(params): Json<PathParams>) -> Result<Json<()>, AppCommandError> {
    otools::delete_file(params.path).await?;
    Ok(Json(()))
}

pub async fn delete_directory(Json(params): Json<PathParams>) -> Result<Json<()>, AppCommandError> {
    otools::delete_directory(params.path).await?;
    Ok(Json(()))
}

fn require_state(value: Option<Value>) -> Result<Value, AppCommandError> {
    value.ok_or_else(|| AppCommandError::invalid_input("state is required"))
}

fn require_value(value: Option<Value>) -> Result<Value, AppCommandError> {
    value.ok_or_else(|| AppCommandError::invalid_input("value is required"))
}

fn require_patch(value: Option<Value>) -> Result<Value, AppCommandError> {
    value.ok_or_else(|| AppCommandError::invalid_input("patch is required"))
}

fn require_key(value: Option<String>) -> Result<String, AppCommandError> {
    value.ok_or_else(|| AppCommandError::invalid_input("key is required"))
}

fn remote_request_payload(payload: Value) -> Value {
    payload
        .as_object()
        .and_then(|object| object.get("request"))
        .cloned()
        .unwrap_or(payload)
}

fn parse_remote_request<T: DeserializeOwned>(payload: Value) -> Result<T, AppCommandError> {
    serde_json::from_value(remote_request_payload(payload))
        .map_err(|error| AppCommandError::invalid_input(error.to_string()))
}

#[cfg(feature = "tauri-runtime")]
fn parse_webview_options_payload<T: DeserializeOwned>(
    payload: Value,
) -> Result<Option<T>, AppCommandError> {
    let options = payload
        .as_object()
        .and_then(|object| object.get("options"))
        .cloned()
        .unwrap_or(payload);
    if options.is_null() {
        return Ok(None);
    }
    serde_json::from_value(options)
        .map(Some)
        .map_err(|error| AppCommandError::invalid_input(error.to_string()))
}

fn read_remote_request_path(payload: Value) -> Option<String> {
    let request = remote_request_payload(payload);
    read_value_field(&request, "path")
}

fn read_value_field(value: &Value, field: &str) -> Option<String> {
    value
        .as_object()
        .and_then(|object| object.get(field))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(feature = "tauri-runtime")]
fn desktop_app_handle(state: &AppState) -> Option<tauri::AppHandle> {
    match &state.emitter {
        crate::web::event_bridge::EventEmitter::Tauri(app) => Some(app.clone()),
        _ => None,
    }
}

#[cfg(feature = "tauri-runtime")]
fn map_otools_host_error(error: otools_host::HostError) -> AppCommandError {
    let mut app_error = match error.code {
        otools_host::HostErrorCode::InvalidInput => {
            AppCommandError::invalid_input(error.message)
        }
        otools_host::HostErrorCode::ConfigurationInvalid => {
            AppCommandError::configuration_invalid(error.message)
        }
        otools_host::HostErrorCode::NotFound => AppCommandError::not_found(error.message),
        otools_host::HostErrorCode::AlreadyExists => {
            AppCommandError::already_exists(error.message)
        }
        otools_host::HostErrorCode::PermissionDenied => {
            AppCommandError::permission_denied(error.message)
        }
        otools_host::HostErrorCode::IoError => AppCommandError::io_error(error.message),
        otools_host::HostErrorCode::TaskExecutionFailed => {
            AppCommandError::task_execution_failed(error.message)
        }
    };
    app_error.detail = error.detail;
    app_error
}

#[cfg(feature = "tauri-runtime")]
fn map_otools_webview_error(message: String) -> AppCommandError {
    AppCommandError::task_execution_failed(message)
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

pub async fn otools_host_repair_json_text(
    Json(params): Json<RawTextParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::otools_host_repair_json_text(params.raw_text).await?))
}

pub async fn otools_ai_save_chat_history(
    Json(params): Json<SaveAiChatHistoryParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_ai_save_chat_history(params.prefix, params.messages).await?;
    Ok(Json(()))
}

pub async fn otools_plugin_command_invoke(
    Json(request): Json<OtoolsPluginCommandInvokeRequest>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_plugin_command_invoke(
            request.plugin_uuid,
            request.command,
            request.payload,
        )
        .await?,
    ))
}

pub async fn otools_emit_tools_shell_shortcut(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ShellShortcutParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_emit_tools_shell_shortcut_with_emitter(params.action, state.emitter.clone())
        .await?;
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

pub async fn native_plugin_poll_events(
    Json(params): Json<UuidParams>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    Ok(Json(otools::native_plugin_poll_events(params.uuid).await?))
}

pub async fn native_plugin_listen_acquire(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<UuidParams>,
) -> Result<Json<Value>, AppCommandError> {
    otools::native_plugin_listen_acquire_with_emitter(
        params.uuid.clone(),
        params.interval_ms,
        state.emitter.clone(),
    )?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "pluginUuid": params.uuid,
    })))
}

pub async fn native_plugin_listen_release(
    Json(params): Json<UuidParams>,
) -> Result<Json<Value>, AppCommandError> {
    otools::native_plugin_listen_release(params.uuid.clone()).await?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "pluginUuid": params.uuid,
    })))
}


pub async fn connect_ssh_server(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ConnectSshServerParams>,
) -> Result<Json<String>, AppCommandError> {
    let emitter = state.emitter.clone();
    let config = params.config;
    let message = tokio::task::spawn_blocking(move || {
        otools::connect_ssh_server_with_emitter(config, emitter)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("SSH connect task failed")
            .with_detail(error.to_string())
    })??;
    Ok(Json(message))
}

pub async fn send_ssh_input(
    Json(params): Json<SendSshInputParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::send_ssh_input(params.server_id, params.session_id, params.input).await?;
    Ok(Json(()))
}

pub async fn disconnect_ssh_server(
    Json(params): Json<DisconnectSshServerParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::disconnect_ssh_server(params.server_id, params.session_id).await?;
    Ok(Json(()))
}

pub async fn is_ssh_connected(
    Json(params): Json<IsSshConnectedParams>,
) -> Result<Json<bool>, AppCommandError> {
    Ok(Json(otools::is_ssh_connected(params.session_id).await?))
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

pub async fn tools_webview_pick_files(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let files = otools_platform_webview::tools_webview_pick_files(
            app,
            parse_webview_options_payload(payload)?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .into_iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(files));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(Vec::new()))
}

pub async fn tools_webview_pick_save_path(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let picked = otools_platform_webview::tools_webview_pick_save_path(
            app,
            parse_webview_options_payload(payload)?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(picked));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(None))
}

pub async fn tools_webview_pick_folder(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let picked = otools_platform_webview::tools_webview_pick_folder(
            app,
            parse_webview_options_payload(payload)?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(picked));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(None))
}

pub async fn remote_service_pick_files(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Vec<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let files = otools_platform_webview::tools_webview_pick_files(
            app,
            parse_webview_options_payload(remote_request_payload(payload))?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .into_iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(files));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(Vec::new()))
}

pub async fn remote_service_pick_save_path(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let picked = otools_platform_webview::tools_webview_pick_save_path(
            app,
            parse_webview_options_payload(remote_request_payload(payload))?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(picked));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(None))
}

pub async fn remote_service_pick_folder(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Option<Value>>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = desktop_app_handle(&state) {
        let picked = otools_platform_webview::tools_webview_pick_folder(
            app,
            parse_webview_options_payload(remote_request_payload(payload))?,
        )
        .await
        .map_err(map_otools_webview_error)?
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))?;
        return Ok(Json(picked));
    }

    let _ = state;
    let _ = payload;
    Ok(Json(None))
}

pub async fn remote_service_read_file(
    Json(params): Json<PathParams>,
) -> Result<Json<otools::WebviewReadFilePayload>, AppCommandError> {
    Ok(Json(otools::tools_webview_read_file(params.path).await?))
}

pub async fn remote_service_write_file(
    Json(payload): Json<Value>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_write_file(parse_remote_request(payload)?).await?;
    Ok(Json(()))
}

pub async fn remote_service_list_dir(
    Json(params): Json<PathParams>,
) -> Result<Json<Vec<otools::WebviewDirEntry>>, AppCommandError> {
    Ok(Json(otools::tools_webview_list_dir(params.path).await?))
}

pub async fn remote_service_browse_dialog(
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::tools_webview_browse_dialog(read_remote_request_path(payload)).await?,
    ))
}

pub async fn remote_service_home_dir() -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::tools_webview_home_dir().await?))
}

pub async fn remote_service_join_path(
    Json(params): Json<JoinPathParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::tools_webview_join_path(params.parts).await?))
}

pub async fn remote_service_create_dir(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_create_dir(params.path).await?;
    Ok(Json(()))
}

pub async fn remote_service_touch_file(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_touch_file(params.path).await?;
    Ok(Json(()))
}

pub async fn remote_service_remove_entry(
    Json(params): Json<RemoveEntryParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_remove_entry(params.path, params.recursive).await?;
    Ok(Json(()))
}

pub async fn remote_service_rename_entry(
    Json(payload): Json<Value>,
) -> Result<Json<()>, AppCommandError> {
    otools::tools_webview_rename_entry(parse_remote_request(payload)?).await?;
    Ok(Json(()))
}

pub async fn tools_webview_file_meta(
    Json(params): Json<PathParams>,
) -> Result<Json<otools::WebviewFileMeta>, AppCommandError> {
    Ok(Json(otools::tools_webview_file_meta(params.path).await?))
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

pub async fn upload_save_image(
    Json(params): Json<UploadSaveImageParams>,
) -> Result<Json<otools::SavedImage>, AppCommandError> {
    Ok(Json(
        otools::upload_save_image(
            params.file_name,
            params.mime,
            params.data_base64,
            params.source_module,
        )
        .await?,
    ))
}

pub async fn otools_set_status_bar_state(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, AppCommandError> {
    Ok(Json(
        otools::otools_set_status_bar_state_with_emitter(payload, state.emitter.clone()).await?,
    ))
}

pub async fn otools_copy_text(
    Json(params): Json<MessageParams>,
) -> Result<Json<bool>, AppCommandError> {
    Ok(Json(
        otools::otools_copy_text(params.text.unwrap_or_default()).await?,
    ))
}

pub async fn otools_copy_file(
    Json(params): Json<CopyFileParams>,
) -> Result<Json<bool>, AppCommandError> {
    Ok(Json(otools::otools_copy_file(params.paths).await?))
}

pub async fn otools_copy_image(
    Json(params): Json<CopyImageParams>,
) -> Result<Json<bool>, AppCommandError> {
    Ok(Json(otools::otools_copy_image(params.image).await?))
}

pub async fn otools_get_copied_files(
) -> Result<Json<Vec<otools::OtoolsCopiedFile>>, AppCommandError> {
    Ok(Json(otools::otools_get_copied_files().await?))
}

pub async fn otools_get_file_icon(
    Json(params): Json<PathParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(otools::otools_get_file_icon(params.path).await?))
}

pub async fn otools_shell_open_path(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_open_path(params.path).await?;
    Ok(Json(()))
}

pub async fn open_directory(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_open_path(params.path).await?;
    Ok(Json(()))
}

pub async fn remote_service_shell_open(
    Json(payload): Json<Value>,
) -> Result<Json<()>, AppCommandError> {
    let request = remote_request_payload(payload);
    let target = read_value_field(&request, "path")
        .or_else(|| read_value_field(&request, "url"))
        .unwrap_or_default();
    if target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with("tel:")
    {
        otools::otools_shell_open_external(target).await?;
    } else {
        otools::otools_shell_open_path(target).await?;
    }
    Ok(Json(()))
}

pub async fn remote_service_shell_open_path(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_open_path(params.path).await?;
    Ok(Json(()))
}

pub async fn otools_shell_show_item_in_folder(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_show_item_in_folder(params.path).await?;
    Ok(Json(()))
}

pub async fn remote_service_shell_show_item_in_folder(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_show_item_in_folder(params.path).await?;
    Ok(Json(()))
}

pub async fn otools_shell_trash_item(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_trash_item(params.path).await?;
    Ok(Json(()))
}

pub async fn remote_service_shell_trash_item(
    Json(params): Json<PathParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_trash_item(params.path).await?;
    Ok(Json(()))
}

pub async fn otools_shell_open_external(
    Json(params): Json<UrlParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_open_external(params.url).await?;
    Ok(Json(()))
}

pub async fn remote_service_shell_open_external(
    Json(params): Json<UrlParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_open_external(params.url).await?;
    Ok(Json(()))
}

pub async fn otools_shell_beep() -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_beep().await?;
    Ok(Json(()))
}

pub async fn remote_service_shell_beep() -> Result<Json<()>, AppCommandError> {
    otools::otools_shell_beep().await?;
    Ok(Json(()))
}

pub async fn otools_show_notification(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<MessageParams>,
) -> Result<Json<()>, AppCommandError> {
    otools::otools_show_notification_with_emitter(
        params.body.unwrap_or_default(),
        params.click_feature_code,
        state.emitter.clone(),
    )
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

pub async fn otools_host_set_linux_privilege_password(
    Json(params): Json<LinuxPrivilegePasswordParams>,
) -> Result<Json<String>, AppCommandError> {
    Ok(Json(
        otools::otools_host_set_linux_privilege_password(params.password).await?,
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

pub async fn otools_static(raw_params: RawPathParams) -> Result<Response, AppCommandError> {
    let asset_path = raw_params
        .iter()
        .find(|(key, _)| *key == "*path" || *key == "path")
        .map(|(_, value)| value.to_string())
        .unwrap_or_default();
    let path = otools::resolve_upload_static_path(&asset_path)?;
    let bytes = tokio::fs::read(&path).await.map_err(AppCommandError::io)?;
    let content_type = guess_content_type(&path);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .body(Body::from(bytes))
        .map_err(|error| {
            AppCommandError::task_execution_failed("Failed to build OTools static response")
                .with_detail(error.to_string())
        })
}

pub async fn otools_host_file(
    Query(params): Query<OtoolsHostFileParams>,
    request_headers: HeaderMap,
) -> Result<Response, AppCommandError> {
    let path = std::path::PathBuf::from(params.path.trim());
    if path.as_os_str().is_empty() {
        return Err(AppCommandError::invalid_input("path is required"));
    }

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(AppCommandError::io)?;
    if !metadata.is_file() {
        return Err(AppCommandError::invalid_input("path is not a file"));
    }

    let file_size = metadata.len();
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(guess_content_type(&path)),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));

    let range = match parse_host_file_range(request_headers.get(header::RANGE), file_size) {
        Ok(range) => range,
        Err(()) => {
            if let Ok(value) = HeaderValue::from_str(&format!("bytes */{file_size}")) {
                headers.insert(header::CONTENT_RANGE, value);
            }
            return build_otools_host_file_response(
                StatusCode::RANGE_NOT_SATISFIABLE,
                headers,
                Body::empty(),
            );
        }
    };

    if let Some(range) = range {
        let mut file = tokio::fs::File::open(&path)
            .await
            .map_err(AppCommandError::io)?;
        file.seek(SeekFrom::Start(range.start))
            .await
            .map_err(AppCommandError::io)?;
        let length = range.end - range.start + 1;
        if let Ok(value) = HeaderValue::from_str(&length.to_string()) {
            headers.insert(header::CONTENT_LENGTH, value);
        }
        if let Ok(value) =
            HeaderValue::from_str(&format!("bytes {}-{}/{}", range.start, range.end, file_size))
        {
            headers.insert(header::CONTENT_RANGE, value);
        }
        return build_otools_host_file_response(
            StatusCode::PARTIAL_CONTENT,
            headers,
            Body::from_stream(ReaderStream::new(file.take(length))),
        );
    }

    let file = tokio::fs::File::open(&path)
        .await
        .map_err(AppCommandError::io)?;
    if let Ok(length) = HeaderValue::from_str(&file_size.to_string()) {
        headers.insert(header::CONTENT_LENGTH, length);
    }
    build_otools_host_file_response(
        StatusCode::OK,
        headers,
        Body::from_stream(ReaderStream::new(file)),
    )
}

fn parse_host_file_range(
    header_value: Option<&HeaderValue>,
    file_size: u64,
) -> Result<Option<OtoolsHostFileByteRange>, ()> {
    let Some(header_value) = header_value else {
        return Ok(None);
    };
    let value = header_value.to_str().map_err(|_| ())?.trim();
    let Some(raw_range) = value.strip_prefix("bytes=") else {
        return Ok(None);
    };
    if file_size == 0 || raw_range.contains(',') {
        return Err(());
    }

    let (start_raw, end_raw) = raw_range.split_once('-').ok_or(())?;
    let start_raw = start_raw.trim();
    let end_raw = end_raw.trim();

    if start_raw.is_empty() {
        let suffix_length = end_raw.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 {
            return Err(());
        }
        let start = file_size.saturating_sub(suffix_length);
        return Ok(Some(OtoolsHostFileByteRange {
            start,
            end: file_size - 1,
        }));
    }

    let start = start_raw.parse::<u64>().map_err(|_| ())?;
    if start >= file_size {
        return Err(());
    }
    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw.parse::<u64>().map_err(|_| ())?.min(file_size - 1)
    };
    if end < start {
        return Err(());
    }

    Ok(Some(OtoolsHostFileByteRange { start, end }))
}

fn build_otools_host_file_response(
    status: StatusCode,
    headers: HeaderMap,
    body: Body,
) -> Result<Response, AppCommandError> {
    Response::builder()
        .status(status)
        .body(body)
        .map(|mut response| {
            response.headers_mut().extend(headers);
            response
        })
        .map_err(|error| {
            AppCommandError::task_execution_failed("Failed to build OTools host file response")
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
        Some("gif") => "image/gif",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("flac") => "audio/flac",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("wasm") => "application/wasm",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

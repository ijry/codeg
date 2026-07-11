#[cfg(feature = "tauri-runtime")]
use serde::Deserialize;
use serde_json::{json, Value};

use crate::app_error::{AppCommandError, AppErrorCode};

pub use otools_host::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput,
    DevWorkspace, FsItem, OtoolsAiChatMessageRecord, OtoolsAiGenerateTextRequest,
    OtoolsAssetPayload, OtoolsConfig, OtoolsConfigTab, OtoolsCopiedFile, OtoolsHostInfo,
    OtoolsNativeInvokeRequest, OtoolsPluginCommandInvokeRequest,
    OtoolsNavigationResult, OtoolsPluginInfo, ParkInstallInput, ParkInstallResult,
    ParkUninstallInput, ParkUninstallResult, ParkWorkspace, ProjectScriptsResponse, SavedImage,
    WebviewDirEntry, WebviewFileMeta, WebviewReadFilePayload, WebviewRenameEntryRequest,
    WebviewWriteFileRequest,
};
#[cfg(feature = "tauri-runtime")]
pub use otools_platform_shortcuts::OtoolsGlobalShortcutBinding;

pub fn open_otools_window_core() -> OtoolsNavigationResult {
    otools_host::open_otools_window_core()
}

pub fn otools_show_main_window_core() {}

pub fn remote_service_status_value(info: Option<crate::web::WebServerInfo>) -> Value {
    match info {
        Some(info) => json!({
            "running": true,
            "port": info.port,
            "urls": info.addresses,
        }),
        None => json!({
            "running": false,
            "port": 0,
            "urls": [],
        }),
    }
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn enable_remote_ui(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::web::WebServerState>,
    port: Option<u16>,
) -> Result<String, AppCommandError> {
    if let Some(info) = crate::web::do_get_web_server_status(&state) {
        return Ok(format!("Remote Service 已启动，端口: {}", info.port));
    }

    let info = crate::web::do_start_web_server_tauri(
        app,
        &state,
        port,
        None,
        None,
        crate::web::TunnelSyncReason::ManualStart,
    )
    .await?;
    Ok(format!("Remote Service 已启动，端口: {}", info.port))
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn disable_remote_ui(
    state: tauri::State<'_, crate::web::WebServerState>,
) -> Result<String, AppCommandError> {
    crate::web::do_stop_web_server(&state).await;
    Ok("Remote Service 已停止".to_string())
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_status(
    state: tauri::State<'_, crate::web::WebServerState>,
) -> Result<Value, AppCommandError> {
    Ok(remote_service_status_value(
        crate::web::do_get_web_server_status(&state),
    ))
}

#[cfg(feature = "tauri-runtime")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsWindowPositionInput {
    pub x: f64,
    pub y: f64,
}

#[cfg(feature = "tauri-runtime")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenOtoolsWebviewWindowRequest {
    pub label: String,
    pub title: Option<String>,
    pub url: String,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub min_width: Option<f64>,
    pub min_height: Option<f64>,
    pub center: Option<bool>,
    pub resizable: Option<bool>,
    pub focus: Option<bool>,
    pub decorations: Option<bool>,
    pub transparent: Option<bool>,
    pub always_on_top: Option<bool>,
    pub title_bar_style: Option<String>,
    pub hidden_title: Option<bool>,
    pub traffic_light_position: Option<OtoolsWindowPositionInput>,
}

#[cfg(feature = "tauri-runtime")]
fn otools_status_bar_text(value: Option<&Value>) -> Option<String> {
    let text = value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if text.is_empty() { None } else { Some(text) }
}

#[cfg(feature = "tauri-runtime")]
fn apply_otools_status_bar_state(payload: &Value) -> Result<(), AppCommandError> {
    let Some(app) = otools_platform_app::current_app_handle() else {
        return Ok(());
    };
    let Some(tray) = app.tray_by_id(crate::commands::windows::TRAY_ICON_ID) else {
        return Ok(());
    };

    let body = payload.as_object();
    let title = otools_status_bar_text(body.and_then(|item| item.get("title")));
    let tooltip = otools_status_bar_text(body.and_then(|item| item.get("tooltip")));
    let visible = body
        .and_then(|item| item.get("visible"))
        .and_then(Value::as_bool)
        .unwrap_or(true);

    #[cfg(target_os = "macos")]
    {
        tray.set_title(if visible { title.clone() } else { None })
            .map_err(|error| {
                AppCommandError::window("Failed to update OTools tray title", error.to_string())
            })?;
        tray.set_tooltip(Some(
            if visible {
                tooltip
                    .clone()
                    .or_else(|| title.clone())
                    .unwrap_or_else(|| "Codeg".to_string())
            } else {
                "Codeg".to_string()
            },
        ))
        .map_err(|error| {
            AppCommandError::window("Failed to update OTools tray tooltip", error.to_string())
        })?;
    }

    #[cfg(target_os = "windows")]
    {
        tray.set_tooltip(Some(
            if visible {
                tooltip
                    .clone()
                    .or_else(|| title.clone())
                    .unwrap_or_else(|| "Codeg".to_string())
            } else {
                "Codeg".to_string()
            },
        ))
        .map_err(|error| {
            AppCommandError::window("Failed to update OTools tray tooltip", error.to_string())
        })?;
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = title;
        let _ = tooltip;
        let _ = visible;
    }

    Ok(())
}

#[cfg(feature = "tauri-runtime")]
fn append_otools_query_param(route: String, key: &str, value: &str) -> String {
    let encoded = urlencoding::encode(value);
    if route.contains('?') {
        format!("{route}&{key}={encoded}")
    } else {
        format!("{route}?{key}={encoded}")
    }
}

#[cfg(feature = "tauri-runtime")]
fn append_otools_remote_context(
    route: String,
    remote_connection_id: Option<i32>,
    remote_window_id: Option<&str>,
) -> String {
    let Some(id) = remote_connection_id else {
        return route;
    };

    let route = append_otools_query_param(route, "remoteConnectionId", &id.to_string());
    match remote_window_id {
        Some(window_id) if !window_id.is_empty() => {
            append_otools_query_param(route, "remoteWindowId", window_id)
        }
        _ => route,
    }
}

#[cfg(feature = "tauri-runtime")]
fn resolve_otools_window_target(
    target: &str,
    remote_connection_id: Option<i32>,
) -> Result<(tauri::WebviewUrl, Option<String>, bool), AppCommandError> {
    let normalized = target.trim();
    if normalized.is_empty() {
        return Err(AppCommandError::invalid_input("url is required"));
    }

    if let Ok(external) = url::Url::parse(normalized) {
        return match external.scheme() {
            "http" | "https" => Ok((tauri::WebviewUrl::External(external), None, false)),
            _ => Err(AppCommandError::invalid_input(format!(
                "unsupported OTools window url scheme: {}",
                external.scheme()
            ))),
        };
    }

    let remote_window_id = remote_connection_id
        .map(|_| crate::commands::remote_workspace::new_remote_window_instance_id());
    let route = append_otools_remote_context(
        normalized.trim_start_matches('/').to_string(),
        remote_connection_id,
        remote_window_id.as_deref(),
    );
    Ok((tauri::WebviewUrl::App(route.into()), remote_window_id, true))
}

#[cfg(feature = "tauri-runtime")]
fn apply_otools_window_request<'a, R, M>(
    mut builder: tauri::WebviewWindowBuilder<'a, R, M>,
    request: &OpenOtoolsWebviewWindowRequest,
) -> tauri::WebviewWindowBuilder<'a, R, M>
where
    R: tauri::Runtime,
    M: tauri::Manager<R>,
{
    if request.width.is_some() || request.height.is_some() {
        builder = builder.inner_size(
            request.width.unwrap_or(1040.0),
            request.height.unwrap_or(760.0),
        );
    }

    if request.min_width.is_some() || request.min_height.is_some() {
        builder = builder.min_inner_size(
            request.min_width.unwrap_or(640.0),
            request.min_height.unwrap_or(480.0),
        );
    }

    if request.center.unwrap_or(true) {
        builder = builder.center();
    }

    if let Some(resizable) = request.resizable {
        builder = builder.resizable(resizable);
    }

    if let Some(decorations) = request.decorations {
        builder = builder.decorations(decorations);
    }

    if let Some(transparent) = request.transparent {
        builder = builder.transparent(transparent);
    }

    if let Some(always_on_top) = request.always_on_top {
        builder = builder.always_on_top(always_on_top);
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(hidden_title) = request.hidden_title {
            builder = builder.hidden_title(hidden_title);
        }

        if let Some(style) = request.title_bar_style.as_deref() {
            builder = match style {
                "overlay" => builder.title_bar_style(tauri::TitleBarStyle::Overlay),
                "transparent" => builder.title_bar_style(tauri::TitleBarStyle::Transparent),
                _ => builder,
            };
        }

        if let Some(position) = &request.traffic_light_position {
            builder = builder
                .traffic_light_position(tauri::LogicalPosition::new(position.x, position.y));
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = &request.hidden_title;
        let _ = &request.title_bar_style;
        let _ = &request.traffic_light_position;
    }

    builder
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn open_otools_window(
    app: tauri::AppHandle,
    remote_connection_id: Option<i32>,
) -> Result<(), AppCommandError> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let label = match remote_connection_id {
        Some(id) => format!("remote-otools-{id}"),
        None => "otools".to_string(),
    };
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        existing.set_focus().map_err(|error| {
            AppCommandError::window("Failed to focus OTools window", error.to_string())
        })?;
        return Ok(());
    }

    let (route, remote_window_id) = match remote_connection_id {
        Some(id) => {
            let remote_window_id =
                crate::commands::remote_workspace::new_remote_window_instance_id();
            (
                format!("otools?remoteConnectionId={id}&remoteWindowId={remote_window_id}"),
                Some(remote_window_id),
            )
        }
        None => ("otools".to_string(), None),
    };
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(route.into()))
        .title("OTools")
        .inner_size(1280.0, 840.0)
        .min_inner_size(900.0, 620.0)
        .center();
    let window = builder.build().map_err(|error| {
        AppCommandError::window("Failed to open OTools window", error.to_string())
    })?;
    if let Some(remote_window_id) = remote_window_id {
        if let Some(proxy) =
            app.try_state::<std::sync::Arc<crate::commands::remote_proxy::RemoteProxyState>>()
        {
            proxy
                .inner()
                .register_window_instance_cleanup(&window, remote_window_id);
        }
    }
    let _ = window.set_focus();
    Ok(())
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn open_otools_webview_window(
    app: tauri::AppHandle,
    request: OpenOtoolsWebviewWindowRequest,
    remote_connection_id: Option<i32>,
) -> Result<(), AppCommandError> {
    use tauri::Manager;

    let label = request.label.trim().to_string();
    if label.is_empty() {
        return Err(AppCommandError::invalid_input("label is required"));
    }

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        existing.set_focus().map_err(|error| {
            AppCommandError::window(
                "Failed to focus existing OTools webview window",
                error.to_string(),
            )
        })?;
        return Ok(());
    }

    let title = request
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("OTools");
    let (url, remote_window_id, is_app_window) =
        resolve_otools_window_target(&request.url, remote_connection_id)?;
    let builder = tauri::WebviewWindowBuilder::new(&app, &label, url).title(title);
    let builder = apply_otools_window_request(builder, &request);
    let builder = crate::commands::windows::apply_platform_window_style(builder);
    let window = builder.build().map_err(|error| {
        AppCommandError::window("Failed to open OTools webview window", error.to_string())
    })?;
    crate::commands::windows::post_window_setup(&window);

    if is_app_window {
        if let Some(remote_window_id) = remote_window_id {
            if let Some(proxy) =
                app.try_state::<std::sync::Arc<crate::commands::remote_proxy::RemoteProxyState>>()
            {
                proxy
                    .inner()
                    .register_window_instance_cleanup(&window, remote_window_id);
            }
        }
    }

    if request.focus.unwrap_or(true) {
        let _ = window.set_focus();
    }

    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_list_plugins() -> Result<Vec<OtoolsPluginInfo>, AppCommandError> {
    otools_host::otools_list_plugins()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_all_plugins() -> Result<Vec<OtoolsPluginInfo>, AppCommandError> {
    otools_list_plugins().await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_reload_all_plugins() -> Result<Vec<OtoolsPluginInfo>, AppCommandError> {
    otools_reload_all_plugins_with_emitter(resolve_otools_event_emitter()).await
}

pub async fn otools_reload_all_plugins_with_emitter(
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<Vec<OtoolsPluginInfo>, AppCommandError> {
    let plugins = otools_host::otools_reload_all_plugins()
        .await
        .map_err(map_host_error)?;
    crate::web::event_bridge::emit_event(
        &emitter,
        "otools-plugins-reloaded",
        json!({
            "count": plugins.len(),
            "plugins": plugins,
        }),
    );
    Ok(plugins)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn bridge_ping() -> Result<String, AppCommandError> {
    Ok("invoke-ok".to_string())
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_show_main_window(app: tauri::AppHandle) -> Result<(), AppCommandError> {
    crate::commands::windows::show_main_window(&app);
    Ok(())
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), AppCommandError> {
    otools_show_main_window(app).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_request_app_exit(app: tauri::AppHandle) -> Result<(), AppCommandError> {
    otools_platform_app::otools_request_app_exit(app).map_err(map_platform_app_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_launch_at_startup(
    app: tauri::AppHandle,
) -> Result<bool, AppCommandError> {
    otools_platform_app::otools_get_launch_at_startup(app)
        .await
        .map_err(map_platform_app_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_set_launch_at_startup(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, AppCommandError> {
    otools_platform_app::otools_set_launch_at_startup(app, enabled)
        .await
        .map_err(map_platform_app_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_global_shortcut_bindings(
    state: tauri::State<'_, otools_platform_shortcuts::OtoolsGlobalShortcutState>,
) -> Result<Vec<OtoolsGlobalShortcutBinding>, AppCommandError> {
    otools_platform_shortcuts::otools_get_global_shortcut_bindings(&state).map_err(map_host_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_global_shortcut_binding(
    plugin_uuid: String,
    state: tauri::State<'_, otools_platform_shortcuts::OtoolsGlobalShortcutState>,
) -> Result<Option<OtoolsGlobalShortcutBinding>, AppCommandError> {
    otools_platform_shortcuts::otools_get_global_shortcut_binding(plugin_uuid, &state)
        .map_err(map_host_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_upsert_global_shortcut_binding(
    app: tauri::AppHandle,
    binding: OtoolsGlobalShortcutBinding,
    state: tauri::State<'_, otools_platform_shortcuts::OtoolsGlobalShortcutState>,
) -> Result<OtoolsGlobalShortcutBinding, AppCommandError> {
    otools_platform_shortcuts::otools_upsert_global_shortcut_binding(app, binding, &state)
        .map_err(map_host_error)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_remove_global_shortcut_binding(
    app: tauri::AppHandle,
    plugin_uuid: String,
    state: tauri::State<'_, otools_platform_shortcuts::OtoolsGlobalShortcutState>,
) -> Result<(), AppCommandError> {
    otools_platform_shortcuts::otools_remove_global_shortcut_binding(app, plugin_uuid, &state)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn project_editor_open(
    path: String,
    editor_id: String,
) -> Result<(), AppCommandError> {
    otools_host::project_editor_open(path, editor_id)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn project_runner_open_in_terminal(
    working_dir: Option<String>,
) -> Result<(), AppCommandError> {
    otools_host::project_runner_open_in_terminal(working_dir)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn project_runner_read_scripts(
    working_dir: Option<String>,
) -> Result<ProjectScriptsResponse, AppCommandError> {
    otools_host::project_runner_read_scripts(working_dir)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_info() -> Result<OtoolsHostInfo, AppCommandError> {
    let mut info = otools_host::otools_host_info()
        .await
        .map_err(map_host_error)?;
    info.app_name = env!("CARGO_PKG_NAME").to_string();
    info.app_version = env!("CARGO_PKG_VERSION").to_string();
    info.is_dev = cfg!(debug_assertions);
    Ok(info)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_plugins_file_path() -> Result<String, AppCommandError> {
    otools_host::otools_get_plugins_file_path()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_plugin(plugin_uuid: String) -> Result<OtoolsPluginInfo, AppCommandError> {
    otools_host::otools_get_plugin(plugin_uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_plugin_state_get(
    plugin_uuid: String,
    scheme: Option<String>,
) -> Result<Value, AppCommandError> {
    otools_host::otools_plugin_state_get(plugin_uuid, scheme)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_plugin_state_set(
    plugin_uuid: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), AppCommandError> {
    otools_host::otools_plugin_state_set(plugin_uuid, scheme, state)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_localstate(
    plugin: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_localstate(plugin).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_localstate(
    plugin: String,
    state: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_localstate(plugin, state).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_localstate_with_scheme(plugin, scheme).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_localstate_with_scheme(plugin, scheme, state)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_syncstate(
    plugin: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_syncstate(plugin).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_syncstate(
    plugin: String,
    state: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_syncstate(plugin, state).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_syncstate_with_scheme(plugin, scheme).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_syncstate_with_scheme(plugin, scheme, state)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_localstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_localstate_value(plugin, key).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_localstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_localstate_value(plugin, key, value).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn patch_otools_plugin_localstate(
    plugin: String,
    patch: Value,
) -> Result<(), AppCommandError> {
    otools_host::patch_otools_plugin_localstate(plugin, patch).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_localstate_value_with_scheme(plugin, scheme, key)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_localstate_value_with_scheme(plugin, scheme, key, value)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn patch_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), AppCommandError> {
    otools_host::patch_otools_plugin_localstate_with_scheme(plugin, scheme, patch)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_syncstate_value(plugin, key).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_syncstate_value(plugin, key, value).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn patch_otools_plugin_syncstate(
    plugin: String,
    patch: Value,
) -> Result<(), AppCommandError> {
    otools_host::patch_otools_plugin_syncstate(plugin, patch).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_plugin_syncstate_value_with_scheme(plugin, scheme, key)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), AppCommandError> {
    otools_host::save_otools_plugin_syncstate_value_with_scheme(plugin, scheme, key, value)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn patch_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), AppCommandError> {
    otools_host::patch_otools_plugin_syncstate_with_scheme(plugin, scheme, patch)
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_plugin_asset(
    plugin_uuid: String,
    asset_path: String,
) -> Result<OtoolsAssetPayload, AppCommandError> {
    otools_host::otools_get_plugin_asset(plugin_uuid, asset_path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn read_file_content(file_path: String) -> Result<String, AppCommandError> {
    otools_host::read_file_content(file_path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn write_file_content(
    file_path: String,
    content: String,
) -> Result<(), AppCommandError> {
    otools_host::write_file_content(file_path, content)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn read_directory_recursive(path: String) -> Result<Vec<FsItem>, AppCommandError> {
    otools_host::read_directory_recursive(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn create_directory(path: String) -> Result<(), AppCommandError> {
    otools_host::create_directory(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn delete_file(path: String) -> Result<(), AppCommandError> {
    otools_host::delete_file(path).await.map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn delete_directory(path: String) -> Result<(), AppCommandError> {
    otools_host::delete_directory(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_config() -> Result<OtoolsConfig, AppCommandError> {
    otools_host::get_otools_config()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_config(config: OtoolsConfig) -> Result<(), AppCommandError> {
    otools_host::save_otools_config(config)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn get_otools_config_value(key: String) -> Result<Option<Value>, AppCommandError> {
    otools_host::get_otools_config_value(key)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn save_otools_config_value(key: String, value: Value) -> Result<(), AppCommandError> {
    otools_host::save_otools_config_value(key, value)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_ai_generate_text(
    request: OtoolsAiGenerateTextRequest,
) -> Result<String, AppCommandError> {
    otools_host::otools_ai_generate_text(request)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_repair_json_text(raw_text: String) -> Result<String, AppCommandError> {
    otools_host::otools_host_repair_json_text(raw_text)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_ai_load_chat_history(
    prefix: String,
) -> Result<Vec<OtoolsAiChatMessageRecord>, AppCommandError> {
    otools_host::otools_ai_load_chat_history(prefix)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_ai_save_chat_history(
    prefix: String,
    messages: Vec<OtoolsAiChatMessageRecord>,
) -> Result<(), AppCommandError> {
    otools_host::otools_ai_save_chat_history(prefix, messages)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_plugin_command_invoke(
    plugin_uuid: String,
    command: String,
    payload: Value,
) -> Result<Value, AppCommandError> {
    otools_host::otools_plugin_command_invoke(OtoolsPluginCommandInvokeRequest {
        plugin_uuid,
        command,
        payload,
    })
    .await
    .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_emit_tools_shell_shortcut(action: String) -> Result<(), AppCommandError> {
    otools_emit_tools_shell_shortcut_with_emitter(action, resolve_otools_event_emitter()).await
}

pub async fn otools_emit_tools_shell_shortcut_with_emitter(
    action: String,
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<(), AppCommandError> {
    let action =
        otools_host::validate_tools_shell_shortcut_action(&action).map_err(map_host_error)?;
    crate::web::event_bridge::emit_event(
        &emitter,
        "otools-tools-shell-shortcut",
        json!({ "action": action }),
    );
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn create_tools_tab_window(
    app: tauri::AppHandle,
    label: Option<String>,
    title: Option<String>,
    url: Option<String>,
    plugin_uuid: Option<String>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::create_tools_tab_window(
        app,
        label.unwrap_or_default(),
        title.unwrap_or_default(),
        url.unwrap_or_default(),
        plugin_uuid,
    )
    .await
    .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn create_tools_tab_window(
    label: Option<String>,
    title: Option<String>,
    url: Option<String>,
    plugin_uuid: Option<String>,
) -> Result<(), AppCommandError> {
    let _ = (label, title, url, plugin_uuid);
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn create_embedded_webview(
    app: tauri::AppHandle,
    label: Option<String>,
    title: Option<String>,
    url: Option<String>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::create_embedded_webview(
        app,
        label.unwrap_or_default(),
        title.unwrap_or_default(),
        url.unwrap_or_default(),
    )
    .await
    .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn create_embedded_webview(
    label: Option<String>,
    title: Option<String>,
    url: Option<String>,
) -> Result<(), AppCommandError> {
    let _ = (label, title, url);
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn close_tools_tab_window(
    app: tauri::AppHandle,
    label: Option<String>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::close_tools_tab_window(app, label.unwrap_or_default())
        .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn close_tools_tab_window(label: Option<String>) -> Result<(), AppCommandError> {
    let _ = label;
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn close_embedded_webview(
    app: tauri::AppHandle,
    label: Option<String>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::close_embedded_webview(app, label.unwrap_or_default())
        .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn close_embedded_webview(label: Option<String>) -> Result<(), AppCommandError> {
    let _ = label;
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn switch_and_position_tools_windows(
    app: tauri::AppHandle,
    active_label: Option<String>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::switch_and_position_tools_windows(
        app,
        active_label,
        all_labels.unwrap_or_default(),
        x.unwrap_or_default(),
        y.unwrap_or_default(),
        width.unwrap_or_default(),
        height.unwrap_or_default(),
    )
    .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn switch_and_position_tools_windows(
    active_label: Option<String>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    let _ = (active_label, all_labels, x, y, width, height);
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn switch_and_position_embedded_webviews(
    app: tauri::AppHandle,
    active_label: Option<String>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::switch_and_position_embedded_webviews(
        app,
        active_label,
        all_labels.unwrap_or_default(),
        x.unwrap_or_default(),
        y.unwrap_or_default(),
        width.unwrap_or_default(),
        height.unwrap_or_default(),
    )
    .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn switch_and_position_embedded_webviews(
    active_label: Option<String>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    let _ = (active_label, all_labels, x, y, width, height);
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn set_tools_loading_state(
    app: tauri::AppHandle,
    visible: Option<bool>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    otools_platform_webview::set_tools_loading_state(
        app,
        visible.unwrap_or(false),
        all_labels.unwrap_or_default(),
        x.unwrap_or_default(),
        y.unwrap_or_default(),
        width.unwrap_or_default(),
        height.unwrap_or_default(),
    )
    .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn set_tools_loading_state(
    visible: Option<bool>,
    all_labels: Option<Vec<String>>,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), AppCommandError> {
    let _ = (visible, all_labels, x, y, width, height);
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn tools_tab_exists(
    app: tauri::AppHandle,
    label: Option<String>,
) -> Result<bool, AppCommandError> {
    Ok(otools_platform_webview::tools_tab_exists(
        app,
        label.unwrap_or_default(),
    ))
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn tools_tab_exists(label: Option<String>) -> Result<bool, AppCommandError> {
    let _ = label;
    Ok(false)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn embedded_webview_exists(
    app: tauri::AppHandle,
    label: Option<String>,
) -> Result<bool, AppCommandError> {
    Ok(otools_platform_webview::embedded_webview_exists(
        app,
        label.unwrap_or_default(),
    ))
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn embedded_webview_exists(label: Option<String>) -> Result<bool, AppCommandError> {
    let _ = label;
    Ok(false)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn tools_sync_child_webview_theme(
    payload: Option<Value>,
) -> Result<(), AppCommandError> {
    let payload =
        serde_json::from_value::<otools_platform_webview::ToolsChildThemePayload>(
            payload.unwrap_or_default(),
        )
        .map_err(|error| AppCommandError::invalid_input(error.to_string()))?;
    let Some(app) = otools_platform_app::current_app_handle() else {
        return Ok(());
    };
    otools_platform_webview::tools_sync_child_webview_theme(app, payload)
        .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn tools_sync_child_webview_theme(
    payload: Option<Value>,
) -> Result<(), AppCommandError> {
    let _ = payload;
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
#[cfg(feature = "tauri-runtime")]
pub async fn tools_sync_child_webview_locale(
    payload: Option<Value>,
) -> Result<(), AppCommandError> {
    let payload =
        serde_json::from_value::<otools_platform_webview::ToolsChildLocalePayload>(
            payload.unwrap_or_default(),
        )
        .map_err(|error| AppCommandError::invalid_input(error.to_string()))?;
    let Some(app) = otools_platform_app::current_app_handle() else {
        return Ok(());
    };
    otools_platform_webview::tools_sync_child_webview_locale(app, payload)
        .map_err(map_platform_webview_error)
}

#[cfg(not(feature = "tauri-runtime"))]
pub async fn tools_sync_child_webview_locale(
    payload: Option<Value>,
) -> Result<(), AppCommandError> {
    let _ = payload;
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_native_invoke(
    request: OtoolsNativeInvokeRequest,
) -> Result<Value, AppCommandError> {
    let _ =
        otools_host::validate_plugin_id_for_host(&request.plugin_uuid).map_err(map_host_error)?;
    let plugin_uuid = request.plugin_uuid;
    let method = request.method;
    let payload = request.payload;
    let value = tokio::task::spawn_blocking(move || {
        otools_host::native_plugin_invoke(plugin_uuid, method, payload).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("OTools native invocation task failed")
            .with_detail(error.to_string())
    })??;

    Ok(value.get("data").cloned().unwrap_or(value))
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_invoke(
    uuid: String,
    method: String,
    payload: Value,
) -> Result<Value, AppCommandError> {
    otools_native_invoke(OtoolsNativeInvokeRequest {
        plugin_uuid: uuid,
        method,
        payload,
    })
    .await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_probe(uuid: String) -> Result<Value, AppCommandError> {
    let probe_uuid = uuid.clone();
    let mut value = tokio::task::spawn_blocking(move || {
        otools_host::native_plugin_probe(probe_uuid).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("OTools native probe task failed")
            .with_detail(error.to_string())
    })??;

    if let Some(object) = value.as_object_mut() {
        object.insert("ok".to_string(), Value::Bool(true));
        object.insert("pluginUuid".to_string(), Value::String(uuid));
        object.insert("runtime".to_string(), Value::String("codeg-plus".to_string()));
        object.insert("windowLabel".to_string(), Value::String("otools".to_string()));
    }
    Ok(value)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_reload(uuid: String) -> Result<String, AppCommandError> {
    let reload_uuid = uuid.clone();
    let message = tokio::task::spawn_blocking(move || {
        otools_host::native_plugin_reload(reload_uuid).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("OTools native reload task failed")
            .with_detail(error.to_string())
    })??;
    otools_reload_all_plugins().await?;
    Ok(format!("{message}：{uuid}"))
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_poll_events(uuid: String) -> Result<Vec<Value>, AppCommandError> {
    tokio::task::spawn_blocking(move || {
        otools_host::native_plugin_poll_events(uuid).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("OTools native event poll task failed")
            .with_detail(error.to_string())
    })?
}

pub fn native_plugin_listen_acquire_with_emitter(
    uuid: String,
    interval_ms: Option<u64>,
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<(), AppCommandError> {
    otools_host::native_plugin_listen_acquire(uuid, interval_ms, move |event, payload| {
        crate::web::event_bridge::emit_event(&emitter, &event, payload);
    })
    .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_listen_acquire(
    uuid: String,
    interval_ms: Option<u64>,
) -> Result<(), AppCommandError> {
    native_plugin_listen_acquire_with_emitter(
        uuid,
        interval_ms,
        resolve_otools_event_emitter(),
    )
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_listen_release(uuid: String) -> Result<(), AppCommandError> {
    otools_host::native_plugin_listen_release(uuid).map_err(map_host_error)?;
    Ok(())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_poll_events() -> Result<Vec<Value>, AppCommandError> {
    crate::otools_bridge::poll_events_blocking().map_err(|error| {
        AppCommandError::task_execution_failed("OTools event polling failed").with_detail(error)
    })
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_get_workspace() -> Result<DevWorkspace, AppCommandError> {
    otools_host::dev_get_workspace()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_create_plugin(
    input: DevPluginInput,
) -> Result<DevPluginActionResult, AppCommandError> {
    otools_host::dev_create_plugin(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_update_plugin(
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, AppCommandError> {
    otools_host::dev_update_plugin(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_bind_plugin_directory(
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, AppCommandError> {
    otools_host::dev_bind_plugin_directory(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_enable_debug(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_enable_debug(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_disable_debug(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_disable_debug(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_initialize_vue_project(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_initialize_vue_project(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_initialize_native_project(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_initialize_native_project(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_build_native_plugin(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_build_native_plugin(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_build_native_artifact(uuid: String) -> Result<String, AppCommandError> {
    otools_host::dev_build_native_artifact(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_build_native_artifact_from_dir(
    directory_path: String,
) -> Result<String, AppCommandError> {
    otools_host::dev_build_native_artifact_from_dir(directory_path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_start_native_plugin_build(
    uuid: String,
) -> Result<DevNativeBuildJobStart, AppCommandError> {
    otools_host::dev_start_native_plugin_build(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, AppCommandError> {
    otools_host::dev_start_native_artifact_build_from_dir(directory_path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_get_native_build_job(
    job_id: String,
) -> Result<DevNativeBuildJobSnapshot, AppCommandError> {
    otools_host::dev_get_native_build_job(job_id)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_get_native_config(uuid: String) -> Result<DevNativeConfig, AppCommandError> {
    otools_host::dev_get_native_config(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_set_native_enabled(
    uuid: String,
    enabled: bool,
) -> Result<String, AppCommandError> {
    otools_host::dev_set_native_enabled(uuid, enabled)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_pack_plugin(uuid: String) -> Result<DevPluginActionResult, AppCommandError> {
    otools_host::dev_pack_plugin(uuid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn dev_publish_version(
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, AppCommandError> {
    otools_host::dev_publish_version(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn park_get_workspace(cate: Option<String>) -> Result<ParkWorkspace, AppCommandError> {
    otools_host::park_get_workspace(cate)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn park_install_plugin(
    input: ParkInstallInput,
) -> Result<ParkInstallResult, AppCommandError> {
    otools_host::park_install_plugin(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn park_install_offline_plugin(
    file_path: String,
) -> Result<ParkInstallResult, AppCommandError> {
    otools_host::park_install_offline_plugin(file_path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn park_uninstall_plugin(
    input: ParkUninstallInput,
) -> Result<ParkUninstallResult, AppCommandError> {
    otools_host::park_uninstall_plugin(input)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_read_file(
    path: String,
) -> Result<WebviewReadFilePayload, AppCommandError> {
    otools_host::tools_webview_read_file(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_pick_files(
    options: Option<Value>,
) -> Result<Vec<Value>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = otools_platform_app::current_app_handle() {
        let parsed = parse_webview_pick_options::<
            otools_platform_webview::WebviewFilePickerOptions,
        >(options)?;
        let files = otools_platform_webview::tools_webview_pick_files(app, parsed)
            .await
            .map_err(map_platform_webview_error)?;
        return files
            .into_iter()
            .map(|file| {
                serde_json::to_value(file)
                    .map_err(|error| AppCommandError::task_execution_failed(error.to_string()))
            })
            .collect();
    }

    let _ = options;
    Ok(Vec::new())
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_pick_save_path(
    options: Option<Value>,
) -> Result<Option<Value>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = otools_platform_app::current_app_handle() {
        let parsed = parse_webview_pick_options::<
            otools_platform_webview::WebviewSaveFileOptions,
        >(options)?;
        let picked = otools_platform_webview::tools_webview_pick_save_path(app, parsed)
            .await
            .map_err(map_platform_webview_error)?;
        return picked
            .map(serde_json::to_value)
            .transpose()
            .map_err(|error| AppCommandError::task_execution_failed(error.to_string()));
    }

    let _ = options;
    Ok(None)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_pick_folder(
    options: Option<Value>,
) -> Result<Option<Value>, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = otools_platform_app::current_app_handle() {
        let parsed = parse_webview_pick_options::<
            otools_platform_webview::WebviewPickFolderOptions,
        >(options)?;
        let picked = otools_platform_webview::tools_webview_pick_folder(app, parsed)
            .await
            .map_err(map_platform_webview_error)?;
        return picked
            .map(serde_json::to_value)
            .transpose()
            .map_err(|error| AppCommandError::task_execution_failed(error.to_string()));
    }

    let _ = options;
    Ok(None)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_pick_files(
    options: Option<Value>,
) -> Result<Vec<Value>, AppCommandError> {
    tools_webview_pick_files(options).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_pick_save_path(
    options: Option<Value>,
) -> Result<Option<Value>, AppCommandError> {
    tools_webview_pick_save_path(options).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_pick_folder(
    options: Option<Value>,
) -> Result<Option<Value>, AppCommandError> {
    tools_webview_pick_folder(options).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_read_file(
    path: String,
) -> Result<WebviewReadFilePayload, AppCommandError> {
    tools_webview_read_file(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_write_file(
    request: WebviewWriteFileRequest,
) -> Result<(), AppCommandError> {
    tools_webview_write_file(request).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_list_dir(path: String) -> Result<Vec<WebviewDirEntry>, AppCommandError> {
    tools_webview_list_dir(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_browse_dialog(
    request: Option<Value>,
) -> Result<Value, AppCommandError> {
    let path = request
        .and_then(|value| value.get("path").and_then(Value::as_str).map(str::to_string));
    tools_webview_browse_dialog(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_home_dir() -> Result<String, AppCommandError> {
    tools_webview_home_dir().await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_join_path(parts: Vec<String>) -> Result<String, AppCommandError> {
    tools_webview_join_path(parts).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_create_dir(path: String) -> Result<(), AppCommandError> {
    tools_webview_create_dir(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_touch_file(path: String) -> Result<(), AppCommandError> {
    tools_webview_touch_file(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_remove_entry(
    path: String,
    recursive: Option<bool>,
) -> Result<(), AppCommandError> {
    tools_webview_remove_entry(path, recursive).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_rename_entry(
    request: WebviewRenameEntryRequest,
) -> Result<(), AppCommandError> {
    tools_webview_rename_entry(request).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_file_meta(path: String) -> Result<WebviewFileMeta, AppCommandError> {
    otools_host::tools_webview_file_meta(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_write_file(
    request: WebviewWriteFileRequest,
) -> Result<(), AppCommandError> {
    otools_host::tools_webview_write_file(request)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_list_dir(path: String) -> Result<Vec<WebviewDirEntry>, AppCommandError> {
    otools_host::tools_webview_list_dir(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_home_dir() -> Result<String, AppCommandError> {
    otools_host::tools_webview_home_dir()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_join_path(parts: Vec<String>) -> Result<String, AppCommandError> {
    otools_host::tools_webview_join_path(parts)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_create_dir(path: String) -> Result<(), AppCommandError> {
    otools_host::tools_webview_create_dir(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_touch_file(path: String) -> Result<(), AppCommandError> {
    otools_host::tools_webview_touch_file(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_remove_entry(
    path: String,
    recursive: Option<bool>,
) -> Result<(), AppCommandError> {
    otools_host::tools_webview_remove_entry(path, recursive)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_rename_entry(
    request: WebviewRenameEntryRequest,
) -> Result<(), AppCommandError> {
    otools_host::tools_webview_rename_entry(request)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_browse_dialog(path: Option<String>) -> Result<Value, AppCommandError> {
    otools_host::tools_webview_browse_dialog(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn tools_webview_log(message: String) -> Result<(), AppCommandError> {
    otools_host::tools_webview_log(message)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn upload_save_image(
    file_name: String,
    mime: String,
    data_base64: String,
    source_module: Option<String>,
) -> Result<SavedImage, AppCommandError> {
    otools_host::upload_save_image(file_name, mime, data_base64, source_module)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_set_status_bar_state(payload: Value) -> Result<Value, AppCommandError> {
    otools_set_status_bar_state_with_emitter(payload, resolve_otools_event_emitter()).await
}

pub async fn otools_set_status_bar_state_with_emitter(
    payload: Value,
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<Value, AppCommandError> {
    #[cfg(feature = "tauri-runtime")]
    apply_otools_status_bar_state(&payload)?;

    crate::web::event_bridge::emit_event(&emitter, "otools-status-bar", payload.clone());
    otools_host::otools_set_status_bar_state(payload)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_copy_text(text: String) -> Result<bool, AppCommandError> {
    otools_host::otools_copy_text(text)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_copy_file(paths: Vec<String>) -> Result<bool, AppCommandError> {
    otools_host::otools_copy_file(paths)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_copy_image(image: String) -> Result<bool, AppCommandError> {
    otools_host::otools_copy_image(image)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_copied_files(
) -> Result<Vec<otools_host::OtoolsCopiedFile>, AppCommandError> {
    otools_host::otools_get_copied_files()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_get_file_icon(path: String) -> Result<String, AppCommandError> {
    otools_host::otools_get_file_icon(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_shell_open_path(path: String) -> Result<(), AppCommandError> {
    otools_host::otools_shell_open_path(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn open_directory(path: String) -> Result<(), AppCommandError> {
    otools_shell_open_path(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_open(request: Value) -> Result<(), AppCommandError> {
    let target = value_string_field(&request, "path")
        .or_else(|| value_string_field(&request, "url"))
        .unwrap_or_default();
    if target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with("tel:")
    {
        otools_shell_open_external(target).await
    } else {
        otools_shell_open_path(target).await
    }
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_open_path(path: String) -> Result<(), AppCommandError> {
    otools_shell_open_path(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_shell_show_item_in_folder(path: String) -> Result<(), AppCommandError> {
    otools_host::otools_shell_show_item_in_folder(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_show_item_in_folder(
    path: String,
) -> Result<(), AppCommandError> {
    otools_shell_show_item_in_folder(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_shell_trash_item(path: String) -> Result<(), AppCommandError> {
    otools_host::otools_shell_trash_item(path)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_trash_item(path: String) -> Result<(), AppCommandError> {
    otools_shell_trash_item(path).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_shell_open_external(url: String) -> Result<(), AppCommandError> {
    otools_host::otools_shell_open_external(url)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_open_external(url: String) -> Result<(), AppCommandError> {
    otools_shell_open_external(url).await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_shell_beep() -> Result<(), AppCommandError> {
    otools_host::otools_shell_beep()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn remote_service_shell_beep() -> Result<(), AppCommandError> {
    otools_shell_beep().await
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_show_notification(
    body: String,
    click_feature_code: Option<String>,
) -> Result<(), AppCommandError> {
    otools_show_notification_with_emitter(
        body,
        click_feature_code,
        resolve_otools_event_emitter(),
    )
    .await
}

pub async fn otools_show_notification_with_emitter(
    body: String,
    click_feature_code: Option<String>,
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<(), AppCommandError> {
    let title = click_feature_code
        .clone()
        .unwrap_or_else(|| "OTools".to_string());
    crate::web::event_bridge::emit_event(
        &emitter,
        "otools-notification",
        json!({
            "title": title,
            "body": body,
            "clickFeatureCode": click_feature_code,
        }),
    );

    #[cfg(feature = "tauri-runtime")]
    if let Some(app) = otools_platform_app::current_app_handle() {
        crate::commands::notification::send_notification(app, title, body).await?;
        return Ok(());
    }

    otools_host::otools_show_notification(body, click_feature_code)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_scan_storage_catalog(
    catalog: Vec<Value>,
) -> Result<Value, AppCommandError> {
    otools_host::otools_host_scan_storage_catalog(catalog)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_clean_storage_paths(
    entries: Vec<Value>,
) -> Result<Vec<Value>, AppCommandError> {
    otools_host::otools_host_clean_storage_paths(entries)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_clean_storage_items(
    catalog: Vec<Value>,
    ids: Vec<String>,
) -> Result<Vec<Value>, AppCommandError> {
    otools_host::otools_host_clean_storage_items(catalog, ids)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_get_package_status(
    manager: Option<String>,
    package_name: String,
    cask: Option<bool>,
) -> Result<Value, AppCommandError> {
    otools_host::otools_host_get_package_status(manager, package_name, cask)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_get_packages_status(
    manager: Option<String>,
    package_names: Vec<String>,
    cask: Option<bool>,
) -> Result<Vec<Value>, AppCommandError> {
    otools_host::otools_host_get_packages_status(manager, package_names, cask)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_list_listen_processes() -> Result<Vec<Value>, AppCommandError> {
    otools_host::otools_host_list_listen_processes()
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_kill_process(pid: u32) -> Result<(), AppCommandError> {
    otools_host::otools_host_kill_process(pid)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_run_package_action(
    manager: Option<String>,
    package_name: String,
    action: Option<String>,
    version: Option<String>,
) -> Result<Value, AppCommandError> {
    otools_host::otools_host_run_package_action(manager, package_name, action, version)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_set_linux_privilege_password(
    password: String,
) -> Result<String, AppCommandError> {
    otools_host::otools_host_set_linux_privilege_password(password)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_run_winget_install(
    package_name: String,
    options: Option<Value>,
) -> Result<Value, AppCommandError> {
    otools_host::otools_host_run_winget_install(package_name, options)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_http_write_base64_file(
    file_path: String,
    data_base64: String,
) -> Result<(), AppCommandError> {
    otools_host::otools_host_http_write_base64_file(file_path, data_base64)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_host_http_send(request: Value) -> Result<Value, AppCommandError> {
    otools_host::otools_host_http_send(request)
        .await
        .map_err(map_host_error)
}

pub fn resolve_plugin_asset_path(
    plugin_uuid: &str,
    asset_path: &str,
) -> Result<std::path::PathBuf, AppCommandError> {
    otools_host::resolve_plugin_asset_path(plugin_uuid, asset_path).map_err(map_host_error)
}

pub fn resolve_upload_static_path(
    relative_path: &str,
) -> Result<std::path::PathBuf, AppCommandError> {
    otools_host::resolve_upload_static_path(relative_path).map_err(map_host_error)
}

fn value_string_field(value: &Value, field: &str) -> Option<String> {
    value
        .as_object()
        .and_then(|object| object.get(field))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}


pub use otools_host::SshConfig;

fn ssh_event_sink(
    emitter: crate::web::event_bridge::EventEmitter,
) -> otools_host::SshEventSink {
    std::sync::Arc::new(move |event: &str, payload: serde_json::Value| {
        crate::web::event_bridge::emit_event(&emitter, event, payload);
    })
}

pub fn connect_ssh_server_with_emitter(
    config: SshConfig,
    emitter: crate::web::event_bridge::EventEmitter,
) -> Result<String, AppCommandError> {
    otools_host::connect_ssh_server(config, ssh_event_sink(emitter)).map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn connect_ssh_server(config: SshConfig) -> Result<String, AppCommandError> {
    let emitter = resolve_otools_event_emitter();
    tokio::task::spawn_blocking(move || connect_ssh_server_with_emitter(config, emitter))
        .await
        .map_err(|error| {
            AppCommandError::task_execution_failed("SSH connect task failed")
                .with_detail(error.to_string())
        })?
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn send_ssh_input(
    server_id: String,
    session_id: String,
    input: String,
) -> Result<(), AppCommandError> {
    tokio::task::spawn_blocking(move || {
        otools_host::send_ssh_input(server_id, session_id, input).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("SSH input task failed")
            .with_detail(error.to_string())
    })?
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn disconnect_ssh_server(
    server_id: String,
    session_id: String,
) -> Result<(), AppCommandError> {
    tokio::task::spawn_blocking(move || {
        otools_host::disconnect_ssh_server(server_id, session_id).map_err(map_host_error)
    })
    .await
    .map_err(|error| {
        AppCommandError::task_execution_failed("SSH disconnect task failed")
            .with_detail(error.to_string())
    })?
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn is_ssh_connected(session_id: String) -> Result<bool, AppCommandError> {
    Ok(otools_host::is_ssh_connected(&session_id))
}

fn resolve_otools_event_emitter() -> crate::web::event_bridge::EventEmitter {
    #[cfg(feature = "tauri-runtime")]
    {
        if let Some(app) = otools_platform_app::current_app_handle() {
            return crate::web::event_bridge::EventEmitter::Tauri(app);
        }
    }
    crate::web::event_bridge::EventEmitter::Noop
}
fn map_host_error(error: otools_host::HostError) -> AppCommandError {
    let app_error = match error.code {
        otools_host::HostErrorCode::InvalidInput => AppCommandError::invalid_input(error.message),
        otools_host::HostErrorCode::ConfigurationInvalid => {
            AppCommandError::configuration_invalid(error.message)
        }
        otools_host::HostErrorCode::NotFound => AppCommandError::not_found(error.message),
        otools_host::HostErrorCode::AlreadyExists => {
            AppCommandError::new(AppErrorCode::AlreadyExists, error.message)
        }
        otools_host::HostErrorCode::PermissionDenied => {
            AppCommandError::permission_denied(error.message)
        }
        otools_host::HostErrorCode::IoError => AppCommandError::io_error(error.message),
        otools_host::HostErrorCode::TaskExecutionFailed => {
            AppCommandError::task_execution_failed(error.message)
        }
    };
    if let Some(detail) = error.detail {
        app_error.with_detail(detail)
    } else {
        app_error
    }
}

#[cfg(feature = "tauri-runtime")]
fn map_platform_app_error(message: String) -> AppCommandError {
    AppCommandError::task_execution_failed(message)
}

#[cfg(feature = "tauri-runtime")]
fn map_platform_webview_error(message: String) -> AppCommandError {
    AppCommandError::task_execution_failed(message)
}

#[cfg(feature = "tauri-runtime")]
fn parse_webview_pick_options<T: serde::de::DeserializeOwned>(
    options: Option<Value>,
) -> Result<Option<T>, AppCommandError> {
    let Some(value) = options else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    serde_json::from_value(value)
        .map(Some)
        .map_err(|error| AppCommandError::invalid_input(error.to_string()))
}

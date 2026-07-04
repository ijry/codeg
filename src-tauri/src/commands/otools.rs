use serde_json::Value;
#[cfg(feature = "tauri-runtime")]
use std::path::{Path, PathBuf};

use crate::app_error::{AppCommandError, AppErrorCode};

pub use otools_host::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput,
    DevWorkspace, OtoolsAiChatMessageRecord, OtoolsAiGenerateTextRequest, OtoolsAssetPayload,
    OtoolsConfig, OtoolsConfigTab, OtoolsHostInfo, OtoolsNativeInvokeRequest,
    OtoolsNavigationResult, OtoolsPluginInfo, ParkInstallInput, ParkInstallResult,
    ParkUninstallInput, ParkUninstallResult, ParkWorkspace, ProjectScriptsResponse,
    WebviewDirEntry, WebviewReadFilePayload, WebviewRenameEntryRequest, WebviewWriteFileRequest,
};
#[cfg(feature = "tauri-runtime")]
pub use otools_platform_shortcuts::OtoolsGlobalShortcutBinding;

pub fn open_otools_window_core() -> OtoolsNavigationResult {
    otools_host::open_otools_window_core()
}

pub fn otools_show_main_window_core() {}

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
pub async fn otools_reload_all_plugins() -> Result<(), AppCommandError> {
    Ok(())
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
    let normalized_path = path.trim().to_string();
    if normalized_path.is_empty() {
        return Err(AppCommandError::invalid_input("path is required"));
    }

    let normalized_editor_id = editor_id.trim().to_lowercase();
    if normalized_editor_id.is_empty() {
        return Err(AppCommandError::invalid_input("editorId is required"));
    }

    #[cfg(feature = "tauri-runtime")]
    {
        match normalized_editor_id.as_str() {
            "vscode" => open_in_vscode(&normalized_path)?,
            "idea" => open_in_idea(&normalized_path)?,
            _ => {
                return Err(AppCommandError::invalid_input(format!(
                    "unsupported project editor: {normalized_editor_id}"
                )));
            }
        }
        return Ok(());
    }

    #[cfg(not(feature = "tauri-runtime"))]
    {
        let _ = normalized_path;
        Err(AppCommandError::task_execution_failed(
            "project editor launch is only available in desktop runtime",
        ))
    }
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn project_runner_open_in_terminal(
    working_dir: Option<String>,
) -> Result<(), AppCommandError> {
    let path = working_dir.unwrap_or_default();
    let normalized_path = path.trim().to_string();
    if normalized_path.is_empty() {
        return Err(AppCommandError::invalid_input("workingDir is required"));
    }

    #[cfg(feature = "tauri-runtime")]
    {
        open_in_terminal(&normalized_path)?;
        return Ok(());
    }

    #[cfg(not(feature = "tauri-runtime"))]
    {
        Err(AppCommandError::task_execution_failed(
            "system terminal launch is only available in desktop runtime",
        ))
    }
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
    otools_host::otools_host_info()
        .await
        .map_err(map_host_error)
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
pub async fn otools_get_plugin_asset(
    plugin_uuid: String,
    asset_path: String,
) -> Result<OtoolsAssetPayload, AppCommandError> {
    otools_host::otools_get_plugin_asset(plugin_uuid, asset_path)
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
pub async fn otools_emit_tools_shell_shortcut(action: String) -> Result<(), AppCommandError> {
    otools_host::otools_emit_tools_shell_shortcut(action)
        .await
        .map_err(map_host_error)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_native_invoke(
    request: OtoolsNativeInvokeRequest,
) -> Result<Value, AppCommandError> {
    let _ =
        otools_host::validate_plugin_id_for_host(&request.plugin_uuid).map_err(map_host_error)?;
    crate::otools_bridge::invoke_blocking(&request.method, request.payload).map_err(|error| {
        AppCommandError::task_execution_failed("OTools native invocation failed").with_detail(error)
    })
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
    let mut value = serde_json::json!({
        "ok": true,
        "pluginUuid": uuid.clone(),
        "runtime": "codeg-plus",
        "windowLabel": "otools",
    });

    if let Ok(config) = otools_host::dev_get_native_config(uuid).await {
        if let Some(object) = value.as_object_mut() {
            object.insert("enabled".to_string(), Value::Bool(config.enabled));
            object.insert(
                "manifestPath".to_string(),
                Value::String(config.manifest_path),
            );
        }
    }

    Ok(value)
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn native_plugin_reload(uuid: String) -> Result<String, AppCommandError> {
    otools_reload_all_plugins().await?;
    Ok(format!("已刷新 Native 插件实例：{uuid}"))
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
pub async fn otools_set_status_bar_state(payload: Value) -> Result<Value, AppCommandError> {
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
pub async fn otools_show_notification(
    body: String,
    click_feature_code: Option<String>,
) -> Result<(), AppCommandError> {
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
fn resolve_terminal_working_dir(path: &str) -> Result<PathBuf, AppCommandError> {
    let candidate = PathBuf::from(path);
    let directory = if candidate.is_file() {
        candidate.parent().map(Path::to_path_buf).ok_or_else(|| {
            AppCommandError::task_execution_failed("Failed to resolve parent directory")
        })?
    } else {
        candidate
    };

    if !directory.is_dir() {
        return Err(
            AppCommandError::task_execution_failed("Directory does not exist or is not a folder")
                .with_detail(directory.to_string_lossy().to_string()),
        );
    }

    Ok(directory)
}

#[cfg(all(feature = "tauri-runtime", target_os = "windows"))]
fn normalize_windows_path(raw_path: &str) -> String {
    raw_path.trim().trim_matches('"').replace('/', "\\")
}

#[cfg(all(feature = "tauri-runtime", target_os = "macos"))]
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(feature = "tauri-runtime")]
fn open_in_vscode(path: &str) -> Result<(), AppCommandError> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(["-a", "Visual Studio Code", path])
            .status()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open VSCode",
                    error.to_string(),
                )
            })?;

        if status.success() {
            return Ok(());
        }

        return Err(AppCommandError::external_command(
            "Failed to open VSCode",
            format!("exit status: {status}"),
        ));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let status = Command::new("code")
            .arg("-r")
            .arg(path)
            .status()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open VSCode",
                    error.to_string(),
                )
            })?;

        if status.success() {
            Ok(())
        } else {
            Err(AppCommandError::external_command(
                "Failed to open VSCode",
                format!("exit status: {status}"),
            ))
        }
    }
}

#[cfg(feature = "tauri-runtime")]
fn open_in_idea(path: &str) -> Result<(), AppCommandError> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(["-a", "IntelliJ IDEA", path])
            .status()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open IntelliJ IDEA",
                    error.to_string(),
                )
            })?;

        if status.success() {
            return Ok(());
        }

        return Err(AppCommandError::external_command(
            "Failed to open IntelliJ IDEA",
            format!("exit status: {status}"),
        ));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let status = Command::new("idea")
            .arg(path)
            .status()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open IntelliJ IDEA",
                    error.to_string(),
                )
            })?;

        if status.success() {
            Ok(())
        } else {
            Err(AppCommandError::external_command(
                "Failed to open IntelliJ IDEA",
                format!("exit status: {status}"),
            ))
        }
    }
}

#[cfg(feature = "tauri-runtime")]
fn open_in_terminal(path: &str) -> Result<(), AppCommandError> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        let normalized_path = normalize_windows_path(path);
        if normalized_path.is_empty() {
            return Err(AppCommandError::invalid_input("Path is empty"));
        }
        let working_dir = resolve_terminal_working_dir(&normalized_path)?;
        Command::new("cmd")
            .current_dir(&working_dir)
            .args(["/C", "start", "", "cmd", "/K"])
            .spawn()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open terminal",
                    error.to_string(),
                )
            })?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let shell_cmd = format!("cd {} && exec \"$SHELL\"", shell_single_quote(path));
        let escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
        let script =
            format!("tell application \"Terminal\" to do script \"{escaped}\"");

        Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn()
            .map_err(|error| {
                AppCommandError::external_command(
                    "Failed to open terminal",
                    error.to_string(),
                )
            })?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
        for terminal in terminals {
            let result = match terminal {
                "gnome-terminal" => Command::new(terminal)
                    .args(["--", "sh", "-c", &format!("cd '{}' && exec bash", path)])
                    .spawn(),
                _ => Command::new(terminal)
                    .args(["-e", "sh", "-c", &format!("cd '{}' && exec bash", path)])
                    .spawn(),
            };

            if result.is_ok() {
                return Ok(());
            }
        }

        return Err(AppCommandError::external_command(
            "Failed to open terminal",
            "No suitable terminal emulator found",
        ));
    }

    #[allow(unreachable_code)]
    Err(AppCommandError::task_execution_failed(
        "Unsupported platform for terminal launch",
    ))
}

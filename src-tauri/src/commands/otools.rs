use serde_json::Value;

use crate::app_error::{AppCommandError, AppErrorCode};

pub use otools_host::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput,
    DevWorkspace, OtoolsAssetPayload, OtoolsConfig, OtoolsConfigTab, OtoolsHostInfo,
    OtoolsNativeInvokeRequest, OtoolsNavigationResult, OtoolsPluginInfo, ParkInstallInput,
    ParkInstallResult, ParkUninstallInput, ParkUninstallResult, ParkWorkspace, WebviewDirEntry,
    WebviewReadFilePayload, WebviewRenameEntryRequest, WebviewWriteFileRequest,
};

pub fn open_otools_window_core() -> OtoolsNavigationResult {
    otools_host::open_otools_window_core()
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

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn otools_list_plugins() -> Result<Vec<OtoolsPluginInfo>, AppCommandError> {
    otools_host::otools_list_plugins()
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

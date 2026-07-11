use std::path::PathBuf;

use serde_json::{json, Value};

use otools_core::HostError;
pub use otools_platform_clipboard::OtoolsCopiedFile;
pub use otools_platform_http_client::{
    otools_host_http_send, otools_host_http_write_base64_file,
};
pub use otools_platform_process::{
    otools_host_kill_process, otools_host_list_listen_processes, OtoolsHostListenProcessInfo,
};
pub use otools_platform_project::{
    project_editor_open, project_runner_open_in_terminal, project_runner_read_scripts,
    ProjectScriptInfo, ProjectScriptsResponse,
};
pub use otools_platform_storage::{
    otools_host_clean_storage_items, otools_host_clean_storage_paths,
    otools_host_scan_storage_catalog,
};
pub use otools_platform_upload::SavedImage;
pub use otools_platform_webview_fs::{
    tools_webview_browse_dialog, tools_webview_create_dir, tools_webview_file_meta,
    tools_webview_home_dir, tools_webview_join_path, tools_webview_list_dir, tools_webview_log,
    tools_webview_read_file, tools_webview_remove_entry, tools_webview_rename_entry,
    tools_webview_touch_file, tools_webview_write_file, WebviewDirEntry, WebviewFileMeta,
    WebviewReadFilePayload, WebviewRenameEntryRequest, WebviewWriteFileRequest,
};

pub async fn upload_save_image(
    file_name: String,
    mime: String,
    data_base64: String,
    source_module: Option<String>,
) -> Result<SavedImage, HostError> {
    otools_platform_upload::upload_save_image(file_name, mime, data_base64, source_module)
}

pub fn resolve_upload_static_path(relative_path: &str) -> Result<PathBuf, HostError> {
    otools_platform_upload::resolve_upload_static_path(relative_path)
}

pub async fn otools_set_status_bar_state(payload: Value) -> Result<Value, HostError> {
    Ok(json!({ "ok": true, "payload": payload }))
}

pub async fn otools_copy_text(text: String) -> Result<bool, HostError> {
    otools_platform_clipboard::otools_copy_text(text).map_err(host_operation_error)
}

pub async fn otools_copy_file(paths: Vec<String>) -> Result<bool, HostError> {
    otools_platform_clipboard::otools_copy_file(paths).map_err(host_operation_error)
}

pub async fn otools_copy_image(image: String) -> Result<bool, HostError> {
    otools_platform_clipboard::otools_copy_image(image).map_err(host_operation_error)
}

pub async fn otools_get_copied_files() -> Result<Vec<OtoolsCopiedFile>, HostError> {
    otools_platform_clipboard::otools_get_copied_files().map_err(host_operation_error)
}

pub async fn otools_get_file_icon(path: String) -> Result<String, HostError> {
    otools_platform_clipboard::otools_get_file_icon(path).map_err(host_operation_error)
}

pub async fn otools_show_notification(
    body: String,
    click_feature_code: Option<String>,
) -> Result<(), HostError> {
    let title = click_feature_code.unwrap_or_else(|| "OTools".to_string());
    eprintln!("[OTools][Notification] {title}: {body}");
    Ok(())
}

pub async fn otools_shell_open_path(path: String) -> Result<(), HostError> {
    otools_platform_shell::otools_shell_open_path(path).map_err(host_operation_error)
}

pub async fn otools_shell_show_item_in_folder(path: String) -> Result<(), HostError> {
    otools_platform_shell::otools_shell_show_item_in_folder(path).map_err(host_operation_error)
}

pub async fn otools_shell_trash_item(path: String) -> Result<(), HostError> {
    otools_platform_shell::otools_shell_trash_item(path).map_err(host_operation_error)
}

pub async fn otools_shell_open_external(url: String) -> Result<(), HostError> {
    otools_platform_shell::otools_shell_open_external(url).map_err(host_operation_error)
}

pub async fn otools_shell_beep() -> Result<(), HostError> {
    otools_platform_shell::otools_shell_beep().map_err(host_operation_error)
}

pub async fn otools_emit_tools_shell_shortcut(action: String) -> Result<(), HostError> {
    validate_tools_shell_shortcut_action(&action)?;
    Ok(())
}

pub fn validate_tools_shell_shortcut_action(value: &str) -> Result<String, HostError> {
    match value.trim() {
        "closeActiveTab" | "activatePrevTab" | "activateNextTab" => Ok(value.trim().to_string()),
        _ => Err(HostError::invalid_input(
            "Unsupported tools shell shortcut action",
        )),
    }
}

pub async fn otools_host_get_package_status(
    manager: Option<String>,
    package_name: String,
    cask: Option<bool>,
) -> Result<Value, HostError> {
    let result =
        otools_platform_package_manager::otools_host_get_package_status(manager, package_name, cask)
            .await
            .map_err(package_manager_error)?;
    serde_json::to_value(result).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize package status")
            .with_detail(error.to_string())
    })
}

pub async fn otools_host_get_packages_status(
    manager: Option<String>,
    package_names: Vec<String>,
    cask: Option<bool>,
) -> Result<Vec<Value>, HostError> {
    let results = otools_platform_package_manager::otools_host_get_packages_status(
        manager,
        package_names,
        cask,
    )
    .await
    .map_err(package_manager_error)?;
    results
        .into_iter()
        .map(|result| {
            serde_json::to_value(result).map_err(|error| {
                HostError::task_execution_failed("Failed to serialize package status")
                    .with_detail(error.to_string())
            })
        })
        .collect()
}

pub async fn otools_host_run_package_action(
    manager: Option<String>,
    package_name: String,
    action: Option<String>,
    version: Option<String>,
) -> Result<Value, HostError> {
    let action = action.unwrap_or_else(|| "install".to_string());
    let result = otools_platform_package_manager::otools_host_run_package_action(
        manager,
        package_name,
        action,
        version,
    )
    .await
    .map_err(package_manager_error)?;
    serde_json::to_value(result).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize package action")
            .with_detail(error.to_string())
    })
}

pub async fn otools_host_set_linux_privilege_password(
    password: String,
) -> Result<String, HostError> {
    otools_platform_package_manager::otools_host_set_linux_privilege_password(password)
        .await
        .map_err(package_manager_error)
}

pub async fn otools_host_run_winget_install(
    package_name: String,
    options: Option<Value>,
) -> Result<Value, HostError> {
    let options = options
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| {
            HostError::invalid_input("Invalid winget install options").with_detail(error.to_string())
        })?
        .unwrap_or_default();
    let result = otools_platform_package_manager::otools_host_run_winget_install(
        package_name,
        options,
    )
    .await
    .map_err(package_manager_error)?;
    serde_json::to_value(result).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize winget install result")
            .with_detail(error.to_string())
    })
}

fn host_operation_error(message: String) -> HostError {
    HostError::task_execution_failed(message)
}

fn package_manager_error(message: String) -> HostError {
    host_operation_error(message)
}

pub use otools_platform_ssh::{
    SshConfig, SshEventSink, SSH_CONNECTED_EVENT, SSH_CONNECTION_STATUS_EVENT,
    SSH_DISCONNECTED_EVENT, SSH_OUTPUT_EVENT,
};

pub fn connect_ssh_server(config: SshConfig, emit: SshEventSink) -> Result<String, HostError> {
    otools_platform_ssh::connect_ssh_server(config, emit).map_err(host_operation_error)
}

pub fn send_ssh_input(
    server_id: String,
    session_id: String,
    input: String,
) -> Result<(), HostError> {
    otools_platform_ssh::send_ssh_input(server_id, session_id, input).map_err(host_operation_error)
}

pub fn disconnect_ssh_server(server_id: String, session_id: String) -> Result<(), HostError> {
    otools_platform_ssh::disconnect_ssh_server(server_id, session_id).map_err(host_operation_error)
}

pub fn is_ssh_connected(session_id: &str) -> bool {
    otools_platform_ssh::is_ssh_connected(session_id)
}

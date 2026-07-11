use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use otools_core::{HostError, HostErrorCode, OtoolsPluginInfo};
pub use otools_ai::{
    OtoolsAiChatMessageRecord, OtoolsAiConfigInput, OtoolsAiGenerateTextRequest,
    OtoolsAiGenerateTextResult,
};
pub use otools_platform_filesystem::{
    create_directory, delete_directory, delete_file, read_directory_recursive, read_file_content,
    write_file_content, FsItem,
};
pub use otools_platform_host_info::OtoolsHostInfo;
pub use otools_platform_host::{
    project_editor_open, project_runner_open_in_terminal, project_runner_read_scripts,
    OtoolsCopiedFile, ProjectScriptInfo, ProjectScriptsResponse, otools_copy_file,
    otools_copy_image, otools_copy_text, otools_get_copied_files,
    otools_get_file_icon, otools_host_clean_storage_items, otools_host_clean_storage_paths,
    otools_emit_tools_shell_shortcut, otools_host_get_package_status,
    otools_host_get_packages_status, otools_host_http_send, otools_host_http_write_base64_file,
    otools_host_kill_process, otools_host_list_listen_processes,
    otools_host_run_package_action, otools_host_run_winget_install,
    otools_host_scan_storage_catalog, otools_host_set_linux_privilege_password,
    otools_set_status_bar_state,
    otools_shell_beep, otools_shell_open_external, otools_shell_open_path,
    otools_shell_show_item_in_folder, otools_shell_trash_item, otools_show_notification,
    resolve_upload_static_path, tools_webview_browse_dialog, tools_webview_create_dir,
    tools_webview_file_meta, tools_webview_home_dir, tools_webview_join_path,
    tools_webview_list_dir, tools_webview_log, tools_webview_read_file,
    tools_webview_remove_entry, tools_webview_rename_entry,
    tools_webview_touch_file, tools_webview_write_file, upload_save_image, SavedImage,
    validate_tools_shell_shortcut_action,
    connect_ssh_server, disconnect_ssh_server, send_ssh_input, is_ssh_connected,
    SshConfig, SshEventSink, SSH_CONNECTED_EVENT, SSH_CONNECTION_STATUS_EVENT,
    SSH_DISCONNECTED_EVENT, SSH_OUTPUT_EVENT,
    WebviewDirEntry, WebviewFileMeta, WebviewReadFilePayload,
    WebviewRenameEntryRequest, WebviewWriteFileRequest,
};
pub use otools_platform_noder::{handle_protocol_request as noder_handle_protocol_request, NODER_PROTOCOL_SCHEME};
pub use otools_platform_native_host::{
    native_plugin_invoke, native_plugin_listen_acquire, native_plugin_listen_release,
    native_plugin_poll_events, native_plugin_probe, native_plugin_reload, OtoolsNativeInvokeRequest,
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
pub use otools_plugin_dispatcher::OtoolsPluginCommandInvokeRequest;
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
pub use otools_plugin_registry::OtoolsAssetPayload;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsNavigationResult {
    pub path: String,
}

pub fn open_otools_window_core() -> OtoolsNavigationResult {
    OtoolsNavigationResult {
        path: "/otools".to_string(),
    }
}

pub async fn otools_list_plugins() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    otools_plugin_registry::list_plugins().await
}

pub async fn otools_reload_all_plugins() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    otools_plugin_registry::reload_all_plugins().await
}

pub async fn otools_host_info() -> Result<OtoolsHostInfo, HostError> {
    otools_platform_host_info::otools_host_info().await
}

pub async fn otools_get_plugin(plugin_uuid: String) -> Result<OtoolsPluginInfo, HostError> {
    otools_plugin_registry::get_plugin(plugin_uuid).await
}

pub async fn otools_plugin_state_get(
    plugin_uuid: String,
    scheme: Option<String>,
) -> Result<Value, HostError> {
    otools_plugin_state::otools_plugin_state_get(plugin_uuid, scheme)
}

pub async fn otools_plugin_state_set(
    plugin_uuid: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    otools_plugin_state::otools_plugin_state_set(plugin_uuid, scheme, state)
}

pub async fn otools_get_plugin_asset(
    plugin_uuid: String,
    asset_path: String,
) -> Result<OtoolsAssetPayload, HostError> {
    otools_plugin_registry::get_plugin_asset(plugin_uuid, asset_path).await
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
    otools_plugin_dispatcher::invoke_host_command(request).await
}

pub async fn otools_get_plugins_file_path() -> Result<String, HostError> {
    Ok(otools_plugin_registry::plugins_file_path()
        .to_string_lossy()
        .to_string())
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
    otools_plugin_registry::resolve_plugin_asset_path(plugin_uuid, asset_path)
}

pub fn validate_plugin_id_for_host(value: &str) -> Result<String, HostError> {
    otools_core::validate_plugin_id(value)
}

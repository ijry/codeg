use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{Map, Value};

use otools_core::HostError;
use otools_plugin_dev_actions::{
    bind_plugin_directory, build_native_artifact, build_native_artifact_from_dir,
    build_native_plugin, create_plugin, disable_debug, enable_debug, get_native_build_job,
    get_native_config, get_workspace, initialize_native_project, initialize_vue_project,
    pack_plugin, publish_version, set_native_enabled, start_native_artifact_build_from_dir,
    start_native_plugin_build, update_plugin, DevActionPaths,
};
pub use otools_plugin_dev_api::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginRecord, DevVersionRecord, DevWorkspace,
};
pub use otools_plugin_dev_model::{DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput};

fn dev_action_paths() -> DevActionPaths {
    DevActionPaths::default()
}

pub async fn dev_get_workspace() -> Result<DevWorkspace, HostError> {
    get_workspace(&dev_action_paths())
}

pub async fn dev_create_plugin(input: DevPluginInput) -> Result<DevPluginActionResult, HostError> {
    create_plugin(&dev_action_paths(), input)
}

pub async fn dev_update_plugin(
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, HostError> {
    update_plugin(&dev_action_paths(), input)
}

pub async fn dev_bind_plugin_directory(
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, HostError> {
    bind_plugin_directory(&dev_action_paths(), input)
}

pub async fn dev_enable_debug(uuid: String) -> Result<String, HostError> {
    enable_debug(&dev_action_paths(), uuid)
}

pub async fn dev_disable_debug(uuid: String) -> Result<String, HostError> {
    disable_debug(&dev_action_paths(), uuid)
}

pub async fn dev_initialize_vue_project(uuid: String) -> Result<String, HostError> {
    initialize_vue_project(&dev_action_paths(), uuid)
}

pub async fn dev_initialize_native_project(uuid: String) -> Result<String, HostError> {
    initialize_native_project(&dev_action_paths(), uuid)
}

pub async fn dev_build_native_plugin(uuid: String) -> Result<String, HostError> {
    build_native_plugin(&dev_action_paths(), uuid)
}

pub async fn dev_build_native_artifact(uuid: String) -> Result<String, HostError> {
    build_native_artifact(&dev_action_paths(), uuid)
}

pub async fn dev_build_native_artifact_from_dir(
    directory_path: String,
) -> Result<String, HostError> {
    build_native_artifact_from_dir(directory_path)
}

pub async fn dev_start_native_plugin_build(
    uuid: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    start_native_plugin_build(&dev_action_paths(), uuid)
}

pub async fn dev_start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    start_native_artifact_build_from_dir(directory_path)
}

pub async fn dev_get_native_build_job(
    job_id: String,
) -> Result<DevNativeBuildJobSnapshot, HostError> {
    get_native_build_job(job_id)
}

pub async fn dev_get_native_config(uuid: String) -> Result<DevNativeConfig, HostError> {
    get_native_config(&dev_action_paths(), uuid)
}

pub async fn dev_set_native_enabled(uuid: String, enabled: bool) -> Result<String, HostError> {
    set_native_enabled(&dev_action_paths(), uuid, enabled)
}

pub async fn dev_pack_plugin(uuid: String) -> Result<DevPluginActionResult, HostError> {
    pack_plugin(&dev_action_paths(), uuid)
}

pub async fn dev_publish_version(
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, HostError> {
    publish_version(&dev_action_paths(), input)
}

pub fn supports_plugin(plugin_uuid: &str) -> bool {
    matches!(
        plugin_uuid.trim().to_ascii_lowercase().as_str(),
        "otools-dev" | "dev"
    )
}

pub async fn dispatch_command(command: &str, payload: Value) -> Result<Value, HostError> {
    match command {
        "dev_get_workspace" => command_result(dev_get_workspace().await?),
        "dev_create_plugin" => {
            let params = command_payload::<InputParam<DevPluginInput>>(payload)?;
            command_result(dev_create_plugin(params.input).await?)
        }
        "dev_update_plugin" => {
            let params = command_payload::<InputParam<DevPluginUpdateInput>>(payload)?;
            command_result(dev_update_plugin(params.input).await?)
        }
        "dev_bind_plugin_directory" => {
            let params = command_payload::<InputParam<DevBindDirectoryInput>>(payload)?;
            command_result(dev_bind_plugin_directory(params.input).await?)
        }
        "dev_enable_debug" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_enable_debug(params.uuid).await?)
        }
        "dev_disable_debug" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_disable_debug(params.uuid).await?)
        }
        "dev_initialize_vue_project" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_initialize_vue_project(params.uuid).await?)
        }
        "dev_initialize_native_project" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_initialize_native_project(params.uuid).await?)
        }
        "dev_build_native_plugin" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_build_native_plugin(params.uuid).await?)
        }
        "dev_build_native_artifact" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_build_native_artifact(params.uuid).await?)
        }
        "dev_build_native_artifact_from_dir" => {
            let params = command_payload::<DirectoryPathParam>(payload)?;
            command_result(dev_build_native_artifact_from_dir(params.directory_path).await?)
        }
        "dev_start_native_plugin_build" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_start_native_plugin_build(params.uuid).await?)
        }
        "dev_start_native_artifact_build_from_dir" => {
            let params = command_payload::<DirectoryPathParam>(payload)?;
            command_result(dev_start_native_artifact_build_from_dir(params.directory_path).await?)
        }
        "dev_get_native_build_job" => {
            let params = command_payload::<JobIdParam>(payload)?;
            command_result(dev_get_native_build_job(params.job_id).await?)
        }
        "dev_get_native_config" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_get_native_config(params.uuid).await?)
        }
        "dev_set_native_enabled" => {
            let params = command_payload::<NativeEnabledParam>(payload)?;
            command_result(dev_set_native_enabled(params.uuid, params.enabled).await?)
        }
        "dev_pack_plugin" => {
            let params = command_payload::<UuidParam>(payload)?;
            command_result(dev_pack_plugin(params.uuid).await?)
        }
        "dev_publish_version" => {
            let params = command_payload::<InputParam<DevPublishVersionInput>>(payload)?;
            command_result(dev_publish_version(params.input).await?)
        }
        _ => Err(HostError::not_found(format!(
            "Unsupported otools-dev command: {command}"
        ))),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputParam<T> {
    input: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UuidParam {
    uuid: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryPathParam {
    directory_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobIdParam {
    job_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEnabledParam {
    uuid: String,
    enabled: bool,
}

fn command_payload<T: DeserializeOwned>(payload: Value) -> Result<T, HostError> {
    let payload = if payload.is_null() {
        Value::Object(Map::new())
    } else {
        payload
    };
    serde_json::from_value(payload).map_err(|error| {
        HostError::invalid_input("Invalid plugin command payload").with_detail(error.to_string())
    })
}

fn command_result<T: Serialize>(value: T) -> Result<Value, HostError> {
    serde_json::to_value(value).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize plugin command result")
            .with_detail(error.to_string())
    })
}

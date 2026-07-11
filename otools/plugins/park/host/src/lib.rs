use std::path::PathBuf;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use otools_core::catalog;
use otools_core::HostError;
pub use otools_plugin_park_catalog::{
    ParkCatalogItem, ParkCategory, ParkReviewItem,
};
use otools_plugin_park_catalog::normalize_catalog_item_identity;
use otools_plugin_park_local_catalog::{
    park_local_catalog_path, read_local_park_catalog, write_local_park_catalog,
};
use otools_plugin_park_download::resolve_local_source_path;
pub use otools_plugin_park_install::ParkInstallResult;
use otools_plugin_park_install::{install_catalog_item, ParkInstallContext};
use otools_plugin_park_install_record::build_offline_catalog_item;
use otools_plugin_park_installed::{
    remove_installed_plugin,
};
pub use otools_plugin_park_workspace::ParkWorkspace;
use otools_plugin_park_workspace::{get_workspace, ParkWorkspaceContext};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkInstallInput {
    pub item: ParkCatalogItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkUninstallInput {
    pub item: ParkCatalogItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkUninstallResult {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", skip_serializing_if = "Option::is_none")]
    pub display_name_cn: Option<String>,
    pub all_plugins_count: usize,
    pub message: String,
}

fn park_downloads_dir() -> PathBuf {
    catalog::park_root_dir().join("downloads")
}

fn park_plugins_dir() -> PathBuf {
    catalog::installed_plugins_dir()
}

fn park_plugins_file_path() -> PathBuf {
    catalog::plugins_file_path()
}

fn current_otools_version() -> String {
    std::env::var("CODEG_OTOOLS_VERSION")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

fn park_install_context() -> ParkInstallContext {
    ParkInstallContext {
        current_otools_version: current_otools_version(),
        downloads_dir: park_downloads_dir(),
        plugins_dir: park_plugins_dir(),
    }
}

fn park_workspace_context() -> ParkWorkspaceContext {
    ParkWorkspaceContext {
        downloads_dir: park_downloads_dir(),
        plugins_dir: park_plugins_dir(),
        plugins_file_path: park_plugins_file_path(),
        local_catalog_path: park_local_catalog_path(),
        current_otools_version: current_otools_version(),
    }
}

pub async fn park_get_workspace(cate: Option<String>) -> Result<ParkWorkspace, HostError> {
    get_workspace(cate, &park_workspace_context()).await
}

pub async fn park_install_plugin(input: ParkInstallInput) -> Result<ParkInstallResult, HostError> {
    let result = install_catalog_item(&input.item, &park_install_context()).await?;
    let mut local_items = read_local_park_catalog(&park_local_catalog_path()).unwrap_or_default();
    if let Ok(value) = serde_json::to_value(&input.item) {
        let target = normalize_catalog_item_uuid(&input.item.uuid, &input.item.packid);
        local_items.retain(|item| {
            serde_json::from_value::<ParkCatalogItem>(item.clone())
                .map(|catalog_item| {
                    normalize_catalog_item_uuid(&catalog_item.uuid, &catalog_item.packid) != target
                })
                .unwrap_or(true)
        });
        local_items.push(value);
        let _ = write_local_park_catalog(&park_local_catalog_path(), &local_items);
    }
    Ok(result)
}

fn normalize_catalog_item_uuid(uuid: &str, packid: &str) -> String {
    normalize_catalog_item_identity(uuid, packid)
}

pub async fn park_install_offline_plugin(
    file_path: String,
) -> Result<ParkInstallResult, HostError> {
    let path = resolve_local_source_path(&file_path)?;
    let catalog_item = build_offline_catalog_item(&path)?;
    install_catalog_item(&catalog_item, &park_install_context()).await
}

pub async fn park_uninstall_plugin(
    input: ParkUninstallInput,
) -> Result<ParkUninstallResult, HostError> {
    let item = input.item;
    let (all_plugins, removed_plugin) =
        remove_installed_plugin(&item, &park_plugins_file_path(), &park_plugins_dir())?;
    let uuid = removed_plugin
        .as_ref()
        .map(|plugin| plugin.uuid.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| item.uuid.trim().to_string());
    let packid = removed_plugin
        .as_ref()
        .map(|plugin| plugin.packid.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| item.packid.trim().to_string());
    let display_name = removed_plugin
        .as_ref()
        .map(|plugin| plugin.display_name.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            let fallback = item.display_name.trim();
            if fallback.is_empty() {
                packid.clone()
            } else {
                fallback.to_string()
            }
        });
    let display_name_cn = removed_plugin
        .as_ref()
        .and_then(|plugin| plugin.display_name_cn.clone())
        .or(item.display_name_cn);
    Ok(ParkUninstallResult {
        uuid,
        packid,
        display_name: display_name.clone(),
        display_name_cn,
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {display_name} 已卸载"),
    })
}

pub fn supports_plugin(plugin_uuid: &str) -> bool {
    matches!(
        plugin_uuid.trim().to_ascii_lowercase().as_str(),
        "otools-park" | "park"
    )
}

pub async fn dispatch_command(command: &str, payload: Value) -> Result<Value, HostError> {
    match command {
        "park_get_workspace" => {
            let params = command_payload::<ParkWorkspaceParam>(payload)?;
            command_result(park_get_workspace(params.cate).await?)
        }
        "park_install_plugin" => {
            let params = command_payload::<InputParam<ParkInstallInput>>(payload)?;
            command_result(park_install_plugin(params.input).await?)
        }
        "park_install_offline_plugin" => {
            let params = command_payload::<FilePathParam>(payload)?;
            command_result(park_install_offline_plugin(params.file_path).await?)
        }
        "park_uninstall_plugin" => {
            let params = command_payload::<InputParam<ParkUninstallInput>>(payload)?;
            command_result(park_uninstall_plugin(params.input).await?)
        }
        _ => Err(HostError::not_found(format!(
            "Unsupported otools-park command: {command}"
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
struct ParkWorkspaceParam {
    cate: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilePathParam {
    file_path: String,
}

fn command_payload<T: DeserializeOwned>(payload: Value) -> Result<T, HostError> {
    let payload = if payload.is_null() {
        Value::Object(serde_json::Map::new())
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

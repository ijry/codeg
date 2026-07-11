use std::collections::HashMap;
use std::path::{Path, PathBuf};

use otools_core::catalog::{self, ToolPlugin};
use otools_core::HostError;
use otools_plugin_park_catalog::{
    apply_catalog_runtime_state, build_installed_plugin_state_index,
    merge_remote_metadata_into_installed_catalog_item, normalize_catalog_item_identity,
    ParkCatalogItem, ParkCategory, ParkInstalledPluginState,
};
use otools_plugin_park_installed::build_installed_catalog_item;
use otools_plugin_park_local_catalog::read_local_park_catalog;
use otools_plugin_park_market::{
    build_workspace_categories, fetch_remote_category_items, fetch_remote_items_index,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ParkWorkspaceContext {
    pub downloads_dir: PathBuf,
    pub plugins_dir: PathBuf,
    pub plugins_file_path: PathBuf,
    pub local_catalog_path: PathBuf,
    pub current_otools_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkWorkspace {
    pub downloads_dir: String,
    pub plugins_dir: String,
    pub plugins_file_path: String,
    #[serde(rename = "currentOToolsVersion", alias = "currentOtoolsVersion")]
    pub current_otools_version: String,
    pub categories: Vec<ParkCategory>,
    pub items: Vec<ParkCatalogItem>,
    pub note: String,
}

pub async fn get_workspace(
    cate: Option<String>,
    context: &ParkWorkspaceContext,
) -> Result<ParkWorkspace, HostError> {
    catalog::ensure_dir_exists(&context.downloads_dir)?;
    catalog::ensure_dir_exists(&context.plugins_dir)?;
    catalog::ensure_plugins_file(&context.plugins_file_path)?;
    let requested_cate = cate
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("hot")
        .to_ascii_lowercase();
    let merged_plugins = catalog::load_merged_plugins()?;
    let external_plugins = merged_plugins
        .iter()
        .filter(|plugin| !plugin.builtin.unwrap_or(false))
        .cloned()
        .collect::<Vec<_>>();
    let installed_plugins_index = build_installed_plugins_index(&external_plugins);
    let installed_count = installed_plugins_index.len();
    let client = reqwest::Client::new();
    let mut note = "Park 是一个大家园，欢迎大家提交插件。".to_string();
    let mut items = if requested_cate == "installed" {
        let remote_index = fetch_remote_items_index(&client).await.unwrap_or_default();
        let mut installed_items = external_plugins
            .iter()
            .map(|plugin| {
                let key = normalize_catalog_item_identity(&plugin.uuid, &plugin.packid);
                merge_remote_metadata_into_installed_item(
                    plugin,
                    remote_index.get(&key),
                    &context.plugins_dir,
                )
            })
            .collect::<Vec<_>>();
        installed_items.sort_by(|left, right| {
            left.display_name
                .to_ascii_lowercase()
                .cmp(&right.display_name.to_ascii_lowercase())
        });
        installed_items
    } else {
        match fetch_remote_category_items(&client, &requested_cate).await {
            Ok(items) => items,
            Err(error) => {
                note = format!("插件市场远程列表暂不可用: {}", error.message);
                let local_items = read_local_park_catalog(&context.local_catalog_path)?
                    .into_iter()
                    .filter_map(|value| serde_json::from_value::<ParkCatalogItem>(value).ok())
                    .collect::<Vec<_>>();
                if local_items.is_empty() {
                    external_plugins
                        .iter()
                        .map(|plugin| plugin_to_catalog_item(plugin, &context.plugins_dir))
                        .collect()
                } else {
                    local_items
                }
            }
        }
    };
    apply_catalog_runtime_state(
        &mut items,
        &installed_plugins_index,
        &context.current_otools_version,
    );
    let categories =
        build_workspace_categories(&client, &requested_cate, items.len(), installed_count).await;
    Ok(ParkWorkspace {
        downloads_dir: context.downloads_dir.to_string_lossy().to_string(),
        plugins_dir: context.plugins_dir.to_string_lossy().to_string(),
        plugins_file_path: context.plugins_file_path.to_string_lossy().to_string(),
        current_otools_version: context.current_otools_version.clone(),
        categories,
        items,
        note,
    })
}

fn plugin_to_catalog_item(plugin: &ToolPlugin, plugins_dir: &Path) -> ParkCatalogItem {
    build_installed_catalog_item(plugin, plugins_dir)
}

fn build_installed_plugins_index(
    plugins: &[ToolPlugin],
) -> HashMap<String, ParkInstalledPluginState> {
    build_installed_plugin_state_index(plugins.iter().map(|plugin| ParkInstalledPluginState {
        uuid: plugin.uuid.clone(),
        packid: plugin.packid.clone(),
        version: plugin.version.clone(),
    }))
}

fn merge_remote_metadata_into_installed_item(
    plugin: &ToolPlugin,
    remote: Option<&ParkCatalogItem>,
    plugins_dir: &Path,
) -> ParkCatalogItem {
    merge_remote_metadata_into_installed_catalog_item(
        build_installed_catalog_item(plugin, plugins_dir),
        remote,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_context_is_cloneable_for_host_boundaries() {
        let context = ParkWorkspaceContext {
            downloads_dir: PathBuf::from("downloads"),
            plugins_dir: PathBuf::from("plugins"),
            plugins_file_path: PathBuf::from("plugins.json"),
            local_catalog_path: PathBuf::from("park-local.json"),
            current_otools_version: "1.0.0".to_string(),
        };

        let cloned = context.clone();

        assert_eq!(cloned.downloads_dir, PathBuf::from("downloads"));
        assert_eq!(cloned.plugins_dir, PathBuf::from("plugins"));
        assert_eq!(cloned.plugins_file_path, PathBuf::from("plugins.json"));
        assert_eq!(cloned.local_catalog_path, PathBuf::from("park-local.json"));
        assert_eq!(cloned.current_otools_version, "1.0.0");
    }
}

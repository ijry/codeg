pub use otools_plugin_dev_state::DevVersionRecord;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginRecord {
    pub uuid: String,
    pub icon: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    pub dev_url: String,
    pub has_ad: bool,
    pub in_plugin_purchase: bool,
    pub agreement_accepted: bool,
    pub created_at: String,
    pub updated_at: String,
    pub debug_enabled: bool,
    pub directory_bound: bool,
    pub bound_directory_path: String,
    pub plugin_manifest_path: String,
    pub pack_file_path: String,
    pub version_records: Vec<DevVersionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevBindDirectoryInput {
    pub uuid: String,
    pub directory_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevWorkspace {
    pub meta_state_file_path: String,
    pub binding_state_file_path: String,
    pub packs_dir: String,
    pub docs_url: String,
    pub items: Vec<DevPluginRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeBuildJobStart {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeBuildJobSnapshot {
    pub job_id: String,
    pub running: bool,
    pub success: Option<bool>,
    pub log: String,
    pub message: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginActionResult {
    pub message: String,
    pub item: DevPluginRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeConfig {
    pub enabled: bool,
    pub manifest_path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_dev_workspace_items() {
        let workspace = DevWorkspace::default();

        assert!(workspace.items.is_empty());
    }
}

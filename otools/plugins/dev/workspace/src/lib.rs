use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_api::{DevPluginRecord, DevWorkspace};
use otools_plugin_dev_state::{
    normalize_version_records, read_binding_state, read_meta_state, DevPluginBindingRecord,
    DevPluginMetaRecord,
};
use otools_plugin_support::package_name_from_pack_id;

pub fn build_workspace_item(
    meta: &DevPluginMetaRecord,
    binding: Option<&DevPluginBindingRecord>,
    debug_enabled: bool,
    packs_dir: &Path,
) -> DevPluginRecord {
    DevPluginRecord {
        uuid: meta.uuid.clone(),
        icon: meta.icon.clone(),
        packid: meta.packid.clone(),
        display_name: meta.display_name.clone(),
        display_name_cn: meta.display_name_cn.clone(),
        developer_name: meta.developer_name.clone(),
        summary: meta.summary.clone(),
        screenshots: meta.screenshots.clone(),
        version: meta.version.clone(),
        dev_url: meta.dev_url.clone(),
        has_ad: meta.has_ad,
        in_plugin_purchase: meta.in_plugin_purchase,
        agreement_accepted: meta.agreement_accepted,
        created_at: meta.created_at.clone(),
        updated_at: meta.updated_at.clone(),
        debug_enabled,
        directory_bound: binding.is_some(),
        bound_directory_path: binding
            .map(|item| item.directory_path.clone())
            .unwrap_or_default(),
        plugin_manifest_path: binding
            .map(|item| item.plugin_manifest_path.clone())
            .unwrap_or_default(),
        pack_file_path: pack_file_path_for(packs_dir, &meta.packid, &meta.version)
            .to_string_lossy()
            .to_string(),
        version_records: normalize_version_records(&meta.version, &meta.version_records),
    }
}

pub fn build_dev_workspace<F>(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
    docs_url: &str,
    debug_registered: F,
) -> Result<DevWorkspace, HostError>
where
    F: FnMut(&str) -> Result<bool, HostError>,
{
    Ok(DevWorkspace {
        meta_state_file_path: meta_path.to_string_lossy().to_string(),
        binding_state_file_path: binding_path.to_string_lossy().to_string(),
        packs_dir: packs_dir.to_string_lossy().to_string(),
        docs_url: docs_url.to_string(),
        items: load_dev_workspace_items(meta_path, binding_path, packs_dir, debug_registered)?,
    })
}

pub fn load_dev_workspace_items<F>(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
    mut debug_registered: F,
) -> Result<Vec<DevPluginRecord>, HostError>
where
    F: FnMut(&str) -> Result<bool, HostError>,
{
    let meta_items = read_meta_state(meta_path)?;
    let binding_items = read_binding_state(binding_path)?;
    let mut output = Vec::with_capacity(meta_items.len());
    for meta in &meta_items {
        let binding = binding_items.iter().find(|item| item.uuid == meta.uuid);
        output.push(build_workspace_item(
            meta,
            binding,
            debug_registered(&meta.uuid)?,
            packs_dir,
        ));
    }
    output.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(output)
}

pub fn find_dev_workspace_item<F>(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
    uuid: &str,
    debug_registered: F,
) -> Result<DevPluginRecord, HostError>
where
    F: FnMut(&str) -> Result<bool, HostError>,
{
    load_dev_workspace_items(meta_path, binding_path, packs_dir, debug_registered)?
        .into_iter()
        .find(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))
}

pub fn pack_file_path_for(packs_dir: &Path, packid: &str, version: &str) -> PathBuf {
    packs_dir.join(format!(
        "{}-{}.oplg",
        package_name_from_pack_id(packid, "otools-dev-plugin"),
        version.trim()
    ))
}

pub fn validate_bound_directory(directory_path: &str) -> Result<(String, String), HostError> {
    let trimmed = directory_path.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input("请选择开发目录"));
    }
    let directory = PathBuf::from(trimmed);
    if !directory.exists() || !directory.is_dir() {
        return Err(HostError::not_found(format!(
            "开发目录不存在: {}",
            directory.display()
        )));
    }
    let manifest_path = catalog::resolve_plugin_manifest_path(&directory).ok_or_else(|| {
        HostError::not_found(format!(
            "绑定失败，目录中必须包含 plugin.json 或 otools/plugin.json: {}",
            directory.display()
        ))
    })?;
    Ok((
        directory.to_string_lossy().to_string(),
        manifest_path.to_string_lossy().to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use otools_plugin_dev_state::{write_binding_state, write_meta_state};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-workspace-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn builds_workspace_item_with_pack_path() {
        let meta = DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            packid: "Sample.Plugin".to_string(),
            display_name: "Sample".to_string(),
            version: "1.0.0".to_string(),
            updated_at: "updated".to_string(),
            ..DevPluginMetaRecord::default()
        };
        let binding = DevPluginBindingRecord {
            uuid: "dev-uuid".to_string(),
            directory_path: "plugin-dir".to_string(),
            plugin_manifest_path: "plugin-dir/plugin.json".to_string(),
            ..DevPluginBindingRecord::default()
        };

        let item = build_workspace_item(&meta, Some(&binding), true, &PathBuf::from("packs"));

        assert_eq!(item.uuid, "dev-uuid");
        assert!(item.debug_enabled);
        assert!(item.directory_bound);
        assert_eq!(item.bound_directory_path, "plugin-dir");
        assert_eq!(item.plugin_manifest_path, "plugin-dir/plugin.json");
        assert_eq!(
            PathBuf::from(item.pack_file_path),
            PathBuf::from("packs").join("sample-plugin-1.0.0.oplg")
        );
    }

    #[test]
    fn validates_bound_directory_with_nested_manifest() {
        let root = temp_test_dir("bound-directory");
        fs::create_dir_all(root.join("otools")).expect("create otools dir");
        fs::write(root.join("otools/plugin.json"), "{}").expect("write manifest");

        let (directory, manifest) =
            validate_bound_directory(&root.to_string_lossy()).expect("validate directory");

        assert_eq!(directory, root.to_string_lossy());
        assert_eq!(PathBuf::from(manifest), root.join("otools/plugin.json"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn builds_workspace_response_from_state_files() {
        let root = temp_test_dir("response");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        let packs_dir = root.join("packs");
        write_meta_state(
            &meta_path,
            &[
                DevPluginMetaRecord {
                    uuid: "older".to_string(),
                    packid: "older-plugin".to_string(),
                    display_name: "Older".to_string(),
                    version: "0.9.0".to_string(),
                    updated_at: "2026-01-01T00:00:00Z".to_string(),
                    ..DevPluginMetaRecord::default()
                },
                DevPluginMetaRecord {
                    uuid: "newer".to_string(),
                    packid: "newer-plugin".to_string(),
                    display_name: "Newer".to_string(),
                    version: "1.0.0".to_string(),
                    updated_at: "2026-02-01T00:00:00Z".to_string(),
                    ..DevPluginMetaRecord::default()
                },
            ],
        )
        .expect("write meta");
        write_binding_state(
            &binding_path,
            &[DevPluginBindingRecord {
                uuid: "newer".to_string(),
                directory_path: "plugin-dir".to_string(),
                plugin_manifest_path: "plugin-dir/plugin.json".to_string(),
                ..DevPluginBindingRecord::default()
            }],
        )
        .expect("write binding");

        let workspace = build_dev_workspace(
            &meta_path,
            &binding_path,
            &packs_dir,
            "https://docs.example",
            |uuid| Ok(uuid == "newer"),
        )
        .expect("build workspace");

        assert_eq!(workspace.docs_url, "https://docs.example");
        assert_eq!(workspace.items.len(), 2);
        assert_eq!(workspace.items[0].uuid, "newer");
        assert!(workspace.items[0].debug_enabled);
        assert!(workspace.items[0].directory_bound);
        assert_eq!(workspace.items[1].uuid, "older");
        assert!(!workspace.items[1].debug_enabled);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn finds_workspace_item_by_uuid() {
        let root = temp_test_dir("find");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        write_meta_state(
            &meta_path,
            &[DevPluginMetaRecord {
                uuid: "dev-uuid".to_string(),
                packid: "sample".to_string(),
                display_name: "Sample".to_string(),
                version: "1.0.0".to_string(),
                ..DevPluginMetaRecord::default()
            }],
        )
        .expect("write meta");
        write_binding_state(&binding_path, &[]).expect("write binding");

        let item = find_dev_workspace_item(
            &meta_path,
            &binding_path,
            &root.join("packs"),
            "dev-uuid",
            |_| Ok(false),
        )
        .expect("find item");

        assert_eq!(item.uuid, "dev-uuid");
        fs::remove_dir_all(root).ok();
    }
}

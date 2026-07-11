use std::path::{Path, PathBuf};

use otools_core::catalog::{self, ToolPlugin};
use otools_core::HostError;
use otools_plugin_dev_preview::path_to_file_url;
use otools_plugin_dev_state::{
    read_binding_state, read_meta_state, DevPluginBindingRecord, DevPluginMetaRecord,
};
use serde_json::Value;

pub fn build_debug_plugin_entry(
    meta: &DevPluginMetaRecord,
    entry: String,
    quick_dev: bool,
) -> ToolPlugin {
    ToolPlugin {
        uuid: meta.uuid.clone(),
        packid: meta.packid.clone(),
        display_name: meta.display_name.clone(),
        display_name_cn: meta.display_name_cn.clone(),
        developer_name: meta.developer_name.clone(),
        summary: meta.summary.clone(),
        screenshots: meta.screenshots.clone(),
        version: meta.version.clone(),
        icon: meta.icon.clone(),
        has_ad: meta.has_ad,
        in_plugin_purchase: meta.in_plugin_purchase,
        key: vec![
            meta.packid.clone(),
            meta.display_name.clone(),
            meta.developer_name.clone(),
            "dev".to_string(),
            "plugin".to_string(),
        ],
        entry,
        quick_dev: quick_dev.then_some(true),
        source: Some(catalog::dev_debug_source().to_string()),
        open_in_browser: Some(false),
        ..ToolPlugin::default()
    }
}

pub fn build_debug_plugin_entry_for_binding(
    meta: &DevPluginMetaRecord,
    binding: Option<&DevPluginBindingRecord>,
) -> ToolPlugin {
    build_debug_plugin_entry(
        meta,
        resolve_debug_dev_url(meta, binding),
        resolve_bound_manifest_quick_dev(binding),
    )
}

pub fn enable_debug_plugin_for_uuid(
    meta_path: &Path,
    binding_path: &Path,
    uuid: &str,
) -> Result<DevPluginMetaRecord, HostError> {
    let normalized_uuid = uuid.trim().to_string();
    let meta = read_meta_state(meta_path)?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let binding_items = read_binding_state(binding_path)?;
    let binding = binding_items.iter().find(|item| item.uuid == meta.uuid);
    let _ = catalog::upsert_external_plugin(build_debug_plugin_entry_for_binding(
        &meta, binding,
    ))?;
    Ok(meta)
}

pub fn disable_debug_plugin_for_uuid(
    meta_path: &Path,
    uuid: &str,
) -> Result<DevPluginMetaRecord, HostError> {
    let normalized_uuid = uuid.trim().to_string();
    if normalized_uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let meta = read_meta_state(meta_path)?
        .into_iter()
        .find(|item| item.uuid.eq_ignore_ascii_case(&normalized_uuid))
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let _ = catalog::remove_external_plugin_by_uuid(&meta.uuid, true)?;
    Ok(meta)
}

pub fn refresh_debug_plugin_after_meta_update(
    binding_path: &Path,
    previous: &DevPluginMetaRecord,
    next: &DevPluginMetaRecord,
) -> Result<(), HostError> {
    if !catalog::is_debug_registered(&previous.uuid)? {
        return Ok(());
    }
    if previous.packid != next.packid {
        let _ = catalog::remove_external_plugin_by_uuid(&previous.uuid, true)?;
    }
    let binding_items = read_binding_state(binding_path)?;
    let binding = binding_items.iter().find(|item| item.uuid == next.uuid);
    let _ = catalog::upsert_external_plugin(build_debug_plugin_entry_for_binding(
        next, binding,
    ))?;
    Ok(())
}

fn resolve_bound_plugin_root(directory_path: &str) -> Option<PathBuf> {
    catalog::resolve_plugin_adapter_root(Path::new(directory_path.trim()))
}

fn bound_manifest_path(binding: &DevPluginBindingRecord) -> Option<PathBuf> {
    if binding.plugin_manifest_path.trim().is_empty() {
        catalog::resolve_plugin_manifest_path(Path::new(binding.directory_path.trim()))
    } else {
        Some(PathBuf::from(binding.plugin_manifest_path.trim()))
    }
}

fn resolve_bound_manifest_quick_dev(binding: Option<&DevPluginBindingRecord>) -> bool {
    let Some(binding) = binding else {
        return false;
    };
    let Some(manifest_path) = bound_manifest_path(binding) else {
        return false;
    };
    match catalog::read_json_file::<Value>(&manifest_path).ok() {
        Some(Value::Object(map)) => map
            .get("quickDev")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        _ => false,
    }
}

fn resolve_debug_dev_url(
    meta: &DevPluginMetaRecord,
    binding: Option<&DevPluginBindingRecord>,
) -> String {
    let raw = meta.dev_url.trim();
    if raw.is_empty() {
        return raw.to_string();
    }
    let lower = raw.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("file://")
    {
        return raw.to_string();
    }
    let Some(binding) = binding else {
        return raw.to_string();
    };
    let Some(base_dir) = resolve_bound_plugin_root(&binding.directory_path) else {
        return raw.to_string();
    };
    let (path_part, suffix) = if let Some(pos) = raw.find('?').or_else(|| raw.find('#')) {
        (&raw[..pos], &raw[pos..])
    } else {
        (raw, "")
    };
    let candidate = PathBuf::from(path_part);
    let target_path = if candidate.is_absolute() {
        candidate
    } else {
        base_dir.join(candidate)
    };
    path_to_file_url(&target_path)
        .map(|mut url| {
            url.push_str(suffix);
            url
        })
        .unwrap_or_else(|_| raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_debug_plugin_entry() {
        let meta = DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            version: "1.0.0".to_string(),
            icon: "🧩".to_string(),
            has_ad: true,
            ..DevPluginMetaRecord::default()
        };

        let plugin = build_debug_plugin_entry(&meta, "http://localhost:5173".to_string(), true);

        assert_eq!(plugin.uuid, "dev-uuid");
        assert_eq!(plugin.packid, "sample");
        assert_eq!(plugin.entry, "http://localhost:5173");
        assert_eq!(plugin.quick_dev, Some(true));
        assert_eq!(plugin.source.as_deref(), Some(catalog::dev_debug_source()));
        assert!(plugin.has_ad);
    }

    #[test]
    fn builds_debug_plugin_entry_from_bound_relative_entry() {
        let root = std::env::temp_dir().join(format!(
            "otools-dev-debug-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("dist")).expect("create dist");
        std::fs::write(
            root.join("plugin.json"),
            r#"{"uuid":"dev-uuid","quickDev":true}"#,
        )
        .expect("write manifest");

        let meta = DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            dev_url: "dist/index.html?debug=true".to_string(),
            ..DevPluginMetaRecord::default()
        };
        let binding = DevPluginBindingRecord {
            uuid: "dev-uuid".to_string(),
            directory_path: root.to_string_lossy().to_string(),
            plugin_manifest_path: root.join("plugin.json").to_string_lossy().to_string(),
            ..DevPluginBindingRecord::default()
        };

        let plugin = build_debug_plugin_entry_for_binding(&meta, Some(&binding));

        assert!(plugin.entry.starts_with("file:///"));
        assert!(plugin.entry.ends_with("dist/index.html?debug=true"));
        assert_eq!(plugin.quick_dev, Some(true));
        std::fs::remove_dir_all(root).ok();
    }
}

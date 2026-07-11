use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_api::DevNativeConfig;
use otools_plugin_dev_state::{
    read_binding_state, read_meta_state, DevPluginBindingRecord, DevPluginMetaRecord,
};
use otools_plugin_support::sanitize_plugin_packid;
use serde_json::{Map, Value};

pub fn apply_meta_to_manifest_map(map: &mut Map<String, Value>, meta: &DevPluginMetaRecord) {
    map.insert("uuid".to_string(), Value::String(meta.uuid.clone()));
    map.insert("packid".to_string(), Value::String(meta.packid.clone()));
    map.insert(
        "displayName".to_string(),
        Value::String(meta.display_name.clone()),
    );
    if let Some(display_name_cn) = &meta.display_name_cn {
        map.insert(
            "displayNameCN".to_string(),
            Value::String(display_name_cn.clone()),
        );
    }
    map.insert(
        "developerName".to_string(),
        Value::String(meta.developer_name.clone()),
    );
    map.insert("summary".to_string(), Value::String(meta.summary.clone()));
    map.insert(
        "screenshots".to_string(),
        Value::Array(
            meta.screenshots
                .iter()
                .map(|item| Value::String(item.clone()))
                .collect(),
        ),
    );
    map.insert("version".to_string(), Value::String(meta.version.clone()));
    map.insert("icon".to_string(), Value::String(meta.icon.clone()));
    map.insert("devUrl".to_string(), Value::String(meta.dev_url.clone()));
    map.insert("hasAd".to_string(), Value::Bool(meta.has_ad));
    map.insert(
        "inPluginPurchase".to_string(),
        Value::Bool(meta.in_plugin_purchase),
    );
}

pub fn sync_manifest_basic_fields(
    manifest_path: &Path,
    meta: &DevPluginMetaRecord,
) -> Result<(), HostError> {
    if !manifest_path.exists() {
        return Ok(());
    }
    let Ok(value) = catalog::read_json_file::<Value>(manifest_path) else {
        return Ok(());
    };
    let Value::Object(mut map) = value else {
        return Ok(());
    };
    apply_meta_to_manifest_map(&mut map, meta);
    catalog::write_json_file(manifest_path, &Value::Object(map))
}

pub fn sync_bound_manifest_basic_fields(
    bindings: &[DevPluginBindingRecord],
    uuid: &str,
    meta: &DevPluginMetaRecord,
) -> Result<(), HostError> {
    let Some(binding) = bindings.iter().find(|item| item.uuid == uuid) else {
        return Ok(());
    };
    let manifest_path = if binding.plugin_manifest_path.trim().is_empty() {
        catalog::resolve_plugin_manifest_path(Path::new(binding.directory_path.trim()))
    } else {
        Some(PathBuf::from(binding.plugin_manifest_path.trim()))
    };
    if let Some(manifest_path) = manifest_path {
        sync_manifest_basic_fields(&manifest_path, meta)?;
    }
    Ok(())
}

pub fn find_bound_manifest_path(
    bindings: &[DevPluginBindingRecord],
    uuid: &str,
) -> Result<PathBuf, HostError> {
    let binding = bindings
        .iter()
        .find(|item| item.uuid == uuid.trim())
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    if !binding.plugin_manifest_path.trim().is_empty() {
        return Ok(PathBuf::from(binding.plugin_manifest_path.trim()));
    }
    catalog::resolve_plugin_manifest_path(Path::new(binding.directory_path.trim())).ok_or_else(
        || {
            HostError::not_found(format!(
                "绑定失败，目录中必须包含 plugin.json 或 otools/plugin.json: {}",
                binding.directory_path.trim()
            ))
        },
    )
}

pub fn read_native_enabled_from_value(value: &Value) -> bool {
    let Value::Object(map) = value else {
        return false;
    };
    match map.get("native") {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Object(native_map)) => native_map
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        _ => false,
    }
}

pub fn native_plugin_install_manifest_path(uuid: &str) -> Option<PathBuf> {
    let normalized = sanitize_plugin_packid(uuid);
    if normalized.is_empty() {
        return None;
    }
    Some(
        catalog::installed_plugins_dir()
            .join(normalized)
            .join("plugin.json"),
    )
}

pub fn read_native_config_for_uuid(
    binding_path: &Path,
    uuid: &str,
) -> Result<DevNativeConfig, HostError> {
    let bindings = read_binding_state(binding_path)?;
    let manifest_path = find_bound_manifest_path(&bindings, uuid)?;
    if !manifest_path.exists() {
        return Ok(DevNativeConfig {
            enabled: false,
            manifest_path: manifest_path.to_string_lossy().to_string(),
        });
    }
    let value = catalog::read_json_file::<Value>(&manifest_path)?;
    Ok(DevNativeConfig {
        enabled: read_native_enabled_from_value(&value),
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

pub fn set_native_enabled_for_uuid(
    meta_path: &Path,
    binding_path: &Path,
    uuid: &str,
    enabled: bool,
    install_manifest_path: Option<&Path>,
) -> Result<(), HostError> {
    let normalized_uuid = uuid.trim().to_string();
    let meta = read_meta_state(meta_path)?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let bindings = read_binding_state(binding_path)?;
    let manifest_path = find_bound_manifest_path(&bindings, &normalized_uuid)?;
    update_manifest_native_enabled(&manifest_path, enabled, Some(&meta))?;
    if let Some(install_manifest_path) = install_manifest_path {
        update_manifest_native_enabled(install_manifest_path, enabled, Some(&meta))?;
    }
    Ok(())
}

pub fn update_manifest_native_enabled(
    manifest_path: &Path,
    enabled: bool,
    meta: Option<&DevPluginMetaRecord>,
) -> Result<(), HostError> {
    let existed = manifest_path.exists();
    if !enabled && !existed {
        return Ok(());
    }

    let value = if existed {
        catalog::read_json_file::<Value>(manifest_path)?
    } else {
        Value::Object(Map::new())
    };
    let mut map = match value {
        Value::Object(map) => map,
        _ => Map::new(),
    };

    if !existed {
        if let Some(meta) = meta {
            map.entry("uuid".to_string())
                .or_insert_with(|| Value::String(meta.uuid.clone()));
            map.entry("packid".to_string())
                .or_insert_with(|| Value::String(meta.packid.clone()));
            map.entry("displayName".to_string())
                .or_insert_with(|| Value::String(meta.display_name.clone()));
            if let Some(display_name_cn) = &meta.display_name_cn {
                map.entry("displayNameCN".to_string())
                    .or_insert_with(|| Value::String(display_name_cn.clone()));
            }
            map.entry("developerName".to_string())
                .or_insert_with(|| Value::String(meta.developer_name.clone()));
            map.entry("version".to_string())
                .or_insert_with(|| Value::String(meta.version.clone()));
        }
    }

    update_native_enabled_in_map(&mut map, enabled);
    catalog::write_json_file(manifest_path, &Value::Object(map))
}

fn update_native_enabled_in_map(map: &mut Map<String, Value>, enabled: bool) {
    match map.get_mut("native") {
        Some(Value::Object(native_map)) => {
            native_map.insert("enabled".to_string(), Value::Bool(enabled));
        }
        _ => {
            map.insert(
                "native".to_string(),
                serde_json::json!({ "enabled": enabled }),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use otools_plugin_dev_state::{write_binding_state, write_meta_state};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-manifest-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn sample_meta() -> DevPluginMetaRecord {
        DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            icon: "logo.svg".to_string(),
            packid: "otools-sample".to_string(),
            display_name: "Sample".to_string(),
            display_name_cn: Some("示例".to_string()),
            developer_name: "Lingyun".to_string(),
            summary: "Summary".to_string(),
            screenshots: vec!["screen-1.png".to_string(), "screen-2.png".to_string()],
            version: "1.2.3".to_string(),
            dev_url: "http://127.0.0.1:5173".to_string(),
            has_ad: true,
            in_plugin_purchase: true,
            agreement_accepted: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-02T00:00:00Z".to_string(),
            version_records: Vec::new(),
        }
    }

    #[test]
    fn applies_meta_to_manifest_map() {
        let meta = sample_meta();
        let mut map = Map::new();

        apply_meta_to_manifest_map(&mut map, &meta);

        assert_eq!(map.get("uuid").and_then(Value::as_str), Some("dev-uuid"));
        assert_eq!(
            map.get("packid").and_then(Value::as_str),
            Some("otools-sample")
        );
        assert_eq!(
            map.get("displayName").and_then(Value::as_str),
            Some("Sample")
        );
        assert_eq!(
            map.get("displayNameCN").and_then(Value::as_str),
            Some("示例")
        );
        assert_eq!(
            map.get("developerName").and_then(Value::as_str),
            Some("Lingyun")
        );
        assert_eq!(map.get("summary").and_then(Value::as_str), Some("Summary"));
        assert_eq!(map.get("version").and_then(Value::as_str), Some("1.2.3"));
        assert_eq!(map.get("icon").and_then(Value::as_str), Some("logo.svg"));
        assert_eq!(
            map.get("devUrl").and_then(Value::as_str),
            Some("http://127.0.0.1:5173")
        );
        assert_eq!(map.get("hasAd").and_then(Value::as_bool), Some(true));
        assert_eq!(
            map.get("inPluginPurchase").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            map.get("screenshots")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(2)
        );
    }

    #[test]
    fn syncs_existing_manifest_basic_fields() {
        let root = temp_test_dir("sync");
        let manifest_path = root.join("plugin.json");
        fs::write(&manifest_path, r#"{"uuid":"old","custom":true}"#).expect("write manifest");

        sync_manifest_basic_fields(&manifest_path, &sample_meta()).expect("sync manifest");

        let value = catalog::read_json_file::<Value>(&manifest_path).expect("read manifest");
        assert_eq!(value.get("uuid").and_then(Value::as_str), Some("dev-uuid"));
        assert_eq!(value.get("custom").and_then(Value::as_bool), Some(true));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn syncs_bound_manifest_basic_fields() {
        let root = temp_test_dir("bound-sync");
        let manifest_path = root.join("plugin.json");
        fs::write(&manifest_path, r#"{"uuid":"old"}"#).expect("write manifest");
        let binding = DevPluginBindingRecord {
            uuid: "dev-uuid".to_string(),
            directory_path: root.to_string_lossy().to_string(),
            plugin_manifest_path: String::new(),
            ..DevPluginBindingRecord::default()
        };

        sync_bound_manifest_basic_fields(&[binding], "dev-uuid", &sample_meta())
            .expect("sync bound manifest");

        let value = catalog::read_json_file::<Value>(&manifest_path).expect("read manifest");
        assert_eq!(value.get("packid").and_then(Value::as_str), Some("otools-sample"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn finds_nested_bound_manifest_path() {
        let root = temp_test_dir("bound-find");
        fs::create_dir_all(root.join("otools")).expect("create otools dir");
        fs::write(root.join("otools/plugin.json"), "{}").expect("write manifest");
        let binding = DevPluginBindingRecord {
            uuid: "dev-uuid".to_string(),
            directory_path: root.to_string_lossy().to_string(),
            plugin_manifest_path: String::new(),
            ..DevPluginBindingRecord::default()
        };

        let manifest_path =
            find_bound_manifest_path(&[binding], "dev-uuid").expect("find manifest path");

        assert_eq!(manifest_path, root.join("otools/plugin.json"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn reads_and_updates_native_enabled() {
        let root = temp_test_dir("native");
        let manifest_path = root.join("plugin.json");

        update_manifest_native_enabled(&manifest_path, true, Some(&sample_meta()))
            .expect("enable native");
        let value = catalog::read_json_file::<Value>(&manifest_path).expect("read manifest");
        assert!(read_native_enabled_from_value(&value));
        assert_eq!(value.get("uuid").and_then(Value::as_str), Some("dev-uuid"));

        update_manifest_native_enabled(&manifest_path, false, Some(&sample_meta()))
            .expect("disable native");
        let value = catalog::read_json_file::<Value>(&manifest_path).expect("read manifest");
        assert!(!read_native_enabled_from_value(&value));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn native_install_manifest_path_uses_sanitized_plugin_uuid() {
        let manifest_path = native_plugin_install_manifest_path(" Sample.Plugin ")
            .expect("native install manifest path");

        assert!(manifest_path.ends_with(PathBuf::from("sample-plugin").join("plugin.json")));
        assert!(native_plugin_install_manifest_path("   ").is_none());
    }

    #[test]
    fn reads_native_config_for_bound_plugin() {
        let root = temp_test_dir("native-config");
        let manifest_path = root.join("plugin.json");
        fs::write(&manifest_path, r#"{"native":{"enabled":true}}"#).expect("write manifest");
        let binding_path = root.join("binding.json");
        write_binding_state(
            &binding_path,
            &[DevPluginBindingRecord {
                uuid: "dev-uuid".to_string(),
                directory_path: root.to_string_lossy().to_string(),
                plugin_manifest_path: manifest_path.to_string_lossy().to_string(),
                ..DevPluginBindingRecord::default()
            }],
        )
        .expect("write binding");

        let config = read_native_config_for_uuid(&binding_path, "dev-uuid")
            .expect("read native config");

        assert!(config.enabled);
        assert_eq!(
            config.manifest_path,
            manifest_path.to_string_lossy().to_string()
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn sets_native_enabled_for_bound_and_installed_manifests() {
        let root = temp_test_dir("native-config-set");
        let manifest_path = root.join("plugin.json");
        let installed_manifest_path = root.join("installed/plugin.json");
        fs::write(&manifest_path, r#"{"native":false}"#).expect("write manifest");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        write_meta_state(&meta_path, &[sample_meta()]).expect("write meta");
        write_binding_state(
            &binding_path,
            &[DevPluginBindingRecord {
                uuid: "dev-uuid".to_string(),
                directory_path: root.to_string_lossy().to_string(),
                plugin_manifest_path: manifest_path.to_string_lossy().to_string(),
                ..DevPluginBindingRecord::default()
            }],
        )
        .expect("write binding");

        set_native_enabled_for_uuid(
            &meta_path,
            &binding_path,
            "dev-uuid",
            true,
            Some(&installed_manifest_path),
        )
        .expect("set native enabled");

        let bound = catalog::read_json_file::<Value>(&manifest_path).expect("read bound");
        let installed =
            catalog::read_json_file::<Value>(&installed_manifest_path).expect("read installed");
        assert!(read_native_enabled_from_value(&bound));
        assert!(read_native_enabled_from_value(&installed));
        assert_eq!(
            installed.get("packid").and_then(Value::as_str),
            Some("otools-sample")
        );
        fs::remove_dir_all(root).ok();
    }
}

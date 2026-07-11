use std::path::Path;

use otools_core::HostError;
use otools_plugin_dev_preview::normalize_preview_source;
use otools_plugin_dev_state::DevPluginMetaRecord;
use otools_plugin_park_local_catalog::{
    park_local_catalog_path, read_local_park_catalog, write_local_park_catalog,
};
use serde_json::Value;

pub fn upsert_local_park_catalog_item(
    meta: &DevPluginMetaRecord,
    artifact_path: &Path,
) -> Result<(), HostError> {
    upsert_local_park_catalog_item_at(meta, artifact_path, &park_local_catalog_path())
}

pub fn upsert_local_park_catalog_item_at(
    meta: &DevPluginMetaRecord,
    artifact_path: &Path,
    catalog_path: &Path,
) -> Result<(), HostError> {
    let mut items = read_local_park_catalog(catalog_path)?;
    let screenshots = meta
        .screenshots
        .iter()
        .filter_map(|item| normalize_preview_source(item))
        .collect::<Vec<String>>();
    let catalog_item = serde_json::json!({
        "uuid": meta.uuid,
        "packid": meta.packid,
        "displayName": meta.display_name,
        "displayNameCN": meta.display_name_cn.clone(),
        "developerName": meta.developer_name,
        "icon": meta.icon,
        "summary": if meta.summary.trim().is_empty() {
            "来自 Dev 开发工坊的本地插件包。".to_string()
        } else {
            meta.summary.clone()
        },
        "version": meta.version,
        "minOToolsVersion": "",
        "installedVersion": "",
        "updateAvailable": false,
        "meetsMinOToolsVersion": true,
        "entry": "",
        "easyMode": 0,
        "screenshots": screenshots,
        "hasAd": meta.has_ad,
        "inPluginPurchase": meta.in_plugin_purchase,
        "official": false,
        "rating": 0.0,
        "ratingCount": 0,
        "categories": ["latest", "featured"],
        "packageUrl": artifact_path.to_string_lossy().to_string(),
        "reviews": [],
        "supportMacos": true,
        "supportWindows": true,
        "supportLinux": true,
        "installed": false,
        "installable": true
    });

    let target_id = meta.uuid.to_lowercase();
    if let Some(existing) = items.iter_mut().find(|entry| {
        let entry_uuid = entry.get("uuid").and_then(Value::as_str).unwrap_or("");
        let entry_id = if entry_uuid.trim().is_empty() {
            entry.get("packid").and_then(Value::as_str).unwrap_or("")
        } else {
            entry_uuid
        };
        entry_id.eq_ignore_ascii_case(&target_id)
    }) {
        *existing = catalog_item;
    } else {
        items.push(catalog_item);
    }
    write_local_park_catalog(catalog_path, &items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-park-sync-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn upserts_local_park_catalog_item() {
        let root = temp_test_dir("upsert");
        let catalog_path = root.join("local_catalog.json");
        let artifact_path = root.join("sample.oplg");
        let meta = DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            version: "1.0.0".to_string(),
            icon: "🧩".to_string(),
            screenshots: vec!["https://example.com/screen.png".to_string()],
            ..DevPluginMetaRecord::default()
        };

        upsert_local_park_catalog_item_at(&meta, &artifact_path, &catalog_path)
            .expect("upsert catalog item");

        let items = read_local_park_catalog(&catalog_path).expect("read catalog");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].get("uuid").and_then(Value::as_str), Some("dev-uuid"));
        assert_eq!(items[0].get("packid").and_then(Value::as_str), Some("sample"));
        assert_eq!(
            items[0].get("packageUrl").and_then(Value::as_str),
            Some(artifact_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            items[0]
                .get("screenshots")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str),
            Some("https://example.com/screen.png")
        );

        fs::remove_dir_all(root).ok();
    }
}

use std::path::Path;

use otools_core::catalog::ToolPlugin;
use otools_core::HostError;
use otools_plugin_package::{
    detect_effective_plugin_root, read_package_manifest, PluginPackageManifest,
};
use otools_plugin_park_catalog::{normalize_version_text, ParkCatalogItem};
use otools_plugin_support::sanitize_plugin_packid_or;

pub const MARKET_PLUGIN_SOURCE: &str = "market";

pub fn build_easy_mode_package_manifest(
    catalog_item: &ParkCatalogItem,
    uuid: &str,
    packid: &str,
) -> PluginPackageManifest {
    PluginPackageManifest {
        uuid: uuid.to_string(),
        packid: packid.to_string(),
        display_name: catalog_item.display_name.clone(),
        display_name_cn: catalog_item.display_name_cn.clone(),
        developer_name: catalog_item.developer_name.clone(),
        summary: catalog_item.summary.clone(),
        screenshots: catalog_item.screenshots.clone(),
        version: catalog_item.version.clone(),
        min_otools_version: (!catalog_item.min_otools_version.trim().is_empty())
            .then(|| catalog_item.min_otools_version.clone()),
        icon: "logo.png".to_string(),
        key: vec![packid.to_string(), "park".to_string(), "plugin".to_string()],
        entry: Some(catalog_item.entry.clone()),
        ..PluginPackageManifest::default()
    }
}

pub fn build_offline_catalog_item(path: &Path) -> Result<ParkCatalogItem, HostError> {
    if !path.exists() || path.is_dir() {
        return Err(HostError::not_found(format!(
            "离线插件文件不存在: {}",
            path.display()
        )));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension != "oplg" && extension != "zip" {
        return Err(HostError::invalid_input(format!(
            "仅支持 oplg/zip 插件包，当前文件: {}",
            path.display()
        )));
    }
    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("offline-plugin");
    let fallback_packid = sanitize_plugin_packid_or(file_stem, "offline-plugin");
    Ok(ParkCatalogItem {
        uuid: fallback_packid.clone(),
        packid: fallback_packid,
        display_name: file_stem.to_string(),
        developer_name: "Offline".to_string(),
        summary: "离线插件安装".to_string(),
        version: "-".to_string(),
        icon: "🧩".to_string(),
        package_url: path.to_string_lossy().to_string(),
        categories: vec!["installed".to_string()],
        meets_min_otools_version: true,
        installable: true,
        support_macos: true,
        support_windows: true,
        support_linux: true,
        ..ParkCatalogItem::default()
    })
}

pub fn build_plugin_record_from_install(
    catalog_item: &ParkCatalogItem,
    install_dir: &Path,
) -> Result<ToolPlugin, HostError> {
    let plugin_root = detect_effective_plugin_root(install_dir);
    let manifest = read_package_manifest(&plugin_root)?;

    let packid = manifest
        .as_ref()
        .map(|item| item.packid.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| catalog_item.packid.trim().to_string());
    if packid.is_empty() {
        return Err(HostError::invalid_input("安装插件失败: packid 为空"));
    }

    let uuid = manifest
        .as_ref()
        .map(|item| item.uuid.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| {
            if catalog_item.uuid.trim().is_empty() {
                packid.clone()
            } else {
                catalog_item.uuid.trim().to_string()
            }
        });

    let display_name = if catalog_item.display_name.trim().is_empty() {
        manifest
            .as_ref()
            .map(|item| item.display_name.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_default()
    } else {
        catalog_item.display_name.trim().to_string()
    };
    if display_name.is_empty() {
        return Err(HostError::invalid_input(format!(
            "安装插件失败({packid}): 缺少插件名称"
        )));
    }

    let display_name_cn = catalog_item
        .display_name_cn
        .as_ref()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .or_else(|| {
            manifest
                .as_ref()
                .and_then(|item| item.display_name_cn.as_ref())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
        });
    let screenshots = manifest
        .as_ref()
        .map(|item| {
            item.screenshots
                .iter()
                .map(|shot| shot.trim().to_string())
                .filter(|shot| !shot.is_empty())
                .collect::<Vec<String>>()
        })
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| {
            catalog_item
                .screenshots
                .iter()
                .map(|shot| shot.trim().to_string())
                .filter(|shot| !shot.is_empty())
                .collect()
        });
    let min_otools_version = manifest
        .as_ref()
        .and_then(|item| item.min_otools_version.as_ref())
        .map(|item| normalize_version_text(item))
        .filter(|item| !item.is_empty())
        .or_else(|| {
            let fallback = normalize_version_text(&catalog_item.min_otools_version);
            if fallback.is_empty() {
                None
            } else {
                Some(fallback)
            }
        });
    let mut key = manifest
        .as_ref()
        .map(|item| item.key.clone())
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<String>>();
    if key.is_empty() {
        key = vec![packid.clone(), "park".to_string(), "plugin".to_string()];
    }
    let entry = manifest
        .as_ref()
        .and_then(|item| item.entry.as_ref())
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .or_else(|| {
            plugin_root
                .join("index.html")
                .is_file()
                .then(|| "index.html".to_string())
        })
        .or_else(|| {
            plugin_root
                .join("dist")
                .join("index.html")
                .is_file()
                .then(|| "dist/index.html".to_string())
        })
        .or_else(|| {
            let fallback = catalog_item.entry.trim();
            (!fallback.is_empty()).then(|| fallback.to_string())
        });
    let Some(entry) = entry else {
        return Err(HostError::invalid_input(format!(
            "安装插件失败({packid}): 未找到可用入口(entry/index.html)"
        )));
    };

    Ok(ToolPlugin {
        uuid,
        packid,
        display_name,
        display_name_cn,
        developer_name: manifest
            .as_ref()
            .map(|item| item.developer_name.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.developer_name.trim().to_string()),
        summary: manifest
            .as_ref()
            .map(|item| item.summary.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.summary.trim().to_string()),
        screenshots,
        version: manifest
            .as_ref()
            .map(|item| item.version.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.version.trim().to_string()),
        min_otools_version,
        icon: manifest
            .as_ref()
            .map(|item| item.icon.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.icon.trim().to_string()),
        has_ad: catalog_item.has_ad,
        in_plugin_purchase: catalog_item.in_plugin_purchase,
        key,
        entry,
        source: Some(MARKET_PLUGIN_SOURCE.to_string()),
        open_in_browser: manifest
            .as_ref()
            .and_then(|item| item.open_in_browser)
            .or(Some(false)),
        autostart: manifest.as_ref().and_then(|item| item.autostart.clone()),
        shutdown_hooks: manifest
            .as_ref()
            .and_then(|item| item.shutdown_hooks.clone()),
        permissions: manifest
            .as_ref()
            .map(|item| item.permissions.clone())
            .unwrap_or_default(),
        enabled: true,
        builtin: Some(false),
        ..ToolPlugin::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-park-install-record-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn write_file(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, content).expect("write test file");
    }

    #[test]
    fn builds_plugin_record_from_nested_otools_root() {
        let root = temp_test_dir("nested-install-root");
        write_file(
            &root,
            "otools/plugin.json",
            r#"{"uuid":"sample","packid":"sample","displayName":"Sample","icon":"logo.png"}"#,
        );
        write_file(&root, "otools/dist/index.html", "<main>Sample</main>");
        let catalog_item = ParkCatalogItem {
            uuid: "fallback".to_string(),
            packid: "fallback".to_string(),
            display_name: "Fallback".to_string(),
            icon: "🧩".to_string(),
            ..ParkCatalogItem::default()
        };

        let plugin =
            build_plugin_record_from_install(&catalog_item, &root).expect("build plugin record");

        assert_eq!(plugin.uuid, "sample");
        assert_eq!(plugin.packid, "sample");
        assert_eq!(plugin.display_name, "Fallback");
        assert_eq!(plugin.entry, "dist/index.html");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_missing_entry() {
        let root = temp_test_dir("missing-entry");
        write_file(
            &root,
            "plugin.json",
            r#"{"uuid":"sample","packid":"sample","displayName":"Sample"}"#,
        );
        let catalog_item = ParkCatalogItem {
            uuid: "sample".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            icon: "🧩".to_string(),
            ..ParkCatalogItem::default()
        };

        let error = build_plugin_record_from_install(&catalog_item, &root)
            .expect_err("missing entry should fail");

        assert!(error.message.contains("未找到可用入口"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn builds_easy_mode_package_manifest() {
        let catalog_item = ParkCatalogItem {
            display_name: "Web Tool".to_string(),
            display_name_cn: Some("网页工具".to_string()),
            developer_name: "Developer".to_string(),
            summary: "Summary".to_string(),
            screenshots: vec!["screen.png".to_string()],
            version: "1.2.3".to_string(),
            min_otools_version: "1.0.0".to_string(),
            entry: "https://example.com/app".to_string(),
            ..ParkCatalogItem::default()
        };

        let manifest =
            build_easy_mode_package_manifest(&catalog_item, "tool-uuid", "tool-packid");

        assert_eq!(manifest.uuid, "tool-uuid");
        assert_eq!(manifest.packid, "tool-packid");
        assert_eq!(manifest.display_name, "Web Tool");
        assert_eq!(manifest.display_name_cn.as_deref(), Some("网页工具"));
        assert_eq!(manifest.icon, "logo.png");
        assert_eq!(manifest.key, vec!["tool-packid", "park", "plugin"]);
        assert_eq!(manifest.entry.as_deref(), Some("https://example.com/app"));
        assert_eq!(manifest.min_otools_version.as_deref(), Some("1.0.0"));
    }

    #[test]
    fn builds_offline_catalog_item_from_package_path() {
        let root = temp_test_dir("offline-catalog-item");
        let package_path = root.join("Sample.Plugin.oplg");
        fs::write(&package_path, "zip").expect("write package");

        let item = build_offline_catalog_item(&package_path).expect("build offline item");

        assert_eq!(item.uuid, "sample-plugin");
        assert_eq!(item.packid, "sample-plugin");
        assert_eq!(item.display_name, "Sample.Plugin");
        assert_eq!(item.developer_name, "Offline");
        assert_eq!(item.package_url, package_path.to_string_lossy());
        assert!(item.installable);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_non_package_offline_catalog_item() {
        let root = temp_test_dir("offline-catalog-item-invalid");
        let package_path = root.join("sample.txt");
        fs::write(&package_path, "txt").expect("write file");

        let error = build_offline_catalog_item(&package_path).expect_err("invalid package");

        assert!(error.message.contains("仅支持"));
        let _ = fs::remove_dir_all(root);
    }
}

use std::fs;
use std::path::{Component, Path, PathBuf};

use otools_core::catalog::{self, ToolPlugin};
use otools_core::HostError;
use otools_plugin_park_catalog::ParkCatalogItem;
use otools_plugin_support::{collect_plugin_dir_candidates, normalize_plugin_identity};
use url::Url;

pub fn build_installed_catalog_item(
    plugin: &ToolPlugin,
    plugins_dir: &Path,
) -> ParkCatalogItem {
    let plugin_id = plugin.packid.trim();
    let plugin_name = plugin.display_name.trim();
    let raw_icon = plugin.icon.trim();
    let plugin_root = installed_plugin_root(plugin, plugins_dir);
    let icon = resolve_installed_plugin_icon(raw_icon, plugin, &plugin_root);
    let has_entry = !plugin.entry.trim().is_empty();
    let has_dev_url = plugin
        .dev_url
        .as_ref()
        .map(|item| !item.trim().is_empty())
        .unwrap_or(false);
    let summary = if has_entry || has_dev_url {
        "已安装本地插件，可在首页直接打开。".to_string()
    } else {
        "已安装插件（暂未提供详情元数据）".to_string()
    };

    ParkCatalogItem {
        uuid: if plugin.uuid.trim().is_empty() {
            plugin_id.to_string()
        } else {
            plugin.uuid.trim().to_string()
        },
        packid: plugin_id.to_string(),
        display_name: if plugin_name.is_empty() {
            plugin_id.to_string()
        } else {
            plugin_name.to_string()
        },
        display_name_cn: plugin
            .display_name_cn
            .as_ref()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty()),
        developer_name: plugin.developer_name.trim().to_string(),
        summary,
        screenshots: plugin.screenshots.clone(),
        version: if plugin.version.trim().is_empty() {
            "-".to_string()
        } else {
            plugin.version.trim().to_string()
        },
        min_otools_version: plugin
            .min_otools_version
            .as_ref()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_default(),
        installed_version: if plugin.version.trim().is_empty() {
            String::new()
        } else {
            plugin.version.trim().to_string()
        },
        update_available: false,
        meets_min_otools_version: true,
        icon,
        entry: plugin.entry.trim().to_string(),
        easy_mode: 0,
        has_ad: false,
        in_plugin_purchase: false,
        official: false,
        rating: 0.0,
        rating_count: 0,
        categories: vec!["installed".to_string()],
        package_url: String::new(),
        reviews: Vec::new(),
        support_macos: true,
        support_windows: true,
        support_linux: true,
        installed: true,
        installable: false,
    }
}

pub fn remove_installed_plugin(
    item: &ParkCatalogItem,
    plugins_file_path: &Path,
    plugins_dir: &Path,
) -> Result<(Vec<ToolPlugin>, Option<ToolPlugin>), HostError> {
    let target_uuid = normalize_plugin_identity(&item.uuid, &item.packid);
    let mut plugins = catalog::read_plugins_file(plugins_file_path)?;
    let mut removed = None;
    plugins.retain(|plugin| {
        let plugin_uuid = normalize_plugin_identity(&plugin.uuid, &plugin.packid);
        if plugin_uuid == target_uuid {
            removed = Some(plugin.clone());
            false
        } else {
            true
        }
    });
    catalog::write_plugins_file(plugins_file_path, &plugins)?;
    if let Some(plugin) = &removed {
        let mut candidates = vec![item.uuid.as_str(), item.packid.as_str()];
        candidates.push(plugin.uuid.as_str());
        candidates.push(plugin.packid.as_str());
        for install_dir in collect_plugin_dir_candidates(&plugins_dir, &candidates, "offline-plugin")
        {
            if install_dir.exists() {
                fs::remove_dir_all(install_dir).map_err(HostError::io)?;
            }
        }
    }
    Ok((plugins, removed))
}

fn installed_plugin_root(plugin: &ToolPlugin, plugins_dir: &Path) -> PathBuf {
    let candidates = collect_plugin_dir_candidates(
        plugins_dir,
        &[plugin.uuid.as_str(), plugin.packid.as_str()],
        "offline-plugin",
    );
    for candidate in &candidates {
        if let Some(plugin_root) = catalog::resolve_plugin_adapter_root(candidate) {
            return plugin_root;
        }
        if candidate.join("index.html").is_file() {
            return candidate.clone();
        }
    }
    candidates
        .into_iter()
        .next()
        .unwrap_or_else(|| plugins_dir.to_path_buf())
}

fn is_short_text_icon(raw: &str) -> bool {
    let text = raw.trim();
    if text.is_empty() {
        return false;
    }
    if text.starts_with("http://")
        || text.starts_with("https://")
        || text.starts_with("file://")
        || text.starts_with("asset://")
        || text.starts_with("tauri://")
        || text.starts_with("data:")
    {
        return false;
    }
    text.chars().count() <= 4
}

fn asset_url_for_relative_icon(plugin: &ToolPlugin, relative: &Path) -> Option<String> {
    let plugin_id = if plugin.uuid.trim().is_empty() {
        plugin.packid.trim()
    } else {
        plugin.uuid.trim()
    };
    if plugin_id.is_empty() {
        return None;
    }
    let mut parts = Vec::<String>::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => {
                let part = value.to_string_lossy().replace('\\', "/");
                if part.is_empty() || part.contains('/') {
                    return None;
                }
                parts.push(part);
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("/otools-assets/{plugin_id}/{}", parts.join("/")))
    }
}

fn asset_url_for_icon_file(
    plugin: &ToolPlugin,
    plugin_root: &Path,
    icon_path: &Path,
) -> Option<String> {
    let canonical_root = plugin_root.canonicalize().ok()?;
    let canonical_icon = icon_path.canonicalize().ok()?;
    if !canonical_icon.is_file() || !canonical_icon.starts_with(&canonical_root) {
        return None;
    }
    let relative = canonical_icon.strip_prefix(canonical_root).ok()?;
    asset_url_for_relative_icon(plugin, relative)
}

fn resolve_installed_plugin_icon(raw: &str, plugin: &ToolPlugin, plugin_root: &Path) -> String {
    let text = raw.trim();
    if text.is_empty() {
        return "🧩".to_string();
    }
    if text.starts_with("@builtin:") || is_short_text_icon(text) {
        return text.to_string();
    }
    if let Ok(url) = Url::parse(text) {
        if url.scheme().eq_ignore_ascii_case("file") {
            if let Ok(path) = url.to_file_path() {
                if let Some(asset_url) = asset_url_for_icon_file(plugin, plugin_root, &path) {
                    return asset_url;
                }
            }
        }
        return url.to_string();
    }

    let candidate = PathBuf::from(text);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        plugin_root.join(candidate)
    };
    asset_url_for_icon_file(plugin, plugin_root, &resolved).unwrap_or_else(|| "🧩".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-park-installed-{name}-{stamp}"));
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
    fn resolve_installed_plugin_icon_returns_asset_url_for_local_files() {
        let root = temp_test_dir("icon-asset-url");
        write_file(&root, "logo.png", "png");
        let plugin = ToolPlugin {
            uuid: "sample".to_string(),
            packid: "sample-pack".to_string(),
            ..ToolPlugin::default()
        };
        let file_url = Url::from_file_path(root.join("logo.png")).expect("file url");

        assert_eq!(
            resolve_installed_plugin_icon("logo.png", &plugin, &root),
            "/otools-assets/sample/logo.png"
        );
        assert_eq!(
            resolve_installed_plugin_icon(file_url.as_str(), &plugin, &root),
            "/otools-assets/sample/logo.png"
        );
        assert_eq!(resolve_installed_plugin_icon("🦀", &plugin, &root), "🦀");
        assert_eq!(
            resolve_installed_plugin_icon("https://example.com/icon.png", &plugin, &root),
            "https://example.com/icon.png"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn remove_installed_plugin_updates_file_and_deletes_install_dir() {
        let root = temp_test_dir("remove-installed");
        let plugins_dir = root.join("plugins");
        let plugins_file = root.join("plugins.json");
        let install_dir = plugins_dir.join("sample");
        fs::create_dir_all(&install_dir).expect("create install dir");
        let plugin = ToolPlugin {
            uuid: "sample".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            ..ToolPlugin::default()
        };
        catalog::write_plugins_file(&plugins_file, &[plugin]).expect("write plugins file");
        let item = ParkCatalogItem {
            uuid: "sample".to_string(),
            packid: "sample".to_string(),
            ..ParkCatalogItem::default()
        };

        let (plugins, removed) = remove_installed_plugin(&item, &plugins_file, &plugins_dir)
            .expect("remove installed plugin");

        assert!(plugins.is_empty());
        assert_eq!(removed.expect("removed plugin").uuid, "sample");
        assert!(!install_dir.exists());

        let _ = fs::remove_dir_all(root);
    }
}

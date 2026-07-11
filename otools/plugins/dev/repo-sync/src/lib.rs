use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_model::{dedupe_string_list, is_valid_plugin_icon, normalize_dev_url};
use otools_plugin_dev_package::read_repo_plugin_manifest;
use otools_plugin_dev_state::{
    normalize_version_records, read_binding_state, read_meta_state, write_binding_state,
    write_meta_state, DevPluginBindingRecord, DevPluginMetaRecord,
};
use otools_plugin_support::{collect_workspace_plugin_dirs, sanitize_plugin_packid};
use uuid::Uuid;

pub fn sync_workspace_repo_plugins(
    plugin_dirs: &[PathBuf],
    meta_path: &Path,
    binding_path: &Path,
) -> Result<(), HostError> {
    if plugin_dirs.is_empty() {
        return Ok(());
    }

    let mut meta_items = read_meta_state(meta_path)?;
    let mut binding_items = read_binding_state(binding_path)?;
    let mut meta_changed = false;
    let mut binding_changed = false;

    for plugins_dir in plugin_dirs {
        let entries = fs::read_dir(plugins_dir).map_err(HostError::io)?;
        for entry in entries {
            let entry = entry.map_err(HostError::io)?;
            let directory_path = entry.path();
            if !directory_path.is_dir() {
                continue;
            }

            let Some(layout) = catalog::resolve_plugin_adapter_layout(&directory_path) else {
                continue;
            };
            let manifest = match read_repo_plugin_manifest(&layout.manifest_path) {
                Ok(item) => item,
                Err(error) => {
                    eprintln!("[OTools Dev] {}", error);
                    continue;
                }
            };

            let packid = sanitize_plugin_packid(&manifest.packid);
            let display_name = manifest.display_name.trim().to_string();
            if packid.is_empty() || display_name.is_empty() {
                continue;
            }
            let version = if manifest.version.trim().is_empty() {
                "0.1.0".to_string()
            } else {
                manifest.version.trim().to_string()
            };
            let icon = normalized_icon(&manifest.icon);
            let uuid = resolve_uuid_for_manifest(&meta_items, &packid, &manifest.uuid);

            if !meta_items
                .iter()
                .any(|item| item.packid.eq_ignore_ascii_case(&packid))
            {
                meta_items.push(DevPluginMetaRecord {
                    uuid: uuid.clone(),
                    icon,
                    packid: packid.clone(),
                    display_name,
                    display_name_cn: manifest
                        .display_name_cn
                        .as_ref()
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    developer_name: manifest.developer_name.trim().to_string(),
                    summary: manifest.summary.trim().to_string(),
                    screenshots: dedupe_string_list(&manifest.screenshots),
                    version: version.clone(),
                    dev_url: normalize_dev_url(&manifest.dev_url),
                    has_ad: manifest.has_ad,
                    in_plugin_purchase: manifest.in_plugin_purchase,
                    agreement_accepted: true,
                    created_at: now_text(),
                    updated_at: now_text(),
                    version_records: normalize_version_records(&version, &[]),
                });
                meta_changed = true;
            }

            let directory_path_text = directory_path.to_string_lossy().to_string();
            let manifest_path_text = layout.manifest_path.to_string_lossy().to_string();
            if let Some(existing) = binding_items.iter_mut().find(|item| item.uuid == uuid) {
                if existing.directory_path != directory_path_text
                    || existing.plugin_manifest_path != manifest_path_text
                {
                    existing.directory_path = directory_path_text.clone();
                    existing.plugin_manifest_path = manifest_path_text.clone();
                    existing.updated_at = now_text();
                    binding_changed = true;
                }
            } else {
                binding_items.push(DevPluginBindingRecord {
                    uuid,
                    directory_path: directory_path_text,
                    plugin_manifest_path: manifest_path_text,
                    bound_at: now_text(),
                    updated_at: now_text(),
                });
                binding_changed = true;
            }
        }
    }

    if meta_changed {
        write_meta_state(meta_path, &meta_items)?;
    }
    if binding_changed {
        write_binding_state(binding_path, &binding_items)?;
    }

    Ok(())
}

pub fn ensure_dev_workspace(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
) -> Result<(), HostError> {
    catalog::ensure_dir_exists(&catalog::dev_local_root_dir())?;
    catalog::ensure_dir_exists(packs_dir)?;
    let _ = read_meta_state(meta_path)?;
    let _ = read_binding_state(binding_path)?;
    sync_workspace_repo_plugins(
        &discover_workspace_plugin_dirs(),
        meta_path,
        binding_path,
    )?;
    Ok(())
}

pub fn discover_workspace_plugin_dirs() -> Vec<PathBuf> {
    let explicit_dirs = ["CODEG_OTOOLS_DEV_PLUGIN_DIR", "CODEG_OTOOLS_PLUGIN_DIR"]
        .iter()
        .filter_map(|key| std::env::var_os(key))
        .flat_map(|value| std::env::split_paths(&value).collect::<Vec<PathBuf>>())
        .collect::<Vec<_>>();
    let mut roots = Vec::<PathBuf>::new();
    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir);
    }
    roots.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    let builtin_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..");
    collect_workspace_plugin_dirs(&explicit_dirs, &roots, &builtin_root)
}

fn normalized_icon(raw: &str) -> String {
    let value = raw.trim();
    if is_valid_plugin_icon(value) {
        value.to_string()
    } else {
        "🧩".to_string()
    }
}

fn resolve_uuid_for_manifest(
    meta_items: &[DevPluginMetaRecord],
    packid: &str,
    manifest_uuid: &str,
) -> String {
    meta_items
        .iter()
        .find(|item| item.packid.eq_ignore_ascii_case(packid))
        .map(|item| item.uuid.clone())
        .unwrap_or_else(|| {
            let from_manifest = manifest_uuid.trim();
            if from_manifest.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                from_manifest.to_string()
            }
        })
}

fn now_text() -> String {
    Local::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-repo-sync-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn syncs_repo_plugin_manifest_into_dev_state() {
        let root = temp_test_dir("sync");
        let plugins_dir = root.join("plugins");
        let plugin_dir = plugins_dir.join("sample");
        fs::create_dir_all(&plugin_dir).expect("create plugin dir");
        fs::write(
            plugin_dir.join("plugin.json"),
            r#"{
              "uuid": "repo-uuid",
              "packid": "Sample.Plugin",
              "displayName": "Sample",
              "displayNameCN": "示例",
              "developerName": "Developer",
              "summary": "Summary",
              "screenshots": [" https://example.com/a.png ", "https://example.com/a.png"],
              "version": "1.2.3",
              "devUrl": "localhost:5173",
              "hasAd": true,
              "inPluginPurchase": true
            }"#,
        )
        .expect("write manifest");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");

        sync_workspace_repo_plugins(&[plugins_dir], &meta_path, &binding_path)
            .expect("sync repo plugin");

        let meta_items = read_meta_state(&meta_path).expect("read meta state");
        let binding_items = read_binding_state(&binding_path).expect("read binding state");

        assert_eq!(meta_items.len(), 1);
        assert_eq!(meta_items[0].uuid, "repo-uuid");
        assert_eq!(meta_items[0].packid, "sample-plugin");
        assert_eq!(meta_items[0].display_name, "Sample");
        assert_eq!(meta_items[0].display_name_cn.as_deref(), Some("示例"));
        assert_eq!(meta_items[0].screenshots, vec!["https://example.com/a.png"]);
        assert_eq!(meta_items[0].version, "1.2.3");
        assert_eq!(meta_items[0].dev_url, "http://localhost:5173");
        assert!(meta_items[0].has_ad);
        assert!(meta_items[0].in_plugin_purchase);
        assert!(meta_items[0].agreement_accepted);
        assert_eq!(binding_items.len(), 1);
        assert_eq!(binding_items[0].uuid, "repo-uuid");
        assert_eq!(PathBuf::from(&binding_items[0].directory_path), plugin_dir);
        assert_eq!(
            PathBuf::from(&binding_items[0].plugin_manifest_path),
            plugin_dir.join("plugin.json")
        );

        fs::remove_dir_all(root).ok();
    }
}

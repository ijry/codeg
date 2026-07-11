use std::fs;
use std::path::Path;

use chrono::Local;
use otools_core::catalog;
use otools_core::{HostError, HostErrorCode};
use otools_plugin_dev_model::{
    normalize_dev_plugin_input, normalize_publish_version_input, DevPluginInput,
    DevPluginUpdateInput, DevPublishVersionInput,
};
use otools_plugin_support::sanitize_plugin_packid;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

const DEV_STATE_FILE_VERSION: u64 = 1;
const DEV_LOCAL_STATE_FILE_VERSION: u64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevVersionRecord {
    pub id: String,
    pub version: String,
    pub changelog: String,
    pub download_url: String,
    pub published_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginMetaRecord {
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
    pub version_records: Vec<DevVersionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginBindingRecord {
    pub uuid: String,
    pub directory_path: String,
    pub plugin_manifest_path: String,
    pub bound_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct DevPluginMetaUpdate {
    pub previous: DevPluginMetaRecord,
    pub next: DevPluginMetaRecord,
}

pub fn build_default_version_record(version: &str) -> DevVersionRecord {
    DevVersionRecord {
        id: format!("local-{}", sanitize_plugin_packid(version)),
        version: version.trim().to_string(),
        changelog: "本地版本记录".to_string(),
        download_url: String::new(),
        published_at: now_text(),
        status: "local".to_string(),
    }
}

pub fn normalize_version_records(
    current_version: &str,
    items: &[DevVersionRecord],
) -> Vec<DevVersionRecord> {
    let mut output = items
        .iter()
        .filter_map(|item| {
            let version = item.version.trim();
            if version.is_empty() {
                return None;
            }
            Some(DevVersionRecord {
                id: if item.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    item.id.trim().to_string()
                },
                version: version.to_string(),
                changelog: item.changelog.trim().to_string(),
                download_url: item.download_url.trim().to_string(),
                published_at: if item.published_at.trim().is_empty() {
                    now_text()
                } else {
                    item.published_at.trim().to_string()
                },
                status: if item.status.trim().is_empty() {
                    "published".to_string()
                } else {
                    item.status.trim().to_string()
                },
            })
        })
        .collect::<Vec<_>>();
    if output.is_empty() {
        output.push(build_default_version_record(current_version));
    } else if !output
        .iter()
        .any(|item| item.version.eq_ignore_ascii_case(current_version.trim()))
    {
        output.insert(0, build_default_version_record(current_version));
    }
    output.sort_by(|left, right| right.published_at.cmp(&left.published_at));
    output
}

pub fn build_meta_record(
    uuid: &str,
    meta: &DevPluginInput,
    existing: Option<&DevPluginMetaRecord>,
) -> DevPluginMetaRecord {
    DevPluginMetaRecord {
        uuid: uuid.to_string(),
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
        created_at: existing
            .map(|item| item.created_at.clone())
            .unwrap_or_else(now_text),
        updated_at: now_text(),
        version_records: normalize_version_records(
            &meta.version,
            &existing
                .map(|item| item.version_records.clone())
                .unwrap_or_default(),
        ),
    }
}

pub fn publish_version_record(item: &mut DevPluginMetaRecord, input: &DevPublishVersionInput) {
    item.version = input.version.clone();
    item.updated_at = now_text();
    if let Some(existing) = item
        .version_records
        .iter_mut()
        .find(|entry| entry.version.eq_ignore_ascii_case(&input.version))
    {
        existing.changelog = input.changelog.clone();
        existing.download_url = input.download_url.clone();
        existing.published_at = now_text();
        existing.status = "published".to_string();
    } else {
        item.version_records.insert(
            0,
            DevVersionRecord {
                id: Uuid::new_v4().to_string(),
                version: input.version.clone(),
                changelog: input.changelog.clone(),
                download_url: input.download_url.clone(),
                published_at: now_text(),
                status: "published".to_string(),
            },
        );
    }
    item.version_records = normalize_version_records(&item.version, &item.version_records);
}

pub fn create_plugin_meta_record(
    path: &Path,
    input: DevPluginInput,
) -> Result<DevPluginMetaRecord, HostError> {
    let meta = normalize_dev_plugin_input(input)?;
    if !meta.agreement_accepted {
        return Err(HostError::invalid_input("请先同意开发者协议"));
    }
    let mut items = read_meta_state(path)?;
    if items
        .iter()
        .any(|item| item.packid.eq_ignore_ascii_case(&meta.packid))
    {
        return Err(HostError::new(
            HostErrorCode::AlreadyExists,
            format!("Pack ID 已存在: {}", meta.packid),
        ));
    }
    let record = build_meta_record(&Uuid::new_v4().to_string(), &meta, None);
    items.push(record.clone());
    write_meta_state(path, &items)?;
    Ok(record)
}

pub fn update_plugin_meta_record<F>(
    path: &Path,
    input: DevPluginUpdateInput,
    before_write: F,
) -> Result<DevPluginMetaUpdate, HostError>
where
    F: FnOnce(&DevPluginMetaRecord, &DevPluginMetaRecord) -> Result<(), HostError>,
{
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let meta = normalize_dev_plugin_input(input.meta)?;
    let mut items = read_meta_state(path)?;
    let current_index = items
        .iter()
        .position(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    if items.iter().enumerate().any(|(index, item)| {
        index != current_index && item.packid.eq_ignore_ascii_case(&meta.packid)
    }) {
        return Err(HostError::new(
            HostErrorCode::AlreadyExists,
            format!("Pack ID 已存在: {}", meta.packid),
        ));
    }
    let previous = items[current_index].clone();
    let next = build_meta_record(&uuid, &meta, Some(&previous));
    before_write(&previous, &next)?;
    items[current_index] = next.clone();
    write_meta_state(path, &items)?;
    Ok(DevPluginMetaUpdate { previous, next })
}

pub fn publish_version_record_to_state(
    path: &Path,
    input: DevPublishVersionInput,
) -> Result<String, HostError> {
    let input = normalize_publish_version_input(input)?;
    let mut items = read_meta_state(path)?;
    let item = items
        .iter_mut()
        .find(|item| item.uuid == input.uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    publish_version_record(item, &input);
    let uuid = item.uuid.clone();
    write_meta_state(path, &items)?;
    Ok(uuid)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevMetaStateFile {
    version: u64,
    items: Vec<DevPluginMetaRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevBindingStateFile {
    version: u64,
    items: Vec<DevPluginBindingRecord>,
}

pub fn read_meta_state(path: &Path) -> Result<Vec<DevPluginMetaRecord>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &DevMetaStateFile {
                version: DEV_STATE_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = match catalog::read_json_file::<Value>(path) {
        Ok(value) => value,
        Err(error) => {
            let _ = backup_state_file(path, &error.to_string());
            write_meta_state(path, &[])?;
            return Ok(Vec::new());
        }
    };
    match value {
        Value::Object(_) => match serde_json::from_value::<DevMetaStateFile>(value) {
            Ok(file) => Ok(file.items),
            Err(error) => {
                backup_state_file(path, &format!("Invalid OTools dev state: {error}"))?;
                write_meta_state(path, &[])?;
                Ok(Vec::new())
            }
        },
        Value::Array(array) => Ok(array
            .into_iter()
            .filter_map(|item| serde_json::from_value::<DevPluginMetaRecord>(item).ok())
            .collect()),
        _ => {
            backup_state_file(path, "Invalid OTools dev state shape")?;
            write_meta_state(path, &[])?;
            Ok(Vec::new())
        }
    }
}

pub fn write_meta_state(path: &Path, items: &[DevPluginMetaRecord]) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &DevMetaStateFile {
            version: DEV_STATE_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

pub fn read_binding_state(path: &Path) -> Result<Vec<DevPluginBindingRecord>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &DevBindingStateFile {
                version: DEV_LOCAL_STATE_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = match catalog::read_json_file::<Value>(path) {
        Ok(value) => value,
        Err(error) => {
            let _ = backup_state_file(path, &error.to_string());
            write_binding_state(path, &[])?;
            return Ok(Vec::new());
        }
    };
    match value {
        Value::Object(_) => match serde_json::from_value::<DevBindingStateFile>(value) {
            Ok(file) => Ok(file.items),
            Err(error) => {
                backup_state_file(path, &format!("Invalid OTools dev binding state: {error}"))?;
                write_binding_state(path, &[])?;
                Ok(Vec::new())
            }
        },
        Value::Array(array) => Ok(array
            .into_iter()
            .filter_map(|item| serde_json::from_value::<DevPluginBindingRecord>(item).ok())
            .collect()),
        _ => {
            backup_state_file(path, "Invalid OTools dev binding state shape")?;
            write_binding_state(path, &[])?;
            Ok(Vec::new())
        }
    }
}

pub fn write_binding_state(
    path: &Path,
    items: &[DevPluginBindingRecord],
) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &DevBindingStateFile {
            version: DEV_LOCAL_STATE_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

pub fn upsert_binding_record(
    meta_path: &Path,
    binding_path: &Path,
    uuid: &str,
    directory_path: &str,
    manifest_path: &str,
) -> Result<(), HostError> {
    let normalized_uuid = uuid.trim();
    if normalized_uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let meta_items = read_meta_state(meta_path)?;
    if !meta_items.iter().any(|item| item.uuid == normalized_uuid) {
        return Err(HostError::not_found("未找到对应的开发插件"));
    }
    let mut bindings = read_binding_state(binding_path)?;
    if let Some(existing) = bindings
        .iter_mut()
        .find(|item| item.uuid == normalized_uuid)
    {
        existing.directory_path = directory_path.to_string();
        existing.plugin_manifest_path = manifest_path.to_string();
        existing.updated_at = now_text();
    } else {
        bindings.push(DevPluginBindingRecord {
            uuid: normalized_uuid.to_string(),
            directory_path: directory_path.to_string(),
            plugin_manifest_path: manifest_path.to_string(),
            bound_at: now_text(),
            updated_at: now_text(),
        });
    }
    write_binding_state(binding_path, &bindings)
}

fn now_file_stamp() -> String {
    Local::now().format("%Y%m%d%H%M%S").to_string()
}

fn now_text() -> String {
    Local::now().to_rfc3339()
}

fn backup_state_file(path: &Path, reason: &str) -> Result<(), HostError> {
    if !path.exists() {
        return Ok(());
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    let backup_path = path.with_file_name(format!("{file_name}.broken-{}", now_file_stamp()));
    if let Err(error) = fs::rename(path, &backup_path) {
        let content = fs::read_to_string(path).map_err(HostError::io)?;
        fs::write(&backup_path, content).map_err(HostError::io)?;
        let _ = fs::remove_file(path);
        eprintln!(
            "[OTools Dev] 状态文件重命名失败，已复制备份({}): {}",
            path.display(),
            error
        );
    }
    eprintln!(
        "[OTools Dev] 状态文件已备份({})，原因: {}",
        backup_path.display(),
        reason
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-state-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn reads_legacy_meta_array_state() {
        let root = temp_test_dir("legacy-meta");
        let path = root.join("state.json");
        fs::write(
            &path,
            r#"[{"uuid":"dev-uuid","packid":"sample","displayName":"Sample","version":"1.0.0"}]"#,
        )
        .expect("write legacy state");

        let items = read_meta_state(&path).expect("read meta state");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].uuid, "dev-uuid");
        assert_eq!(items[0].display_name, "Sample");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn writes_wrapped_binding_state() {
        let root = temp_test_dir("binding");
        let path = root.join("state.json");

        write_binding_state(
            &path,
            &[DevPluginBindingRecord {
                uuid: "dev-uuid".to_string(),
                directory_path: "plugin".to_string(),
                plugin_manifest_path: "plugin/plugin.json".to_string(),
                bound_at: "now".to_string(),
                updated_at: "now".to_string(),
            }],
        )
        .expect("write binding state");

        let value = catalog::read_json_file::<Value>(&path).expect("read json");
        assert_eq!(value.get("version").and_then(Value::as_u64), Some(1));
        assert_eq!(
            value
                .get("items")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("uuid"))
                .and_then(Value::as_str),
            Some("dev-uuid")
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn upserts_binding_record_for_existing_meta() {
        let root = temp_test_dir("upsert-binding");
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

        upsert_binding_record(
            &meta_path,
            &binding_path,
            " dev-uuid ",
            "plugin-a",
            "plugin-a/plugin.json",
        )
        .expect("insert binding");
        upsert_binding_record(
            &meta_path,
            &binding_path,
            "dev-uuid",
            "plugin-b",
            "plugin-b/plugin.json",
        )
        .expect("update binding");

        let bindings = read_binding_state(&binding_path).expect("read bindings");
        assert_eq!(bindings.len(), 1);
        assert_eq!(bindings[0].uuid, "dev-uuid");
        assert_eq!(bindings[0].directory_path, "plugin-b");
        assert_eq!(bindings[0].plugin_manifest_path, "plugin-b/plugin.json");
        assert!(!bindings[0].bound_at.trim().is_empty());
        assert!(!bindings[0].updated_at.trim().is_empty());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn normalizes_version_records_with_default_current_version() {
        let records = normalize_version_records(
            "1.0.0",
            &[DevVersionRecord {
                id: String::new(),
                version: " 0.9.0 ".to_string(),
                changelog: " Initial ".to_string(),
                download_url: " https://example.com/a.oplg ".to_string(),
                status: String::new(),
                ..DevVersionRecord::default()
            }],
        );

        assert_eq!(records.len(), 2);
        let current = records
            .iter()
            .find(|item| item.version == "1.0.0")
            .expect("current version record");
        let previous = records
            .iter()
            .find(|item| item.version == "0.9.0")
            .expect("previous version record");
        assert_eq!(current.status, "local");
        assert_eq!(previous.changelog, "Initial");
        assert_eq!(previous.download_url, "https://example.com/a.oplg");
        assert_eq!(previous.status, "published");
        assert!(!previous.id.trim().is_empty());
    }

    #[test]
    fn builds_meta_record_preserving_created_at() {
        let input = DevPluginInput {
            icon: "🧩".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            version: "1.0.0".to_string(),
            agreement_accepted: true,
            ..DevPluginInput::default()
        };
        let existing = DevPluginMetaRecord {
            uuid: "dev-uuid".to_string(),
            created_at: "created".to_string(),
            updated_at: "old".to_string(),
            version_records: vec![DevVersionRecord {
                version: "0.9.0".to_string(),
                ..DevVersionRecord::default()
            }],
            ..DevPluginMetaRecord::default()
        };

        let record = build_meta_record("dev-uuid", &input, Some(&existing));

        assert_eq!(record.uuid, "dev-uuid");
        assert_eq!(record.packid, "sample");
        assert_eq!(record.created_at, "created");
        assert_ne!(record.updated_at, "old");
        assert!(record
            .version_records
            .iter()
            .any(|item| item.version == "1.0.0"));
    }

    #[test]
    fn creates_plugin_meta_record_with_normalized_input() {
        let root = temp_test_dir("create-meta");
        let path = root.join("meta.json");

        let record = create_plugin_meta_record(
            &path,
            DevPluginInput {
                icon: "🧩".to_string(),
                packid: "Sample.Plugin".to_string(),
                display_name: "Sample".to_string(),
                developer_name: "Developer".to_string(),
                version: "1.0.0".to_string(),
                agreement_accepted: true,
                ..DevPluginInput::default()
            },
        )
        .expect("create plugin meta");

        assert!(!record.uuid.trim().is_empty());
        assert_eq!(record.packid, "sample-plugin");
        let items = read_meta_state(&path).expect("read meta");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].uuid, record.uuid);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn updates_plugin_meta_record_with_callback_before_write() {
        let root = temp_test_dir("update-meta");
        let path = root.join("meta.json");
        write_meta_state(
            &path,
            &[DevPluginMetaRecord {
                uuid: "dev-uuid".to_string(),
                packid: "old-pack".to_string(),
                display_name: "Old".to_string(),
                developer_name: "Developer".to_string(),
                version: "0.9.0".to_string(),
                created_at: "created".to_string(),
                version_records: vec![DevVersionRecord {
                    version: "0.9.0".to_string(),
                    ..DevVersionRecord::default()
                }],
                ..DevPluginMetaRecord::default()
            }],
        )
        .expect("write meta");

        let update = update_plugin_meta_record(
            &path,
            DevPluginUpdateInput {
                uuid: " dev-uuid ".to_string(),
                meta: DevPluginInput {
                    icon: "🧩".to_string(),
                    packid: "New.Pack".to_string(),
                    display_name: "New".to_string(),
                    developer_name: "Developer".to_string(),
                    version: "1.0.0".to_string(),
                    agreement_accepted: true,
                    ..DevPluginInput::default()
                },
            },
            |previous, next| {
                assert_eq!(previous.packid, "old-pack");
                assert_eq!(next.packid, "new-pack");
                Ok(())
            },
        )
        .expect("update meta");

        assert_eq!(update.previous.created_at, "created");
        assert_eq!(update.next.display_name, "New");
        let items = read_meta_state(&path).expect("read meta");
        assert_eq!(items[0].packid, "new-pack");
        assert_eq!(items[0].created_at, "created");
        assert!(items[0]
            .version_records
            .iter()
            .any(|item| item.version == "1.0.0"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn update_plugin_meta_record_does_not_write_when_callback_fails() {
        let root = temp_test_dir("update-meta-callback-fails");
        let path = root.join("meta.json");
        write_meta_state(
            &path,
            &[DevPluginMetaRecord {
                uuid: "dev-uuid".to_string(),
                packid: "old-pack".to_string(),
                display_name: "Old".to_string(),
                developer_name: "Developer".to_string(),
                version: "0.9.0".to_string(),
                ..DevPluginMetaRecord::default()
            }],
        )
        .expect("write meta");

        let result = update_plugin_meta_record(
            &path,
            DevPluginUpdateInput {
                uuid: "dev-uuid".to_string(),
                meta: DevPluginInput {
                    icon: "🧩".to_string(),
                    packid: "new-pack".to_string(),
                    display_name: "New".to_string(),
                    developer_name: "Developer".to_string(),
                    version: "1.0.0".to_string(),
                    agreement_accepted: true,
                    ..DevPluginInput::default()
                },
            },
            |_, _| Err(HostError::invalid_input("manifest sync failed")),
        );

        assert!(result.is_err());
        let items = read_meta_state(&path).expect("read meta");
        assert_eq!(items[0].packid, "old-pack");
        assert_eq!(items[0].display_name, "Old");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn publish_version_record_updates_existing_or_inserts_new() {
        let mut item = DevPluginMetaRecord {
            version: "0.9.0".to_string(),
            version_records: vec![DevVersionRecord {
                id: "existing".to_string(),
                version: "0.9.0".to_string(),
                changelog: "old".to_string(),
                download_url: "https://example.com/old.oplg".to_string(),
                status: "published".to_string(),
                ..DevVersionRecord::default()
            }],
            ..DevPluginMetaRecord::default()
        };

        publish_version_record(
            &mut item,
            &DevPublishVersionInput {
                version: "0.9.0".to_string(),
                changelog: "updated".to_string(),
                download_url: "https://example.com/new.oplg".to_string(),
                ..DevPublishVersionInput::default()
            },
        );
        publish_version_record(
            &mut item,
            &DevPublishVersionInput {
                version: "1.0.0".to_string(),
                changelog: "new".to_string(),
                download_url: "https://example.com/one.oplg".to_string(),
                ..DevPublishVersionInput::default()
            },
        );

        let updated = item
            .version_records
            .iter()
            .find(|record| record.version == "0.9.0")
            .expect("updated record");
        assert_eq!(updated.id, "existing");
        assert_eq!(updated.changelog, "updated");
        assert_eq!(updated.download_url, "https://example.com/new.oplg");
        assert!(item
            .version_records
            .iter()
            .any(|record| record.version == "1.0.0"
                && record.download_url == "https://example.com/one.oplg"));
        assert_eq!(item.version, "1.0.0");
    }

    #[test]
    fn publishes_version_record_to_state_file() {
        let root = temp_test_dir("publish-state");
        let path = root.join("meta.json");
        write_meta_state(
            &path,
            &[DevPluginMetaRecord {
                uuid: "dev-uuid".to_string(),
                version: "0.9.0".to_string(),
                version_records: vec![DevVersionRecord {
                    version: "0.9.0".to_string(),
                    ..DevVersionRecord::default()
                }],
                ..DevPluginMetaRecord::default()
            }],
        )
        .expect("write meta");

        let uuid = publish_version_record_to_state(
            &path,
            DevPublishVersionInput {
                uuid: "dev-uuid".to_string(),
                version: "1.0.0".to_string(),
                changelog: "new".to_string(),
                download_url: "https://example.com/new.oplg".to_string(),
            },
        )
        .expect("publish version");

        let items = read_meta_state(&path).expect("read meta");
        assert_eq!(uuid, "dev-uuid");
        assert_eq!(items[0].version, "1.0.0");
        assert!(items[0]
            .version_records
            .iter()
            .any(|item| item.version == "1.0.0" && item.changelog == "new"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn resets_invalid_state_and_creates_backup() {
        let root = temp_test_dir("invalid");
        let path = root.join("state.json");
        fs::write(&path, "not-json").expect("write invalid state");

        let items = read_meta_state(&path).expect("read invalid state");

        assert!(items.is_empty());
        let backups = fs::read_dir(&root)
            .expect("read root")
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("state.json.broken-")
            })
            .count();
        assert_eq!(backups, 1);
        fs::remove_dir_all(root).ok();
    }
}

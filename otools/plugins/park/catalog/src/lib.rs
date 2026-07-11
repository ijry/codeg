use std::cmp::Ordering;
use std::collections::HashMap;

use otools_core::HostError;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkReviewItem {
    pub user: String,
    pub rating: f32,
    pub content: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkCatalogItem {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    #[serde(rename = "minOToolsVersion", alias = "minOtoolsVersion")]
    pub min_otools_version: String,
    pub installed_version: String,
    pub update_available: bool,
    #[serde(rename = "meetsMinOToolsVersion", alias = "meetsMinOtoolsVersion")]
    pub meets_min_otools_version: bool,
    pub icon: String,
    pub entry: String,
    pub easy_mode: u8,
    pub has_ad: bool,
    pub in_plugin_purchase: bool,
    pub official: bool,
    pub rating: f32,
    pub rating_count: usize,
    pub categories: Vec<String>,
    pub package_url: String,
    pub reviews: Vec<ParkReviewItem>,
    pub support_macos: bool,
    pub support_windows: bool,
    pub support_linux: bool,
    pub installed: bool,
    pub installable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkCategory {
    pub key: String,
    pub label: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkRemoteCatalogItem {
    pub id: Value,
    pub cloud_id: Value,
    pub uid: Value,
    pub packid: String,
    pub display_name: String,
    #[serde(alias = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    #[serde(alias = "minOToolsVersion", alias = "min_otools_version")]
    pub min_otools_version: String,
    pub icon: String,
    pub entry: String,
    pub easy_mode: Value,
    pub has_ad: Value,
    pub in_plugin_purchase: Value,
    pub official: Value,
    pub rating: Value,
    pub rating_count: Value,
    pub categories: Value,
    pub package_url: String,
    pub url: String,
    pub reviews: Value,
    pub support_macos: Value,
    pub support_windows: Value,
    pub support_linux: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkInstalledPluginState {
    pub uuid: String,
    pub packid: String,
    pub version: String,
}

pub fn normalize_catalog_item_identity(uuid: &str, packid: &str) -> String {
    let value = uuid.trim();
    if value.is_empty() {
        packid.trim().to_ascii_lowercase()
    } else {
        value.to_ascii_lowercase()
    }
}

pub fn build_installed_plugin_state_index(
    plugins: impl IntoIterator<Item = ParkInstalledPluginState>,
) -> HashMap<String, ParkInstalledPluginState> {
    plugins
        .into_iter()
        .filter_map(|plugin| {
            let normalized_id = normalize_catalog_item_identity(&plugin.uuid, &plugin.packid);
            if normalized_id.is_empty() {
                None
            } else {
                Some((normalized_id, plugin))
            }
        })
        .collect()
}

pub fn remote_to_catalog_item(
    item: ParkRemoteCatalogItem,
    cate: &str,
) -> Option<ParkCatalogItem> {
    let packid = item.packid.trim().to_string();
    if packid.is_empty() {
        return None;
    }
    let official = value_bool(&item.official);
    let uuid = {
        let id = value_string(&item.id);
        if !id.is_empty() {
            id
        } else {
            let cloud_id = value_string(&item.cloud_id);
            if !cloud_id.is_empty() {
                cloud_id
            } else {
                let uid = value_string(&item.uid);
                if uid.is_empty() {
                    packid.clone()
                } else {
                    uid
                }
            }
        }
    };
    let package_url = normalize_remote_package_url(&item.package_url);
    let package_url = if package_url.is_empty() {
        normalize_remote_package_url(&item.url)
    } else {
        package_url
    };
    let easy_mode = value_u8(&item.easy_mode).min(1);
    Some(ParkCatalogItem {
        uuid,
        packid,
        display_name: item.display_name.trim().to_string(),
        display_name_cn: item
            .display_name_cn
            .as_ref()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        developer_name: item.developer_name.trim().to_string(),
        summary: item.summary.trim().to_string(),
        screenshots: item
            .screenshots
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect(),
        version: item.version.trim().to_string(),
        min_otools_version: normalize_version_text(&item.min_otools_version),
        installed_version: String::new(),
        update_available: false,
        meets_min_otools_version: true,
        icon: item.icon.trim().to_string(),
        entry: item.entry.trim().to_string(),
        easy_mode,
        has_ad: value_bool(&item.has_ad),
        in_plugin_purchase: value_bool(&item.in_plugin_purchase),
        official,
        rating: value_f32(&item.rating),
        rating_count: value_usize(&item.rating_count),
        categories: normalize_remote_categories(
            &value_string_list(&item.categories),
            cate,
            official,
        ),
        package_url: package_url.clone(),
        reviews: value_reviews(&item.reviews),
        support_macos: value_bool_or(&item.support_macos, true),
        support_windows: value_bool_or(&item.support_windows, true),
        support_linux: value_bool_or(&item.support_linux, true),
        installed: false,
        installable: if easy_mode > 0 {
            true
        } else {
            is_installable_package_url(&package_url)
        },
    })
}

pub fn normalize_remote_package_url(raw: &str) -> String {
    let normalized = raw.trim().trim_matches('\'').trim_matches('"').trim();
    if normalized.is_empty() || normalized.eq_ignore_ascii_case("null") {
        String::new()
    } else {
        normalized.to_string()
    }
}

pub fn is_installable_package_url(raw: &str) -> bool {
    let value = normalize_remote_package_url(raw);
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("file://")
        || std::path::Path::new(&value).is_absolute()
}

pub fn normalize_version_text(value: &str) -> String {
    let normalized = value
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .trim()
        .to_string();
    let lowered = normalized.to_ascii_lowercase();
    if matches!(
        lowered.as_str(),
        "-" | "—" | "–" | "_" | "n/a" | "na" | "null" | "none" | "unknown"
    ) {
        String::new()
    } else {
        normalized
    }
}

fn value_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        _ => String::new(),
    }
}

fn value_bool(value: &Value) -> bool {
    match value {
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_i64().unwrap_or_default() != 0,
        Value::String(text) => matches!(
            text.trim().to_ascii_lowercase().as_str(),
            "true" | "1" | "yes"
        ),
        _ => false,
    }
}

fn value_u8(value: &Value) -> u8 {
    match value {
        Value::Number(number) => number.as_u64().unwrap_or_default().min(u8::MAX as u64) as u8,
        Value::String(text) => text.trim().parse::<u8>().unwrap_or_default(),
        _ => 0,
    }
}

fn value_f32(value: &Value) -> f32 {
    match value {
        Value::Number(number) => number.as_f64().unwrap_or_default() as f32,
        Value::String(text) => text.trim().parse::<f32>().unwrap_or_default(),
        _ => 0.0,
    }
}

fn value_usize(value: &Value) -> usize {
    match value {
        Value::Number(number) => number.as_u64().unwrap_or_default() as usize,
        Value::String(text) => text.trim().parse::<usize>().unwrap_or_default(),
        _ => 0,
    }
}

fn value_string_list(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .map(value_string)
            .filter(|item| !item.is_empty())
            .collect(),
        Value::String(text) => text
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn value_reviews(value: &Value) -> Vec<ParkReviewItem> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| serde_json::from_value::<ParkReviewItem>(item.clone()).ok())
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_remote_categories(
    raw: &[String],
    requested_cate: &str,
    official: bool,
) -> Vec<String> {
    let mut seen = std::collections::HashSet::<String>::new();
    let mut categories = Vec::<String>::new();

    for item in raw {
        let normalized = item.trim().trim_matches(',').to_ascii_lowercase();
        if normalized.is_empty() {
            continue;
        }
        if seen.insert(normalized.clone()) {
            categories.push(normalized);
        }
    }

    let requested = requested_cate.trim().to_ascii_lowercase();
    if !requested.is_empty() && requested != "installed" && seen.insert(requested.clone()) {
        categories.push(requested);
    }
    if official && seen.insert("official".to_string()) {
        categories.push("official".to_string());
    }

    categories
}

fn value_bool_or(value: &Value, fallback: bool) -> bool {
    match value {
        Value::Null => fallback,
        _ => value_bool(value),
    }
}

pub fn is_version_at_least(current: &str, required: &str) -> bool {
    let normalized_required = normalize_version_text(required);
    if normalized_required.is_empty() {
        return true;
    }
    let normalized_current = normalize_version_text(current);
    if normalized_current.is_empty() {
        return true;
    }
    compare_versions(&normalized_current, &normalized_required)
        .map(|ordering| ordering != Ordering::Less)
        .unwrap_or(false)
}

pub fn is_version_greater(candidate: &str, current: &str) -> bool {
    compare_versions(candidate, current)
        .map(|ordering| ordering == Ordering::Greater)
        .unwrap_or(false)
}

pub fn should_replace_remote_item(current: &ParkCatalogItem, candidate: &ParkCatalogItem) -> bool {
    match compare_versions(&candidate.version, &current.version) {
        Some(Ordering::Greater) => return true,
        Some(Ordering::Less) => return false,
        _ => {}
    }
    if candidate.official != current.official {
        return candidate.official;
    }
    candidate.installable && !current.installable
}

pub fn apply_catalog_runtime_state(
    items: &mut [ParkCatalogItem],
    installed_plugins_index: &HashMap<String, ParkInstalledPluginState>,
    current_version: &str,
) {
    for item in items.iter_mut() {
        let normalized_id = normalize_catalog_item_identity(&item.uuid, &item.packid);
        let installed_plugin = installed_plugins_index.get(&normalized_id);
        item.installed = installed_plugin.is_some();
        item.package_url = normalize_remote_package_url(&item.package_url);
        item.installed_version = installed_plugin
            .map(|plugin| plugin.version.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_default();
        item.update_available = if item.installed && !item.installed_version.is_empty() {
            is_version_greater(&item.version, &item.installed_version)
        } else {
            false
        };
        item.min_otools_version = normalize_version_text(&item.min_otools_version);
        item.meets_min_otools_version =
            is_version_at_least(current_version, &item.min_otools_version);
        let has_install_package = if item.easy_mode > 0 {
            true
        } else {
            is_installable_package_url(&item.package_url)
        };
        item.installable = has_install_package && item.meets_min_otools_version;
    }
}

pub fn merge_remote_metadata_into_installed_catalog_item(
    mut local: ParkCatalogItem,
    remote: Option<&ParkCatalogItem>,
) -> ParkCatalogItem {
    let installed_version = local.installed_version.clone();
    if let Some(remote) = remote {
        if !remote.uuid.trim().is_empty() {
            local.uuid = remote.uuid.trim().to_string();
        }
        if !remote.display_name.trim().is_empty() {
            local.display_name = remote.display_name.trim().to_string();
        }
        local.display_name_cn = remote
            .display_name_cn
            .clone()
            .or(local.display_name_cn.clone());
        if !remote.developer_name.trim().is_empty() {
            local.developer_name = remote.developer_name.trim().to_string();
        }
        if !remote.summary.trim().is_empty() {
            local.summary = remote.summary.trim().to_string();
        }
        if !remote.screenshots.is_empty() {
            local.screenshots = remote.screenshots.clone();
        }
        if !remote.version.trim().is_empty() {
            local.version = remote.version.trim().to_string();
        }
        if !remote.min_otools_version.trim().is_empty() {
            local.min_otools_version = remote.min_otools_version.trim().to_string();
        }
        if !remote.icon.trim().is_empty() {
            local.icon = remote.icon.trim().to_string();
        }
        if !remote.entry.trim().is_empty() {
            local.entry = remote.entry.trim().to_string();
        }
        local.easy_mode = remote.easy_mode;
        local.has_ad = remote.has_ad;
        local.in_plugin_purchase = remote.in_plugin_purchase;
        local.official = remote.official;
        local.rating = remote.rating;
        local.rating_count = remote.rating_count;
        local.package_url = normalize_remote_package_url(&remote.package_url);
        local.reviews = remote.reviews.clone();
        local.support_macos = remote.support_macos;
        local.support_windows = remote.support_windows;
        local.support_linux = remote.support_linux;
        local.installable = remote.installable;
        local.categories = {
            let mut categories = vec!["installed".to_string()];
            for category in &remote.categories {
                let normalized = category.trim().to_ascii_lowercase();
                if normalized.is_empty() || categories.iter().any(|item| item == &normalized) {
                    continue;
                }
                categories.push(normalized);
            }
            categories
        };
    }
    local.installed = true;
    local.installed_version = installed_version;
    local
}

pub fn validate_min_otools_version(
    display_name: &str,
    min_otools_version: &str,
    current_version: &str,
) -> Result<(), HostError> {
    let min = normalize_version_text(min_otools_version);
    if min.is_empty() {
        return Ok(());
    }
    if !is_version_at_least(current_version, &min) {
        return Err(HostError::invalid_input(format!(
            "插件 {display_name} 需要 OTools {min} 或更高版本，当前版本 {current}",
            current = normalize_version_text(current_version)
        )));
    }
    Ok(())
}

fn parse_semver_loose(raw: &str) -> Option<Version> {
    let normalized = normalize_version_text(raw);
    if normalized.is_empty() {
        return None;
    }
    if let Ok(version) = Version::parse(&normalized) {
        return Some(version);
    }

    let core = normalized
        .split_once('+')
        .map(|(left, _)| left)
        .unwrap_or(&normalized);
    let core = core
        .split_once('-')
        .map(|(left, _)| left)
        .unwrap_or(core)
        .trim();
    if core.is_empty() {
        return None;
    }

    let parts = core.split('.').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 3 || parts.iter().any(|part| part.parse::<u64>().is_err())
    {
        return None;
    }

    let mut padded = parts.into_iter().map(str::to_string).collect::<Vec<_>>();
    while padded.len() < 3 {
        padded.push("0".to_string());
    }
    Version::parse(&padded.join(".")).ok()
}

fn compare_versions(left: &str, right: &str) -> Option<Ordering> {
    match (parse_semver_loose(left), parse_semver_loose(right)) {
        (Some(left), Some(right)) => Some(left.cmp(&right)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_unknown_version_text() {
        assert_eq!(normalize_version_text(" v1.2 "), "1.2");
        assert_eq!(normalize_version_text("unknown"), "");
        assert_eq!(normalize_version_text("—"), "");
    }

    #[test]
    fn compares_loose_semver_versions() {
        assert!(is_version_at_least("1.2", "1.2.0"));
        assert!(is_version_greater("1.2.1", "1.2"));
        assert!(!is_version_greater("1.2.0", "1.2"));
        assert!(!is_version_at_least("1.0", "2.0"));
    }

    #[test]
    fn remote_replacement_prefers_newer_official_installable() {
        let current = ParkCatalogItem {
            version: "1.0.0".to_string(),
            official: false,
            installable: false,
            ..ParkCatalogItem::default()
        };
        let newer = ParkCatalogItem {
            version: "1.1.0".to_string(),
            ..current.clone()
        };
        assert!(should_replace_remote_item(&current, &newer));

        let official = ParkCatalogItem {
            version: "1.0.0".to_string(),
            official: true,
            ..ParkCatalogItem::default()
        };
        assert!(should_replace_remote_item(&current, &official));

        let installable = ParkCatalogItem {
            version: "1.0.0".to_string(),
            installable: true,
            ..ParkCatalogItem::default()
        };
        assert!(should_replace_remote_item(&current, &installable));
    }

    #[test]
    fn remote_to_catalog_item_normalizes_market_metadata() {
        let item = ParkRemoteCatalogItem {
            id: serde_json::json!("remote-id"),
            cloud_id: Value::Null,
            uid: Value::Null,
            packid: " sample.plugin ".to_string(),
            display_name: " Sample ".to_string(),
            display_name_cn: Some(" 示例 ".to_string()),
            developer_name: " Dev ".to_string(),
            summary: " Summary ".to_string(),
            screenshots: vec![" screen.png ".to_string(), String::new()],
            version: " v1.2 ".to_string(),
            min_otools_version: " unknown ".to_string(),
            icon: " icon.png ".to_string(),
            entry: " dist/index.html ".to_string(),
            easy_mode: serde_json::json!(0),
            has_ad: serde_json::json!("yes"),
            in_plugin_purchase: serde_json::json!(1),
            official: serde_json::json!(true),
            rating: serde_json::json!("4.5"),
            rating_count: serde_json::json!("12"),
            categories: serde_json::json!("tools, Featured, "),
            package_url: " 'https://example.com/sample.oplg' ".to_string(),
            url: String::new(),
            reviews: serde_json::json!([{ "user": "A", "rating": 5, "content": "ok", "date": "today" }]),
            support_macos: Value::Null,
            support_windows: serde_json::json!(false),
            support_linux: serde_json::json!(true),
        };

        let catalog_item =
            remote_to_catalog_item(item, "featured").expect("remote item should convert");

        assert_eq!(catalog_item.uuid, "remote-id");
        assert_eq!(catalog_item.packid, "sample.plugin");
        assert_eq!(catalog_item.display_name, "Sample");
        assert_eq!(catalog_item.display_name_cn.as_deref(), Some("示例"));
        assert_eq!(catalog_item.screenshots, vec!["screen.png".to_string()]);
        assert_eq!(catalog_item.min_otools_version, "");
        assert!(catalog_item.has_ad);
        assert!(catalog_item.in_plugin_purchase);
        assert!(catalog_item.official);
        assert_eq!(catalog_item.rating, 4.5);
        assert_eq!(catalog_item.rating_count, 12);
        assert_eq!(
            catalog_item.categories,
            vec![
                "tools".to_string(),
                "featured".to_string(),
                "official".to_string()
            ]
        );
        assert_eq!(catalog_item.package_url, "https://example.com/sample.oplg");
        assert_eq!(catalog_item.reviews.len(), 1);
        assert!(catalog_item.support_macos);
        assert!(!catalog_item.support_windows);
        assert!(catalog_item.support_linux);
        assert!(catalog_item.installable);
    }

    #[test]
    fn apply_catalog_runtime_state_requires_package_url_or_easy_mode() {
        let mut items = vec![
            ParkCatalogItem {
                uuid: "missing-package".to_string(),
                packid: "missing-package".to_string(),
                version: "2".to_string(),
                min_otools_version: "1".to_string(),
                package_url: " \"null\" ".to_string(),
                ..ParkCatalogItem::default()
            },
            ParkCatalogItem {
                uuid: "easy-mode".to_string(),
                packid: "easy-mode".to_string(),
                easy_mode: 1,
                min_otools_version: "1".to_string(),
                ..ParkCatalogItem::default()
            },
            ParkCatalogItem {
                uuid: "installed-plugin".to_string(),
                packid: "installed-plugin".to_string(),
                version: "2.0.0".to_string(),
                min_otools_version: "1.0.0".to_string(),
                package_url: "https://example.com/plugin.oplg".to_string(),
                ..ParkCatalogItem::default()
            },
        ];
        let installed_plugins = build_installed_plugin_state_index([ParkInstalledPluginState {
            uuid: "installed-plugin".to_string(),
            packid: "installed-plugin".to_string(),
            version: "1.0.0".to_string(),
        }]);

        apply_catalog_runtime_state(&mut items, &installed_plugins, "2");

        assert_eq!(items[0].package_url, "");
        assert!(items[0].meets_min_otools_version);
        assert!(!items[0].installable);
        assert!(items[1].installable);
        assert!(items[2].installed);
        assert_eq!(items[2].installed_version, "1.0.0");
        assert!(items[2].update_available);
    }

    #[test]
    fn merge_remote_metadata_into_installed_item_preserves_installed_version() {
        let local = ParkCatalogItem {
            uuid: "sample".to_string(),
            packid: "sample".to_string(),
            display_name: "Local Name".to_string(),
            display_name_cn: Some("本地名称".to_string()),
            developer_name: "Local Developer".to_string(),
            summary: "Local summary".to_string(),
            version: "1.0.0".to_string(),
            installed_version: "1.0.0".to_string(),
            icon: "local.png".to_string(),
            entry: "dist/index.html".to_string(),
            categories: vec!["installed".to_string()],
            support_macos: true,
            support_windows: true,
            support_linux: true,
            installed: true,
            ..ParkCatalogItem::default()
        };
        let remote = ParkCatalogItem {
            uuid: "sample".to_string(),
            packid: "sample".to_string(),
            display_name: "Remote Name".to_string(),
            display_name_cn: Some("远程名称".to_string()),
            developer_name: "Remote Developer".to_string(),
            summary: "Remote summary".to_string(),
            screenshots: vec!["screen.png".to_string()],
            version: "2.0.0".to_string(),
            min_otools_version: "1.0.0".to_string(),
            icon: "remote.png".to_string(),
            entry: "remote/index.html".to_string(),
            categories: vec![
                "hot".to_string(),
                "installed".to_string(),
                "official".to_string(),
            ],
            package_url: " 'https://example.com/sample.oplg' ".to_string(),
            support_macos: true,
            support_windows: false,
            support_linux: true,
            installable: true,
            ..ParkCatalogItem::default()
        };

        let merged = merge_remote_metadata_into_installed_catalog_item(local, Some(&remote));

        assert!(merged.installed);
        assert_eq!(merged.installed_version, "1.0.0");
        assert_eq!(merged.version, "2.0.0");
        assert_eq!(merged.display_name, "Remote Name");
        assert_eq!(merged.display_name_cn.as_deref(), Some("远程名称"));
        assert_eq!(merged.icon, "remote.png");
        assert_eq!(merged.entry, "remote/index.html");
        assert_eq!(merged.package_url, "https://example.com/sample.oplg");
        assert_eq!(
            merged.categories,
            vec![
                "installed".to_string(),
                "hot".to_string(),
                "official".to_string()
            ]
        );
        assert!(merged.support_macos);
        assert!(!merged.support_windows);
        assert!(merged.support_linux);
    }
}

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::{default_data_dir, HostError, OtoolsPluginInfo};

const PLUGINS_FILE_VERSION: u64 = 1;
const DEV_DEBUG_SOURCE: &str = "dev-debug";

fn default_enabled_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolPluginAutostartTask {
    pub command: String,
    pub args: Option<Value>,
    pub ignore_error_includes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolPluginAutostart {
    pub enabled: Option<bool>,
    pub once: Option<bool>,
    pub tasks: Vec<ToolPluginAutostartTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolPluginShutdownHook {
    pub action_id: String,
    pub hook_id: Option<String>,
    pub description: Option<String>,
    pub order: Option<i32>,
    pub timeout_ms: Option<u64>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolPlugin {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(
        rename = "displayNameCN",
        alias = "displayNameZh",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_otools_version: Option<String>,
    pub icon: String,
    pub key: Vec<String>,
    pub entry: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_dev: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub open_in_browser: Option<bool>,
    pub autostart: Option<ToolPluginAutostart>,
    pub shutdown_hooks: Option<Vec<ToolPluginShutdownHook>>,
    #[serde(default, deserialize_with = "deserialize_plugin_permissions")]
    pub permissions: Vec<String>,
    #[serde(default = "default_enabled_true")]
    pub enabled: bool,
    pub builtin: Option<bool>,
}

impl Default for ToolPlugin {
    fn default() -> Self {
        Self {
            uuid: String::new(),
            packid: String::new(),
            display_name: String::new(),
            display_name_cn: None,
            developer_name: String::new(),
            summary: String::new(),
            screenshots: Vec::new(),
            version: String::new(),
            min_otools_version: None,
            icon: String::new(),
            key: Vec::new(),
            entry: String::new(),
            dev_url: None,
            quick_dev: None,
            source: None,
            open_in_browser: None,
            autostart: None,
            shutdown_hooks: None,
            permissions: Vec::new(),
            enabled: true,
            builtin: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolPluginsFile {
    pub version: u64,
    pub plugins: Vec<ToolPlugin>,
}

pub fn otools_root_dir() -> PathBuf {
    default_data_dir().join("otools")
}

pub fn installed_plugins_dir() -> PathBuf {
    otools_root_dir().join("plugins")
}

pub fn external_plugin_dirs() -> Vec<PathBuf> {
    std::env::var_os("CODEG_OTOOLS_PLUGIN_DIR")
        .map(|value| {
            std::env::split_paths(&value)
                .filter(|path| !path.as_os_str().is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn plugins_file_path() -> PathBuf {
    otools_root_dir().join("plugins.json")
}

pub fn state_dir() -> PathBuf {
    otools_root_dir().join("state")
}

pub fn plugin_sync_state_path(plugin: &str) -> PathBuf {
    state_dir().join("sync").join(plugin).join("state.json")
}

pub fn dev_local_root_dir() -> PathBuf {
    otools_root_dir().join("dev")
}

pub fn park_root_dir() -> PathBuf {
    otools_root_dir().join("park")
}

pub fn ensure_dir_exists(path: &Path) -> Result<(), HostError> {
    if path.exists() {
        return Ok(());
    }
    fs::create_dir_all(path).map_err(HostError::io)
}

pub fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, HostError> {
    let bytes = fs::read(path).map_err(HostError::io)?;
    serde_json::from_slice(&bytes).map_err(|error| {
        HostError::configuration_invalid("Invalid OTools JSON file")
            .with_detail(format!("{}: {error}", path.display()))
    })
}

pub fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), HostError> {
    if let Some(parent) = path.parent() {
        ensure_dir_exists(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| {
        HostError::invalid_input("Invalid OTools JSON value").with_detail(error.to_string())
    })?;
    fs::write(path, bytes).map_err(HostError::io)
}

pub fn ensure_plugins_file(path: &Path) -> Result<(), HostError> {
    if path.exists() {
        return Ok(());
    }
    write_json_file(
        path,
        &ToolPluginsFile {
            version: PLUGINS_FILE_VERSION,
            plugins: Vec::new(),
        },
    )
}

pub fn read_plugins_file(path: &Path) -> Result<Vec<ToolPlugin>, HostError> {
    ensure_plugins_file(path)?;
    let value = read_json_file::<Value>(path)?;
    match value {
        Value::Object(_) => serde_json::from_value::<ToolPluginsFile>(value)
            .map(|file| file.plugins)
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools plugins file")
                    .with_detail(format!("{}: {error}", path.display()))
            }),
        Value::Array(array) => Ok(array
            .into_iter()
            .filter_map(|item| serde_json::from_value::<ToolPlugin>(item).ok())
            .collect()),
        _ => Ok(Vec::new()),
    }
}

pub fn write_plugins_file(path: &Path, plugins: &[ToolPlugin]) -> Result<(), HostError> {
    write_json_file(
        path,
        &ToolPluginsFile {
            version: PLUGINS_FILE_VERSION,
            plugins: plugins.to_vec(),
        },
    )
}

pub fn inner_plugins() -> Vec<ToolPlugin> {
    let mut plugins = Vec::<(i64, ToolPlugin)>::new();
    for root in builtin_plugin_roots() {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = path.join("plugin.json");
            let Ok(value) = read_json_file::<Value>(&manifest_path) else {
                continue;
            };
            let order = value
                .get("builtinOrder")
                .and_then(Value::as_i64)
                .unwrap_or(i64::MAX);
            let Ok(mut plugin) = serde_json::from_value::<ToolPlugin>(value) else {
                continue;
            };
            plugin.builtin = Some(true);
            plugin.source = Some("builtin".to_string());
            if plugin.uuid.trim().is_empty() {
                plugin.uuid = plugin.packid.clone();
            }
            plugins.push((order, plugin));
        }
    }
    plugins.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.packid.cmp(&right.1.packid))
    });
    plugins.into_iter().map(|(_, plugin)| plugin).collect()
}

fn builtin_plugin_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(value) = std::env::var("CODEG_OTOOLS_BUILTIN_PLUGIN_DIR") {
        roots.push(PathBuf::from(value));
    }
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("plugins"),
    );
    roots
}

pub fn is_dev_debug_plugin(plugin: &ToolPlugin) -> bool {
    plugin.source.as_deref().unwrap_or_default() == DEV_DEBUG_SOURCE
        || plugin.quick_dev.unwrap_or(false)
}

pub fn dev_debug_source() -> &'static str {
    DEV_DEBUG_SOURCE
}

pub fn normalize_plugin_source(value: Option<String>, builtin: bool, quick_dev: bool) -> String {
    if let Some(source) = value
        .map(|item| item.trim().to_ascii_lowercase())
        .filter(|item| !item.is_empty())
    {
        return source;
    }
    if builtin {
        return "builtin".to_string();
    }
    if quick_dev {
        return DEV_DEBUG_SOURCE.to_string();
    }
    "market".to_string()
}

fn normalize_string_vec(input: Vec<String>) -> Vec<String> {
    input
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn normalize_plugin_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn resolve_plugin_source(plugin: &ToolPlugin) -> String {
    normalize_plugin_source(
        plugin.source.clone(),
        plugin.builtin.unwrap_or(false),
        plugin.quick_dev.unwrap_or(false),
    )
}

fn normalize_plugin_instance_id(plugin: &ToolPlugin) -> String {
    let source = resolve_plugin_source(plugin);
    let id = normalize_plugin_id(if plugin.uuid.trim().is_empty() {
        plugin.packid.as_str()
    } else {
        plugin.uuid.as_str()
    });
    format!("{source}:{id}")
}

pub fn normalize_plugin(mut plugin: ToolPlugin) -> Option<ToolPlugin> {
    let packid = plugin.packid.trim();
    if packid.is_empty() {
        return None;
    }
    plugin.uuid = {
        let value = plugin.uuid.trim();
        if value.is_empty() {
            packid.to_string()
        } else {
            value.to_string()
        }
    };
    plugin.packid = packid.to_string();
    plugin.display_name = plugin.display_name.trim().to_string();
    plugin.display_name_cn = normalize_optional_string(plugin.display_name_cn);
    if plugin.display_name.is_empty() && plugin.display_name_cn.is_none() {
        plugin.display_name = plugin.packid.clone();
    }
    if plugin.display_name.is_empty() {
        plugin.display_name = plugin.display_name_cn.clone().unwrap_or_default();
    }
    plugin.developer_name = plugin.developer_name.trim().to_string();
    plugin.summary = plugin.summary.trim().to_string();
    plugin.screenshots = normalize_string_vec(plugin.screenshots);
    plugin.version = plugin.version.trim().to_string();
    if plugin.version.is_empty() {
        plugin.version = if plugin.builtin.unwrap_or(false) {
            "builtin".to_string()
        } else {
            "-".to_string()
        };
    }
    plugin.icon = plugin.icon.trim().to_string();
    if plugin.icon.is_empty() {
        plugin.icon = "🧩".to_string();
    }
    plugin.key = normalize_string_vec(plugin.key);
    if plugin.key.is_empty() {
        plugin.key.push(plugin.packid.clone());
    }
    plugin.entry = plugin.entry.trim().to_string();
    plugin.dev_url = normalize_optional_string(plugin.dev_url);
    plugin.quick_dev = plugin.quick_dev.filter(|value| *value);
    plugin.source = Some(resolve_plugin_source(&plugin));
    plugin.open_in_browser = plugin.open_in_browser.or(Some(false));
    plugin.permissions = normalize_string_vec(plugin.permissions);
    Some(plugin)
}

pub fn normalize_plugins(plugins: Vec<ToolPlugin>) -> Vec<ToolPlugin> {
    plugins.into_iter().filter_map(normalize_plugin).collect()
}

pub fn merge_inner_and_external_plugins(
    inner_plugins: Vec<ToolPlugin>,
    external_plugins: Vec<ToolPlugin>,
) -> Vec<ToolPlugin> {
    let normalized_inner = normalize_plugins(inner_plugins);
    let normalized_external = normalize_plugins(external_plugins);
    let mut merged_map = HashMap::<String, ToolPlugin>::new();
    let mut order = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();

    for plugin in normalized_inner.into_iter().chain(normalized_external) {
        let id = normalize_plugin_instance_id(&plugin);
        merged_map.insert(id.clone(), plugin);
        if seen.insert(id.clone()) {
            order.push(id);
        }
    }

    order
        .into_iter()
        .filter_map(|id| merged_map.remove(&id))
        .filter(|plugin| plugin.enabled)
        .collect()
}

pub fn load_merged_plugins() -> Result<Vec<ToolPlugin>, HostError> {
    let external = read_plugins_file(&plugins_file_path())?;
    Ok(merge_inner_and_external_plugins(inner_plugins(), external))
}

pub fn upsert_external_plugin(plugin: ToolPlugin) -> Result<Vec<ToolPlugin>, HostError> {
    let path = plugins_file_path();
    let mut plugins = read_plugins_file(&path)?;
    let normalized = normalize_plugin(plugin)
        .ok_or_else(|| HostError::invalid_input("Invalid OTools plugin metadata"))?;
    let source = resolve_plugin_source(&normalized);
    let target_id = normalize_plugin_id(if normalized.uuid.trim().is_empty() {
        normalized.packid.as_str()
    } else {
        normalized.uuid.as_str()
    });

    if let Some(existing) = plugins.iter_mut().find(|item| {
        let item_source = resolve_plugin_source(item);
        let item_id = normalize_plugin_id(if item.uuid.trim().is_empty() {
            item.packid.as_str()
        } else {
            item.uuid.as_str()
        });
        item_source == source && item_id == target_id
    }) {
        *existing = normalized;
    } else {
        plugins.push(normalized);
    }
    write_plugins_file(&path, &plugins)?;
    Ok(plugins)
}

pub fn remove_external_plugin_by_uuid(
    uuid: &str,
    debug_only: bool,
) -> Result<Vec<ToolPlugin>, HostError> {
    let path = plugins_file_path();
    let target_id = normalize_plugin_id(uuid);
    if target_id.is_empty() {
        return read_plugins_file(&path);
    }
    let mut plugins = read_plugins_file(&path)?;
    plugins.retain(|plugin| {
        if debug_only && !is_dev_debug_plugin(plugin) {
            return true;
        }
        let id = normalize_plugin_id(if plugin.uuid.trim().is_empty() {
            plugin.packid.as_str()
        } else {
            plugin.uuid.as_str()
        });
        id != target_id
    });
    write_plugins_file(&path, &plugins)?;
    Ok(plugins)
}

pub fn is_debug_registered(uuid: &str) -> Result<bool, HostError> {
    let target_id = normalize_plugin_id(uuid);
    if target_id.is_empty() {
        return Ok(false);
    }
    Ok(read_plugins_file(&plugins_file_path())?
        .into_iter()
        .filter(is_dev_debug_plugin)
        .any(|plugin| {
            let id = normalize_plugin_id(if plugin.uuid.trim().is_empty() {
                plugin.packid.as_str()
            } else {
                plugin.uuid.as_str()
            });
            id == target_id
        }))
}

pub fn tool_plugin_to_info(plugin: ToolPlugin) -> OtoolsPluginInfo {
    let plugin = normalize_plugin(plugin).unwrap_or_default();
    let source = resolve_plugin_source(&plugin);
    let asset_base_url = if is_external_entry(&plugin.entry) {
        String::new()
    } else {
        format!("/otools-assets/{}", plugin.uuid)
    };
    OtoolsPluginInfo {
        uuid: plugin.uuid,
        packid: plugin.packid,
        display_name: plugin.display_name,
        display_name_cn: plugin.display_name_cn,
        developer_name: if plugin.developer_name.trim().is_empty() {
            None
        } else {
            Some(plugin.developer_name)
        },
        summary: if plugin.summary.trim().is_empty() {
            None
        } else {
            Some(plugin.summary)
        },
        version: if plugin.version.trim().is_empty() {
            None
        } else {
            Some(plugin.version)
        },
        icon: if plugin.icon.trim().is_empty() {
            None
        } else {
            Some(plugin.icon)
        },
        entry: plugin.entry,
        open_in_browser: plugin.open_in_browser.unwrap_or(false),
        native_enabled: false,
        permissions: plugin.permissions,
        source,
        asset_base_url,
    }
}

pub fn deserialize_plugin_permissions<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    Ok(parse_plugin_permissions_value(value))
}

fn parse_plugin_permissions_value(value: Option<Value>) -> Vec<String> {
    let mut permissions = Vec::new();
    let mut push_permission = |raw: &str| {
        if let Some(normalized) = normalize_plugin_permission(raw) {
            if !permissions.contains(&normalized) {
                permissions.push(normalized);
            }
        }
    };

    match value {
        Some(Value::Array(items)) => {
            for item in items {
                if let Some(raw) = item.as_str() {
                    push_permission(raw);
                }
            }
        }
        Some(Value::Object(map)) => {
            for (key, value) in map {
                if is_truthy_permission_value(&value) {
                    push_permission(&key);
                }
            }
        }
        _ => {}
    }

    permissions
}

fn normalize_plugin_permission(raw: &str) -> Option<String> {
    let normalized = raw.trim().to_ascii_lowercase().replace(['-', ' '], "_");
    match normalized.as_str() {
        "fs" => Some("fs".to_string()),
        "dialog" => Some("dialog".to_string()),
        "shell" => Some("shell".to_string()),
        "child_process" | "childprocess" => Some("child_process".to_string()),
        _ => None,
    }
}

fn is_truthy_permission_value(value: &Value) -> bool {
    match value {
        Value::Bool(flag) => *flag,
        Value::Number(number) => number
            .as_i64()
            .map(|value| value != 0)
            .or_else(|| number.as_u64().map(|value| value != 0))
            .or_else(|| number.as_f64().map(|value| value != 0.0))
            .unwrap_or(false),
        Value::String(text) => {
            matches!(
                text.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        }
        _ => false,
    }
}

pub fn is_external_entry(entry: &str) -> bool {
    let lower = entry.trim().to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("file://")
        || lower.starts_with("data:")
        || lower.starts_with("builtin://")
}

pub fn resolve_plugin_manifest_path(root: &Path) -> Option<PathBuf> {
    let direct = root.join("plugin.json");
    if direct.is_file() {
        return Some(direct);
    }
    let adapter = root.join("otools").join("plugin.json");
    if adapter.is_file() {
        return Some(adapter);
    }
    None
}

pub fn resolve_plugin_adapter_root(root: &Path) -> Option<PathBuf> {
    resolve_plugin_manifest_path(root).and_then(|manifest| manifest.parent().map(Path::to_path_buf))
}

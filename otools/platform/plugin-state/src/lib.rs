use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use otools_core::catalog;
use otools_core::{validate_plugin_id, HostError};
use serde_json::{Map, Value};

const OTOOLS_LOCAL_DATA_DIR: &str = "local";
const OTOOLS_SYNC_DATA_DIR: &str = "data";
const DEFAULT_PLUGIN_STATE_FILE: &str = "state.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PluginStateStore {
    Local,
    Sync,
}

impl PluginStateStore {
    fn root_dir(self) -> PathBuf {
        match self {
            Self::Local => catalog::otools_root_dir().join(OTOOLS_LOCAL_DATA_DIR),
            Self::Sync => catalog::otools_root_dir().join(OTOOLS_SYNC_DATA_DIR),
        }
    }

    fn legacy_name(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Sync => "sync",
        }
    }
}

pub fn otools_plugin_state_get(
    plugin_uuid: String,
    state_kind: Option<String>,
) -> Result<Value, HostError> {
    let plugin_uuid = validate_plugin_id(&plugin_uuid)?;
    let store = parse_state_store(state_kind.as_deref())?;
    Ok(read_plugin_state(&plugin_uuid, store, None)?.unwrap_or(Value::Null))
}

pub fn otools_plugin_state_set(
    plugin_uuid: String,
    state_kind: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    let plugin_uuid = validate_plugin_id(&plugin_uuid)?;
    let store = parse_state_store(state_kind.as_deref())?;
    save_plugin_state(&plugin_uuid, store, None, state)
}

pub fn get_otools_plugin_localstate(plugin: String) -> Result<Option<Value>, HostError> {
    read_plugin_state(&plugin, PluginStateStore::Local, None)
}

pub fn save_otools_plugin_localstate(plugin: String, state: Value) -> Result<(), HostError> {
    save_plugin_state(&plugin, PluginStateStore::Local, None, state)
}

pub fn get_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, HostError> {
    read_plugin_state(&plugin, PluginStateStore::Local, scheme.as_deref())
}

pub fn save_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    save_plugin_state(&plugin, PluginStateStore::Local, scheme.as_deref(), state)
}

pub fn get_otools_plugin_syncstate(plugin: String) -> Result<Option<Value>, HostError> {
    read_plugin_state(&plugin, PluginStateStore::Sync, None)
}

pub fn save_otools_plugin_syncstate(plugin: String, state: Value) -> Result<(), HostError> {
    save_plugin_state(&plugin, PluginStateStore::Sync, None, state)
}

pub fn get_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, HostError> {
    read_plugin_state(&plugin, PluginStateStore::Sync, scheme.as_deref())
}

pub fn save_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), HostError> {
    save_plugin_state(&plugin, PluginStateStore::Sync, scheme.as_deref(), state)
}

pub fn get_otools_plugin_localstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, HostError> {
    read_plugin_state_value(&plugin, PluginStateStore::Local, None, &key)
}

pub fn save_otools_plugin_localstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), HostError> {
    save_plugin_state_value(&plugin, PluginStateStore::Local, None, &key, value)
}

pub fn patch_otools_plugin_localstate(plugin: String, patch: Value) -> Result<(), HostError> {
    patch_plugin_state(&plugin, PluginStateStore::Local, None, patch)
}

pub fn get_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, HostError> {
    read_plugin_state_value(&plugin, PluginStateStore::Local, scheme.as_deref(), &key)
}

pub fn save_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), HostError> {
    save_plugin_state_value(
        &plugin,
        PluginStateStore::Local,
        scheme.as_deref(),
        &key,
        value,
    )
}

pub fn patch_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), HostError> {
    patch_plugin_state(&plugin, PluginStateStore::Local, scheme.as_deref(), patch)
}

pub fn get_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, HostError> {
    read_plugin_state_value(&plugin, PluginStateStore::Sync, None, &key)
}

pub fn save_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), HostError> {
    save_plugin_state_value(&plugin, PluginStateStore::Sync, None, &key, value)
}

pub fn patch_otools_plugin_syncstate(plugin: String, patch: Value) -> Result<(), HostError> {
    patch_plugin_state(&plugin, PluginStateStore::Sync, None, patch)
}

pub fn get_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, HostError> {
    read_plugin_state_value(&plugin, PluginStateStore::Sync, scheme.as_deref(), &key)
}

pub fn save_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), HostError> {
    save_plugin_state_value(
        &plugin,
        PluginStateStore::Sync,
        scheme.as_deref(),
        &key,
        value,
    )
}

pub fn patch_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), HostError> {
    patch_plugin_state(&plugin, PluginStateStore::Sync, scheme.as_deref(), patch)
}

fn parse_state_store(value: Option<&str>) -> Result<PluginStateStore, HostError> {
    match value.unwrap_or("local").trim() {
        "" | "local" => Ok(PluginStateStore::Local),
        "sync" => Ok(PluginStateStore::Sync),
        _ => Err(HostError::invalid_input("Invalid OTools state kind")),
    }
}

fn normalize_plugin_name(plugin: &str) -> String {
    let normalized = plugin
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    if normalized.is_empty() {
        "unknown".to_string()
    } else {
        normalized
    }
}

fn normalize_state_scheme(scheme: &str) -> Option<String> {
    let trimmed = scheme.trim();
    if trimmed.is_empty() {
        return None;
    }
    let stem = trimmed.strip_suffix(".json").unwrap_or(trimmed);
    let normalized = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn plugin_state_file_name(scheme: Option<&str>) -> String {
    match scheme.and_then(normalize_state_scheme) {
        Some(name) => format!("{name}.json"),
        None => DEFAULT_PLUGIN_STATE_FILE.to_string(),
    }
}

fn plugin_state_path(plugin: &str, store: PluginStateStore, scheme: Option<&str>) -> PathBuf {
    store
        .root_dir()
        .join(normalize_plugin_name(plugin))
        .join(plugin_state_file_name(scheme))
}

fn legacy_plugin_state_paths(plugin: &str, store: PluginStateStore) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    paths.push(
        catalog::state_dir()
            .join(store.legacy_name())
            .join(plugin.trim())
            .join(DEFAULT_PLUGIN_STATE_FILE),
    );

    let normalized = normalize_plugin_name(plugin);
    if normalized != plugin.trim() {
        paths.push(
            catalog::state_dir()
                .join(store.legacy_name())
                .join(normalized)
                .join(DEFAULT_PLUGIN_STATE_FILE),
        );
    }

    paths
}

fn state_candidate_paths(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
) -> Vec<PathBuf> {
    let mut paths = vec![plugin_state_path(plugin, store, scheme)];
    if scheme.and_then(normalize_state_scheme).is_none() {
        paths.extend(legacy_plugin_state_paths(plugin, store));
    }
    paths
}

fn normalize_state_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_plugin_state(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
) -> Result<Option<Value>, HostError> {
    for path in state_candidate_paths(plugin, store, scheme) {
        if path.exists() {
            return read_state_json_with_repair(&path).map(Some);
        }
    }
    Ok(None)
}

fn save_plugin_state(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
    state: Value,
) -> Result<(), HostError> {
    catalog::write_json_file(&plugin_state_path(plugin, store, scheme), &state)
}

fn read_plugin_state_map(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
) -> Result<Map<String, Value>, HostError> {
    match read_plugin_state(plugin, store, scheme)? {
        Some(Value::Object(map)) => Ok(map),
        Some(_) | None => Ok(Map::new()),
    }
}

fn save_plugin_state_map(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
    map: Map<String, Value>,
) -> Result<(), HostError> {
    save_plugin_state(plugin, store, scheme, Value::Object(map))
}

fn read_plugin_state_value(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
    key: &str,
) -> Result<Option<Value>, HostError> {
    let key = normalize_state_key(key)
        .ok_or_else(|| HostError::invalid_input("State key is required"))?;
    let state = read_plugin_state_map(plugin, store, scheme)?;
    Ok(state.get(&key).cloned())
}

fn save_plugin_state_value(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
    key: &str,
    value: Value,
) -> Result<(), HostError> {
    let key = normalize_state_key(key)
        .ok_or_else(|| HostError::invalid_input("State key is required"))?;
    let mut state = read_plugin_state_map(plugin, store, scheme)?;
    state.insert(key, value);
    save_plugin_state_map(plugin, store, scheme, state)
}

fn patch_plugin_state(
    plugin: &str,
    store: PluginStateStore,
    scheme: Option<&str>,
    patch: Value,
) -> Result<(), HostError> {
    let Value::Object(patch) = patch else {
        return Err(HostError::invalid_input("State patch must be an object"));
    };
    let mut state = read_plugin_state_map(plugin, store, scheme)?;
    for (key, value) in patch {
        if let Some(key) = normalize_state_key(&key) {
            state.insert(key, value);
        }
    }
    save_plugin_state_map(plugin, store, scheme, state)
}

fn read_state_json_with_repair(path: &Path) -> Result<Value, HostError> {
    let content = fs::read_to_string(path).map_err(HostError::io)?;

    match serde_json::from_str::<Value>(&content) {
        Ok(value) => Ok(value),
        Err(original_error) => {
            let mut stream = serde_json::Deserializer::from_str(&content).into_iter::<Value>();
            let value = stream
                .next()
                .transpose()
                .map_err(|_| {
                    HostError::configuration_invalid("Invalid OTools plugin state")
                        .with_detail(format!("{}: {original_error}", path.display()))
                })?
                .ok_or_else(|| {
                    HostError::configuration_invalid("Invalid OTools plugin state")
                        .with_detail(format!("{}: {original_error}", path.display()))
                })?;
            let trailing = content[stream.byte_offset()..].trim();
            if trailing.is_empty() {
                return Ok(value);
            }

            let backup_path = backup_corrupted_state_file(path, &content)?;
            catalog::write_json_file(path, &value)?;
            eprintln!(
                "[otools-plugin-state] repaired malformed json file={} backup={}",
                path.display(),
                backup_path.display()
            );
            Ok(value)
        }
    }
}

fn backup_corrupted_state_file(path: &Path, content: &str) -> Result<PathBuf, HostError> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(DEFAULT_PLUGIN_STATE_FILE);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let backup_path = path.with_file_name(format!("{file_name}.corrupt-{timestamp}.bak"));
    fs::write(&backup_path, content).map_err(HostError::io)?;
    Ok(backup_path)
}

use std::path::PathBuf;

use otools_core::HostError;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{Map, Value};

const OTOOLS_SYNC_DATA_DIR: &str = "data";
const DEFAULT_PLUGIN_STATE_FILE: &str = "state.json";

fn host_error_to_string(error: HostError) -> String {
    match error.detail {
        Some(detail) if !detail.trim().is_empty() && detail != error.message => {
            format!("{}: {detail}", error.message)
        }
        _ => error.message,
    }
}

fn value_from_state<T: DeserializeOwned>(value: Option<Value>) -> Result<Option<T>, String> {
    value
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("解析插件状态失败: {error}"))
}

fn state_to_value<T: Serialize>(state: &T) -> Result<Value, String> {
    serde_json::to_value(state).map_err(|error| format!("序列化插件状态失败: {error}"))
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

fn normalize_state_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn sync_state_root_dir() -> PathBuf {
    ot_storage::otools_root_dir().join(OTOOLS_SYNC_DATA_DIR)
}

pub fn plugin_state_path(plugin: &str) -> PathBuf {
    plugin_state_path_with_scheme(plugin, None)
}

pub fn plugin_state_path_with_scheme(plugin: &str, scheme: Option<&str>) -> PathBuf {
    ot_storage::otools_local_dir()
        .join(normalize_plugin_name(plugin))
        .join(plugin_state_file_name(scheme))
}

pub fn plugin_syncstate_path(plugin: &str) -> PathBuf {
    plugin_syncstate_path_with_scheme(plugin, None)
}

pub fn plugin_syncstate_path_with_scheme(plugin: &str, scheme: Option<&str>) -> PathBuf {
    sync_state_root_dir()
        .join(normalize_plugin_name(plugin))
        .join(plugin_state_file_name(scheme))
}

pub fn read_plugin_state<T: DeserializeOwned>(plugin: &str) -> Result<Option<T>, String> {
    read_plugin_state_with_scheme(plugin, None)
}

pub fn read_plugin_state_with_scheme<T: DeserializeOwned>(
    plugin: &str,
    scheme: Option<&str>,
) -> Result<Option<T>, String> {
    let value = otools_plugin_state::get_otools_plugin_localstate_with_scheme(
        plugin.to_string(),
        scheme.map(str::to_string),
    )
    .map_err(host_error_to_string)?;
    value_from_state(value)
}

pub fn save_plugin_localstate<T: Serialize>(plugin: &str, state: &T) -> Result<(), String> {
    save_plugin_localstate_with_scheme(plugin, None, state)
}

pub fn save_plugin_localstate_with_scheme<T: Serialize>(
    plugin: &str,
    scheme: Option<&str>,
    state: &T,
) -> Result<(), String> {
    otools_plugin_state::save_otools_plugin_localstate_with_scheme(
        plugin.to_string(),
        scheme.map(str::to_string),
        state_to_value(state)?,
    )
    .map_err(host_error_to_string)
}

pub fn save_plugin_syncstate<T: Serialize>(plugin: &str, state: &T) -> Result<(), String> {
    save_plugin_syncstate_with_scheme(plugin, None, state)
}

pub fn save_plugin_syncstate_with_scheme<T: Serialize>(
    plugin: &str,
    scheme: Option<&str>,
    state: &T,
) -> Result<(), String> {
    otools_plugin_state::save_otools_plugin_syncstate_with_scheme(
        plugin.to_string(),
        scheme.map(str::to_string),
        state_to_value(state)?,
    )
    .map_err(host_error_to_string)
}

pub fn read_plugin_syncstate<T: DeserializeOwned>(plugin: &str) -> Result<Option<T>, String> {
    read_plugin_syncstate_with_scheme(plugin, None)
}

pub fn read_plugin_syncstate_with_scheme<T: DeserializeOwned>(
    plugin: &str,
    scheme: Option<&str>,
) -> Result<Option<T>, String> {
    let value = otools_plugin_state::get_otools_plugin_syncstate_with_scheme(
        plugin.to_string(),
        scheme.map(str::to_string),
    )
    .map_err(host_error_to_string)?;
    value_from_state(value)
}

fn load_plugin_state_map_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
) -> Result<Map<String, Value>, String> {
    match read_plugin_state_with_scheme::<Value>(plugin, scheme)? {
        Some(Value::Object(map)) => Ok(map),
        Some(_) | None => Ok(Map::new()),
    }
}

fn load_plugin_syncstate_map_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
) -> Result<Map<String, Value>, String> {
    match read_plugin_syncstate_with_scheme::<Value>(plugin, scheme)? {
        Some(Value::Object(map)) => Ok(map),
        Some(_) | None => Ok(Map::new()),
    }
}

fn save_plugin_state_map_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
    map: Map<String, Value>,
) -> Result<(), String> {
    save_plugin_localstate_with_scheme(plugin, scheme, &Value::Object(map))
}

fn save_plugin_syncstate_map_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
    map: Map<String, Value>,
) -> Result<(), String> {
    save_plugin_syncstate_with_scheme(plugin, scheme, &Value::Object(map))
}

pub fn read_plugin_state_value<T: DeserializeOwned>(
    plugin: &str,
    key: &str,
) -> Result<Option<T>, String> {
    read_plugin_state_value_with_scheme(plugin, None, key)
}

pub fn read_plugin_syncstate_value<T: DeserializeOwned>(
    plugin: &str,
    key: &str,
) -> Result<Option<T>, String> {
    read_plugin_syncstate_value_with_scheme(plugin, None, key)
}

pub fn read_plugin_state_value_with_scheme<T: DeserializeOwned>(
    plugin: &str,
    scheme: Option<&str>,
    key: &str,
) -> Result<Option<T>, String> {
    let state_key = normalize_state_key(key).ok_or_else(|| "插件状态 key 不能为空".to_string())?;
    let state = load_plugin_state_map_with_scheme(plugin, scheme)?;
    value_from_state(state.get(&state_key).cloned())
}

pub fn read_plugin_syncstate_value_with_scheme<T: DeserializeOwned>(
    plugin: &str,
    scheme: Option<&str>,
    key: &str,
) -> Result<Option<T>, String> {
    let state_key = normalize_state_key(key).ok_or_else(|| "插件状态 key 不能为空".to_string())?;
    let state = load_plugin_syncstate_map_with_scheme(plugin, scheme)?;
    value_from_state(state.get(&state_key).cloned())
}

pub fn save_plugin_state_value<T: Serialize>(
    plugin: &str,
    key: &str,
    value: &T,
) -> Result<(), String> {
    save_plugin_state_value_with_scheme(plugin, None, key, value)
}

pub fn save_plugin_syncstate_value<T: Serialize>(
    plugin: &str,
    key: &str,
    value: &T,
) -> Result<(), String> {
    save_plugin_syncstate_value_with_scheme(plugin, None, key, value)
}

pub fn save_plugin_state_value_with_scheme<T: Serialize>(
    plugin: &str,
    scheme: Option<&str>,
    key: &str,
    value: &T,
) -> Result<(), String> {
    let state_key = normalize_state_key(key).ok_or_else(|| "插件状态 key 不能为空".to_string())?;
    let mut state = load_plugin_state_map_with_scheme(plugin, scheme)?;
    state.insert(state_key, state_to_value(value)?);
    save_plugin_state_map_with_scheme(plugin, scheme, state)
}

pub fn save_plugin_syncstate_value_with_scheme<T: Serialize>(
    plugin: &str,
    scheme: Option<&str>,
    key: &str,
    value: &T,
) -> Result<(), String> {
    let state_key = normalize_state_key(key).ok_or_else(|| "插件状态 key 不能为空".to_string())?;
    let mut state = load_plugin_syncstate_map_with_scheme(plugin, scheme)?;
    state.insert(state_key, state_to_value(value)?);
    save_plugin_syncstate_map_with_scheme(plugin, scheme, state)
}

pub fn merge_plugin_state(plugin: &str, patch: Map<String, Value>) -> Result<(), String> {
    merge_plugin_state_with_scheme(plugin, None, patch)
}

pub fn merge_plugin_syncstate(plugin: &str, patch: Map<String, Value>) -> Result<(), String> {
    merge_plugin_syncstate_with_scheme(plugin, None, patch)
}

pub fn merge_plugin_state_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
    patch: Map<String, Value>,
) -> Result<(), String> {
    let mut state = load_plugin_state_map_with_scheme(plugin, scheme)?;
    for (key, value) in patch {
        if normalize_state_key(&key).is_some() {
            state.insert(key, value);
        }
    }
    save_plugin_state_map_with_scheme(plugin, scheme, state)
}

pub fn merge_plugin_syncstate_with_scheme(
    plugin: &str,
    scheme: Option<&str>,
    patch: Map<String, Value>,
) -> Result<(), String> {
    let mut state = load_plugin_syncstate_map_with_scheme(plugin, scheme)?;
    for (key, value) in patch {
        if normalize_state_key(&key).is_some() {
            state.insert(key, value);
        }
    }
    save_plugin_syncstate_map_with_scheme(plugin, scheme, state)
}

pub fn get_otools_plugin_localstate(plugin: String) -> Result<Option<Value>, String> {
    read_plugin_state::<Value>(&plugin)
}

pub fn save_otools_plugin_localstate(plugin: String, state: Value) -> Result<(), String> {
    save_plugin_localstate(&plugin, &state)
}

pub fn get_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, String> {
    read_plugin_state_with_scheme::<Value>(&plugin, scheme.as_deref())
}

pub fn save_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), String> {
    save_plugin_localstate_with_scheme(&plugin, scheme.as_deref(), &state)
}

pub fn get_otools_plugin_syncstate(plugin: String) -> Result<Option<Value>, String> {
    read_plugin_syncstate::<Value>(&plugin)
}

pub fn save_otools_plugin_syncstate(plugin: String, state: Value) -> Result<(), String> {
    save_plugin_syncstate(&plugin, &state)
}

pub fn get_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
) -> Result<Option<Value>, String> {
    read_plugin_syncstate_with_scheme::<Value>(&plugin, scheme.as_deref())
}

pub fn save_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    state: Value,
) -> Result<(), String> {
    save_plugin_syncstate_with_scheme(&plugin, scheme.as_deref(), &state)
}

pub fn get_otools_plugin_localstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, String> {
    read_plugin_state_value::<Value>(&plugin, &key)
}

pub fn save_otools_plugin_localstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    save_plugin_state_value(&plugin, &key, &value)
}

pub fn patch_otools_plugin_localstate(plugin: String, patch: Value) -> Result<(), String> {
    let Value::Object(patch_map) = patch else {
        return Err("patch 必须是对象".to_string());
    };
    merge_plugin_state(&plugin, patch_map)
}

pub fn get_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, String> {
    read_plugin_state_value_with_scheme::<Value>(&plugin, scheme.as_deref(), &key)
}

pub fn save_otools_plugin_localstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), String> {
    save_plugin_state_value_with_scheme(&plugin, scheme.as_deref(), &key, &value)
}

pub fn patch_otools_plugin_localstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), String> {
    let Value::Object(patch_map) = patch else {
        return Err("patch 必须是对象".to_string());
    };
    merge_plugin_state_with_scheme(&plugin, scheme.as_deref(), patch_map)
}

pub fn get_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
) -> Result<Option<Value>, String> {
    read_plugin_syncstate_value::<Value>(&plugin, &key)
}

pub fn save_otools_plugin_syncstate_value(
    plugin: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    save_plugin_syncstate_value(&plugin, &key, &value)
}

pub fn patch_otools_plugin_syncstate(plugin: String, patch: Value) -> Result<(), String> {
    let Value::Object(patch_map) = patch else {
        return Err("patch 必须是对象".to_string());
    };
    merge_plugin_syncstate(&plugin, patch_map)
}

pub fn get_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
) -> Result<Option<Value>, String> {
    read_plugin_syncstate_value_with_scheme::<Value>(&plugin, scheme.as_deref(), &key)
}

pub fn save_otools_plugin_syncstate_value_with_scheme(
    plugin: String,
    scheme: Option<String>,
    key: String,
    value: Value,
) -> Result<(), String> {
    save_plugin_syncstate_value_with_scheme(&plugin, scheme.as_deref(), &key, &value)
}

pub fn patch_otools_plugin_syncstate_with_scheme(
    plugin: String,
    scheme: Option<String>,
    patch: Value,
) -> Result<(), String> {
    let Value::Object(patch_map) = patch else {
        return Err("patch 必须是对象".to_string());
    };
    merge_plugin_syncstate_with_scheme(&plugin, scheme.as_deref(), patch_map)
}

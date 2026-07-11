use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::PathBuf;

const OTOOLS_CONFIG_FILE: &str = "config.json";

pub fn otools_config_path() -> PathBuf {
    ot_storage::otools_root_dir().join(OTOOLS_CONFIG_FILE)
}

fn normalize_config_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn read_otools_config_map() -> Result<Map<String, Value>, String> {
    let path = otools_config_path();
    if !path.exists() {
        return Ok(Map::new());
    }

    let value = ot_storage::read_json_file::<Value>(&path)?;
    match value {
        Value::Object(map) => Ok(map),
        _ => Ok(Map::new()),
    }
}

pub fn write_otools_config_map(map: Map<String, Value>) -> Result<(), String> {
    ot_storage::write_json_file(&otools_config_path(), &Value::Object(map))
}

pub fn read_otools_config_entry<T: DeserializeOwned>(key: &str) -> Result<Option<T>, String> {
    let state_key = normalize_config_key(key).ok_or_else(|| "全局配置 key 不能为空".to_string())?;
    let config = read_otools_config_map()?;
    let Some(value) = config.get(&state_key) else {
        return Ok(None);
    };

    serde_json::from_value::<T>(value.clone())
        .map(Some)
        .map_err(|error| format!("解析全局配置失败({state_key}): {error}"))
}

pub fn save_otools_config_entry<T: Serialize>(key: &str, value: &T) -> Result<(), String> {
    let state_key = normalize_config_key(key).ok_or_else(|| "全局配置 key 不能为空".to_string())?;
    let mut config = read_otools_config_map()?;
    config.insert(
        state_key,
        serde_json::to_value(value).map_err(|error| format!("序列化全局配置失败: {error}"))?,
    );
    write_otools_config_map(config)
}

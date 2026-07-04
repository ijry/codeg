use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;

use otools_core::catalog;
use otools_core::HostError;

const OTOOLS_CONFIG_FILE: &str = "config.json";
const OTOOLS_GLOBAL_AI_SETTINGS_KEY: &str = "ai_settings";
const OTOOLS_GLOBAL_BASIC_SETTINGS_KEY: &str = "basic_settings";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OtoolsConfigTab {
    pub title: String,
    pub name: String,
    pub content: String,
    pub closable: bool,
    #[serde(rename = "pluginUuid")]
    pub plugin_uuid: Option<String>,
}

impl Default for OtoolsConfigTab {
    fn default() -> Self {
        Self {
            title: String::new(),
            name: String::new(),
            content: String::new(),
            closable: true,
            plugin_uuid: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OtoolsConfig {
    pub tabs: Vec<OtoolsConfigTab>,
    pub active_tab: String,
}

impl Default for OtoolsConfig {
    fn default() -> Self {
        Self {
            tabs: Vec::new(),
            active_tab: "home".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OtoolsAiSettings {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl Default for OtoolsAiSettings {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            base_url: "http://127.0.0.1:11434/v1".to_string(),
            api_key: "ollama".to_string(),
            model: "qwen2.5-coder:14b".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OtoolsBasicSettings {
    pub theme_mode: String,
    pub theme_accent: String,
    pub launch_at_startup: bool,
    pub locale: String,
    pub resolved_locale: Option<String>,
}

impl Default for OtoolsBasicSettings {
    fn default() -> Self {
        Self {
            theme_mode: "system".to_string(),
            theme_accent: "classic".to_string(),
            launch_at_startup: false,
            locale: "system".to_string(),
            resolved_locale: None,
        }
    }
}

pub fn otools_config_path() -> PathBuf {
    catalog::otools_root_dir().join(OTOOLS_CONFIG_FILE)
}

pub async fn get_otools_config() -> Result<OtoolsConfig, HostError> {
    let mut config = load_otools_config_from_file()?;
    normalize_otools_config(&mut config);
    Ok(config)
}

pub async fn save_otools_config(config: OtoolsConfig) -> Result<(), HostError> {
    let mut incoming = config;
    normalize_otools_config(&mut incoming);
    write_otools_config_to_file(&incoming)
}

pub async fn get_otools_config_value(key: String) -> Result<Option<Value>, HostError> {
    let state_key =
        normalize_config_key(&key).ok_or_else(|| HostError::invalid_input("Config key required"))?;
    let Some(value) = read_otools_config_entry::<Value>(&state_key)? else {
        return Ok(None);
    };
    Ok(Some(normalize_known_config_value(&state_key, value)?))
}

pub async fn save_otools_config_value(key: String, value: Value) -> Result<(), HostError> {
    let state_key =
        normalize_config_key(&key).ok_or_else(|| HostError::invalid_input("Config key required"))?;
    let normalized_value = normalize_known_config_value(&state_key, value)?;
    save_otools_config_entry(&state_key, &normalized_value)
}

fn load_otools_config_from_file() -> Result<OtoolsConfig, HostError> {
    let config_path = otools_config_path();
    if !config_path.exists() {
        return Ok(OtoolsConfig::default());
    }

    match catalog::read_json_file::<Value>(&config_path)? {
        Value::Object(map) => {
            serde_json::from_value::<OtoolsConfig>(Value::Object(map)).map_err(|error| {
                HostError::configuration_invalid("Invalid OTools config")
                    .with_detail(error.to_string())
            })
        }
        _ => Ok(OtoolsConfig::default()),
    }
}

fn write_otools_config_to_file(config: &OtoolsConfig) -> Result<(), HostError> {
    let config_path = otools_config_path();
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }

    let mut raw_config = if config_path.exists() {
        match catalog::read_json_file::<Value>(&config_path) {
            Ok(Value::Object(map)) => map,
            _ => Map::new(),
        }
    } else {
        Map::new()
    };

    raw_config.insert(
        "tabs".to_string(),
        serde_json::to_value(&config.tabs).map_err(|error| {
            HostError::invalid_input("Invalid OTools config").with_detail(error.to_string())
        })?,
    );
    raw_config.insert(
        "active_tab".to_string(),
        Value::String(config.active_tab.clone()),
    );

    catalog::write_json_file(&config_path, &Value::Object(raw_config))
}

fn read_otools_config_map() -> Result<Map<String, Value>, HostError> {
    let path = otools_config_path();
    if !path.exists() {
        return Ok(Map::new());
    }

    match catalog::read_json_file::<Value>(&path)? {
        Value::Object(map) => Ok(map),
        _ => Ok(Map::new()),
    }
}

fn write_otools_config_map(map: Map<String, Value>) -> Result<(), HostError> {
    catalog::write_json_file(&otools_config_path(), &Value::Object(map))
}

fn read_otools_config_entry<T: DeserializeOwned>(key: &str) -> Result<Option<T>, HostError> {
    let state_key =
        normalize_config_key(key).ok_or_else(|| HostError::invalid_input("Config key required"))?;
    let config = read_otools_config_map()?;
    let Some(value) = config.get(&state_key) else {
        return Ok(None);
    };

    serde_json::from_value::<T>(value.clone())
        .map(Some)
        .map_err(|error| {
            HostError::configuration_invalid("Invalid OTools config value")
                .with_detail(format!("{state_key}: {error}"))
        })
}

fn save_otools_config_entry<T: Serialize>(key: &str, value: &T) -> Result<(), HostError> {
    let state_key =
        normalize_config_key(key).ok_or_else(|| HostError::invalid_input("Config key required"))?;
    let mut config = read_otools_config_map()?;
    config.insert(
        state_key,
        serde_json::to_value(value).map_err(|error| {
            HostError::invalid_input("Invalid OTools config value").with_detail(error.to_string())
        })?,
    );
    write_otools_config_map(config)
}

fn normalize_config_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_otools_config(config: &mut OtoolsConfig) {
    config.tabs = config
        .tabs
        .iter()
        .filter_map(|tab| {
            let name = tab.name.trim();
            let title = tab.title.trim();
            let content = tab.content.trim();
            let plugin_uuid = tab
                .plugin_uuid
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            if name.is_empty() || content.is_empty() {
                return None;
            }

            Some(OtoolsConfigTab {
                title: if title.is_empty() {
                    "未命名插件".to_string()
                } else {
                    title.to_string()
                },
                name: name.to_string(),
                content: content.to_string(),
                closable: true,
                plugin_uuid,
            })
        })
        .collect();

    if config.active_tab.trim().is_empty() {
        config.active_tab = "home".to_string();
    }
}

fn normalize_known_config_value(key: &str, value: Value) -> Result<Value, HostError> {
    match key {
        OTOOLS_GLOBAL_AI_SETTINGS_KEY => serde_json::to_value(normalize_ai_settings(value)?)
            .map_err(|error| {
                HostError::invalid_input("Invalid OTools AI settings")
                    .with_detail(error.to_string())
            }),
        OTOOLS_GLOBAL_BASIC_SETTINGS_KEY => {
            serde_json::to_value(normalize_basic_settings(value)?).map_err(|error| {
                HostError::invalid_input("Invalid OTools basic settings")
                    .with_detail(error.to_string())
            })
        }
        _ => Ok(value),
    }
}

fn normalize_ai_settings(value: Value) -> Result<OtoolsAiSettings, HostError> {
    let incoming = serde_json::from_value::<OtoolsAiSettings>(value).map_err(|error| {
        HostError::invalid_input("Invalid OTools AI settings").with_detail(error.to_string())
    })?;

    let mut normalized = OtoolsAiSettings {
        provider: normalize_ai_provider(&incoming.provider),
        base_url: normalize_required_text(&incoming.base_url, &OtoolsAiSettings::default().base_url),
        api_key: incoming.api_key.trim().to_string(),
        model: normalize_required_text(&incoming.model, &OtoolsAiSettings::default().model),
    };

    if normalized.provider == "openai" && is_aliyun_bailian_base_url(&normalized.base_url) {
        normalized.provider = "aliyun-bailian".to_string();
    }

    Ok(normalized)
}

fn normalize_basic_settings(value: Value) -> Result<OtoolsBasicSettings, HostError> {
    let incoming = serde_json::from_value::<OtoolsBasicSettings>(value).map_err(|error| {
        HostError::invalid_input("Invalid OTools basic settings").with_detail(error.to_string())
    })?;

    let locale = normalize_locale_setting(&incoming.locale);
    let resolved_locale = if locale == "system" {
        normalize_resolved_locale(incoming.resolved_locale.as_deref())
    } else {
        Some(locale.clone())
    };

    Ok(OtoolsBasicSettings {
        theme_mode: normalize_theme_mode(&incoming.theme_mode),
        theme_accent: normalize_theme_accent(&incoming.theme_accent),
        launch_at_startup: incoming.launch_at_startup,
        locale,
        resolved_locale,
    })
}

fn normalize_required_text(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_ai_provider(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "openai" | "ollama" | "azure" | "aliyun-bailian" => value.trim().to_lowercase(),
        "dashscope" | "aliyun" | "bailian" => "aliyun-bailian".to_string(),
        _ => OtoolsAiSettings::default().provider,
    }
}

fn is_aliyun_bailian_base_url(value: &str) -> bool {
    matches!(
        value.trim().to_lowercase().as_str(),
        "https://dashscope.aliyuncs.com/compatible-mode/v1"
            | "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
            | "https://dashscope-us.aliyuncs.com/compatible-mode/v1"
    )
}

fn normalize_theme_mode(value: &str) -> String {
    match value.trim() {
        "system" | "light" | "dark" => value.trim().to_string(),
        _ => OtoolsBasicSettings::default().theme_mode,
    }
}

fn normalize_theme_accent(value: &str) -> String {
    match value.trim() {
        "classic" | "violet" | "emerald" | "amber" | "pink" => value.trim().to_string(),
        _ => OtoolsBasicSettings::default().theme_accent,
    }
}

fn normalize_locale_setting(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "system" {
        return "system".to_string();
    }
    normalize_resolved_locale(Some(trimmed)).unwrap_or_else(|| OtoolsBasicSettings::default().locale)
}

fn normalize_resolved_locale(value: Option<&str>) -> Option<String> {
    match value.map(|item| item.trim()) {
        Some("zh-CN" | "zh-TW" | "en-US" | "ja-JP" | "ko-KR" | "de-DE" | "fr-FR" | "pt-PT"
            | "ru-RU" | "es-ES" | "ar-SA") => value.map(|item| item.trim().to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_ai_provider_aliases() {
        let value = normalize_known_config_value(
            OTOOLS_GLOBAL_AI_SETTINGS_KEY,
            json!({
                "provider": "aliyun",
                "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "apiKey": " key ",
                "model": ""
            }),
        )
        .unwrap();

        assert_eq!(value["provider"], "aliyun-bailian");
        assert_eq!(value["baseUrl"], "https://dashscope.aliyuncs.com/compatible-mode/v1");
        assert_eq!(value["apiKey"], "key");
        assert_eq!(value["model"], "qwen2.5-coder:14b");
    }

    #[test]
    fn normalizes_basic_settings_shape() {
        let value = normalize_known_config_value(
            OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
            json!({
                "themeMode": "nope",
                "themeAccent": "pink",
                "launchAtStartup": true,
                "locale": "fr-FR",
                "resolvedLocale": "zh-CN"
            }),
        )
        .unwrap();

        assert_eq!(value["themeMode"], "system");
        assert_eq!(value["themeAccent"], "pink");
        assert_eq!(value["launchAtStartup"], true);
        assert_eq!(value["locale"], "fr-FR");
        assert_eq!(value["resolvedLocale"], "fr-FR");
    }
}

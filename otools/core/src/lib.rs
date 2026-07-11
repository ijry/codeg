use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub mod catalog;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostErrorCode {
    InvalidInput,
    ConfigurationInvalid,
    NotFound,
    AlreadyExists,
    PermissionDenied,
    IoError,
    TaskExecutionFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{message}")]
pub struct HostError {
    pub code: HostErrorCode,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl HostError {
    pub fn new(code: HostErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::InvalidInput, message)
    }

    pub fn configuration_invalid(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::ConfigurationInvalid, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::NotFound, message)
    }

    pub fn task_execution_failed(message: impl Into<String>) -> Self {
        Self::new(HostErrorCode::TaskExecutionFailed, message)
    }

    pub fn io(err: std::io::Error) -> Self {
        let code = match err.kind() {
            std::io::ErrorKind::NotFound => HostErrorCode::NotFound,
            std::io::ErrorKind::PermissionDenied => HostErrorCode::PermissionDenied,
            std::io::ErrorKind::AlreadyExists => HostErrorCode::AlreadyExists,
            _ => HostErrorCode::IoError,
        };
        let message = match code {
            HostErrorCode::NotFound => "Resource not found",
            HostErrorCode::PermissionDenied => "Permission denied",
            HostErrorCode::AlreadyExists => "Resource already exists",
            _ => "I/O operation failed",
        };
        Self::new(code, message).with_detail(err.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsPluginInfo {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    pub display_name_cn: Option<String>,
    pub developer_name: Option<String>,
    pub summary: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
    pub version: Option<String>,
    #[serde(
        rename = "minOToolsVersion",
        alias = "minOtoolsVersion",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub min_otools_version: Option<String>,
    pub icon: Option<String>,
    #[serde(default)]
    pub key: Vec<String>,
    pub entry: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub preload: Option<String>,
    #[serde(default)]
    pub has_ad: bool,
    #[serde(default)]
    pub in_plugin_purchase: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dev_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub quick_dev: Option<bool>,
    pub open_in_browser: bool,
    pub native_enabled: bool,
    pub permissions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub autostart: Option<catalog::ToolPluginAutostart>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub shutdown_hooks: Option<Vec<catalog::ToolPluginShutdownHook>>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub builtin: Option<bool>,
    pub source: String,
    pub asset_base_url: String,
}

fn default_true() -> bool {
    true
}

pub fn validate_plugin_id(value: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(HostError::invalid_input("Invalid OTools plugin id"));
    }
    Ok(trimmed.to_string())
}

pub fn default_data_dir() -> PathBuf {
    if let Some(custom) = std::env::var_os("CODEG_DATA_DIR").filter(|value| !value.is_empty()) {
        return PathBuf::from(custom);
    }
    dirs::data_dir()
        .map(|dir| dir.join("codeg"))
        .unwrap_or_else(|| PathBuf::from(".codeg-data"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_plugin_id_accepts_legacy_safe_ids() {
        assert_eq!(
            validate_plugin_id(" dev.plugin-1_2 ").expect("valid id"),
            "dev.plugin-1_2"
        );
    }

    #[test]
    fn validate_plugin_id_rejects_path_like_ids() {
        assert!(validate_plugin_id("../disk").is_err());
        assert!(validate_plugin_id("bad/id").is_err());
        assert!(validate_plugin_id("").is_err());
    }
}

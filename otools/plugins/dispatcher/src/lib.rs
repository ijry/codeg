use otools_core::{validate_plugin_id, HostError};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsPluginCommandInvokeRequest {
    pub plugin_uuid: String,
    pub command: String,
    #[serde(default)]
    pub payload: Value,
}

pub async fn invoke_host_command(
    request: OtoolsPluginCommandInvokeRequest,
) -> Result<Value, HostError> {
    let plugin_uuid = validate_plugin_id(&request.plugin_uuid)?;
    let command = validate_plugin_command(&request.command)?;
    if let Some(value) = invoke_builtin_command(&plugin_uuid, &command, request.payload).await? {
        return Ok(value);
    }
    Err(HostError::not_found(format!(
        "No OTools host dispatcher registered for plugin: {plugin_uuid}"
    )))
}

pub async fn invoke_lifecycle_command(
    plugin_id: &str,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    let action = validate_dispatch_token(action, "lifecycle action").map_err(host_error_to_string)?;
    if let Some(value) = invoke_builtin_command(plugin_id, &action, payload.clone())
        .await
        .map_err(host_error_to_string)?
    {
        return Ok(value);
    }

    let plugin_id = plugin_id.to_string();
    tokio::task::spawn_blocking(move || {
        otools_platform_native::native_plugin_invoke(plugin_id, action, payload)
    })
    .await
    .map_err(|error| format!("lifecycle dispatch task failed: {error}"))?
}

pub fn validate_plugin_command(value: &str) -> Result<String, HostError> {
    validate_dispatch_token(value, "plugin command")
}

pub fn validate_dispatch_token(value: &str, label: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(HostError::invalid_input(format!("Invalid OTools {label}")));
    }
    Ok(trimmed.to_string())
}

pub fn host_error_to_string(error: HostError) -> String {
    let HostError {
        message, detail, ..
    } = error;
    match detail {
        Some(detail) if !detail.trim().is_empty() && detail != message => {
            format!("{message}: {detail}")
        }
        _ => message,
    }
}

async fn invoke_builtin_command(
    plugin_id: &str,
    command: &str,
    payload: Value,
) -> Result<Option<Value>, HostError> {
    if otools_plugin_dev::supports_plugin(plugin_id) {
        return otools_plugin_dev::dispatch_command(command, payload)
            .await
            .map(Some);
    }
    if otools_plugin_park::supports_plugin(plugin_id) {
        return otools_plugin_park::dispatch_command(command, payload)
            .await
            .map(Some);
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_legacy_dispatch_tokens() {
        assert_eq!(
            validate_dispatch_token(" dev.open_panel-1_2 ", "command").expect("valid token"),
            "dev.open_panel-1_2"
        );
    }

    #[test]
    fn rejects_path_like_dispatch_tokens() {
        assert!(validate_dispatch_token("../dev", "command").is_err());
        assert!(validate_dispatch_token("bad/action", "command").is_err());
        assert!(validate_dispatch_token("", "command").is_err());
    }
}

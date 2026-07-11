use async_trait::async_trait;
use otools_core::{HostError, HostErrorCode};
use serde_json::Value;

#[cfg(feature = "legacy-compat")]
pub mod lifecycle {
    pub use otools_platform_lifecycle_registry::{
        has_shutdown_action, register_shutdown_action, resolve_shutdown_action_runner,
        ShutdownHookRunner,
    };
}

#[cfg(feature = "legacy-compat")]
pub mod package_manager {
    pub use otools_platform_package_manager::*;
}

#[cfg(feature = "legacy-compat")]
pub mod ssh {
    pub use otools_platform_ssh::*;
}

#[cfg(feature = "legacy-compat")]
pub use ssh::{SshAuthConfig, SshAuthType, SshConfig, SshTunnelConfig, TcpEndpoint};

pub mod caps {
    pub const HTTP_SEND: &str = "http.send";
    pub const HTTP_NORMALIZE_REQUEST: &str = "http.normalize_request";
    pub const HTTP_WRITE_BASE64_FILE: &str = "http.write_base64_file";
    pub const HTTP_WRITE_BASE64_FILE_LEGACY: &str = "http.writeBase64File";
    pub const PLUGIN_STATE_READ: &str = "plugin_state.read";
    pub const PLUGIN_STATE_SAVE_LOCAL: &str = "plugin_state.save_local";
}

#[async_trait]
pub trait HostDispatch: Send + Sync {
    async fn dispatch(&self, capability: &str, request: Value) -> Result<Value, String>;
}

pub struct DirectHostDispatch;

#[async_trait]
impl HostDispatch for DirectHostDispatch {
    async fn dispatch(&self, capability: &str, request: Value) -> Result<Value, String> {
        dispatch_direct(capability, request).await
    }
}

pub struct BridgeHostDispatch<F>
where
    F: Fn(&str, Value) -> Result<Value, String> + Send + Sync,
{
    f: F,
}

impl<F> BridgeHostDispatch<F>
where
    F: Fn(&str, Value) -> Result<Value, String> + Send + Sync,
{
    pub fn new(f: F) -> Self {
        Self { f }
    }
}

#[async_trait]
impl<F> HostDispatch for BridgeHostDispatch<F>
where
    F: Fn(&str, Value) -> Result<Value, String> + Send + Sync,
{
    async fn dispatch(&self, capability: &str, request: Value) -> Result<Value, String> {
        (self.f)(capability, request)
    }
}

pub async fn dispatch_direct(capability: &str, request: Value) -> Result<Value, String> {
    dispatch_host_capability(capability, request)
        .await
        .map_err(host_error_to_string)
}

pub fn dispatch_direct_blocking(capability: &str, request: Value) -> Result<Value, String> {
    dispatch_host_capability_blocking(capability, request).map_err(host_error_to_string)
}

pub async fn dispatch_host_capability(
    capability: &str,
    request: Value,
) -> Result<Value, HostError> {
    match capability.trim() {
        caps::HTTP_SEND => otools_platform_http_client::otools_host_http_send(request).await,
        caps::HTTP_NORMALIZE_REQUEST => Ok(
            otools_platform_http_client::normalize_otools_host_http_request(request),
        ),
        caps::HTTP_WRITE_BASE64_FILE | caps::HTTP_WRITE_BASE64_FILE_LEGACY => {
            otools_platform_http_client::otools_host_http_write_base64_file_from_value_blocking(
                request,
            )?;
            Ok(Value::Null)
        }
        caps::PLUGIN_STATE_READ => dispatch_plugin_state_read(request),
        caps::PLUGIN_STATE_SAVE_LOCAL => dispatch_plugin_state_save_local(request),
        other => Err(unsupported_capability(other)),
    }
}

pub fn dispatch_host_capability_blocking(
    capability: &str,
    request: Value,
) -> Result<Value, HostError> {
    match capability.trim() {
        caps::HTTP_SEND => {
            otools_platform_http_client::otools_host_http_send_blocking(request)
        }
        caps::HTTP_NORMALIZE_REQUEST => Ok(
            otools_platform_http_client::normalize_otools_host_http_request(request),
        ),
        caps::HTTP_WRITE_BASE64_FILE | caps::HTTP_WRITE_BASE64_FILE_LEGACY => {
            otools_platform_http_client::otools_host_http_write_base64_file_from_value_blocking(
                request,
            )?;
            Ok(Value::Null)
        }
        caps::PLUGIN_STATE_READ => dispatch_plugin_state_read(request),
        caps::PLUGIN_STATE_SAVE_LOCAL => dispatch_plugin_state_save_local(request),
        other => Err(unsupported_capability(other)),
    }
}

pub fn supported_capabilities() -> &'static [&'static str] {
    &[
        caps::HTTP_SEND,
        caps::HTTP_NORMALIZE_REQUEST,
        caps::HTTP_WRITE_BASE64_FILE,
        caps::HTTP_WRITE_BASE64_FILE_LEGACY,
        caps::PLUGIN_STATE_READ,
        caps::PLUGIN_STATE_SAVE_LOCAL,
    ]
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

fn dispatch_plugin_state_read(request: Value) -> Result<Value, HostError> {
    let plugin = request_plugin_id(&request)?;
    let scheme = request
        .get("scheme")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(
        otools_plugin_state::get_otools_plugin_localstate_with_scheme(plugin, scheme)?
            .unwrap_or(Value::Null),
    )
}

fn dispatch_plugin_state_save_local(request: Value) -> Result<Value, HostError> {
    let plugin = request_plugin_id(&request)?;
    let scheme = request
        .get("scheme")
        .and_then(Value::as_str)
        .map(str::to_string);
    let state = request
        .get("state")
        .cloned()
        .ok_or_else(|| HostError::invalid_input("state is required"))?;
    otools_plugin_state::save_otools_plugin_localstate_with_scheme(plugin, scheme, state)?;
    Ok(Value::Null)
}

fn request_plugin_id(request: &Value) -> Result<String, HostError> {
    request
        .get("plugin")
        .or_else(|| request.get("pluginUuid"))
        .or_else(|| request.get("plugin_uuid"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| HostError::invalid_input("plugin is required"))
}

fn unsupported_capability(capability: &str) -> HostError {
    HostError::new(
        HostErrorCode::NotFound,
        format!("Unsupported host capability: {capability}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exposes_original_host_capability_names() {
        assert!(supported_capabilities().contains(&caps::HTTP_SEND));
        assert!(supported_capabilities().contains(&caps::HTTP_WRITE_BASE64_FILE_LEGACY));
        assert!(supported_capabilities().contains(&caps::PLUGIN_STATE_READ));
    }

    #[cfg(feature = "legacy-compat")]
    #[test]
    fn exposes_legacy_host_modules() {
        let ssh = SshTunnelConfig::default();
        assert!(!ssh.enabled);
        assert!(lifecycle::register_shutdown_action("host-dispatch.test", || async {
            Ok("ok".to_string())
        })
        .is_ok());
        assert!(lifecycle::resolve_shutdown_action_runner("host-dispatch.test").is_ok());
    }

    #[test]
    fn normalizes_http_request_through_dispatch() {
        let value = dispatch_host_capability_blocking(
            caps::HTTP_NORMALIZE_REQUEST,
            json!({
                "method": "post",
                "bodyType": "json",
                "timeoutSecs": 0,
            }),
        )
        .unwrap();

        assert_eq!(value["method"], "POST");
        assert_eq!(value["body_type"], "json");
        assert_eq!(value["timeout_secs"], 30);
    }

    #[test]
    fn requires_plugin_for_state_capabilities() {
        let error = dispatch_host_capability_blocking(caps::PLUGIN_STATE_READ, json!({}))
            .expect_err("missing plugin should fail");

        assert_eq!(error.message, "plugin is required");
    }
}

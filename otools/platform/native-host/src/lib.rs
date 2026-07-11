use otools_core::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsNativeInvokeRequest {
    pub plugin_uuid: String,
    pub method: String,
    #[serde(default)]
    pub payload: Value,
}

pub fn native_plugin_invoke(
    uuid: String,
    method: String,
    payload: Value,
) -> Result<Value, HostError> {
    otools_platform_native::native_plugin_invoke(uuid, method, payload)
        .map_err(HostError::task_execution_failed)
}

pub fn native_plugin_reload(uuid: String) -> Result<String, HostError> {
    otools_platform_native::native_plugin_reload(uuid).map_err(HostError::task_execution_failed)
}

pub fn native_plugin_probe(uuid: String) -> Result<Value, HostError> {
    otools_platform_native::native_plugin_probe(uuid).map_err(HostError::task_execution_failed)
}

pub fn native_plugin_poll_events(uuid: String) -> Result<Vec<Value>, HostError> {
    otools_platform_native::native_plugin_poll_events(uuid)
        .map_err(HostError::task_execution_failed)
}

pub fn native_plugin_listen_acquire(
    uuid: String,
    interval_ms: Option<u64>,
    emit: impl Fn(String, Value) + Send + Sync + 'static,
) -> Result<(), HostError> {
    otools_platform_native::native_plugin_listen_acquire(uuid, interval_ms, emit)
        .map_err(HostError::task_execution_failed)
}

pub fn native_plugin_listen_release(uuid: String) -> Result<(), HostError> {
    otools_platform_native::native_plugin_listen_release(uuid)
        .map_err(HostError::task_execution_failed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use otools_core::HostErrorCode;

    #[test]
    fn maps_native_errors_to_host_errors() {
        let error = native_plugin_reload(" ".to_string()).expect_err("empty uuid fails");
        assert!(matches!(error.code, HostErrorCode::TaskExecutionFailed));
        assert!(error.message.contains("UUID"));
    }
}

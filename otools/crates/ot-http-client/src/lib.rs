use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OtoolsHostHttpKeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

impl Default for OtoolsHostHttpKeyValue {
    fn default() -> Self {
        Self {
            key: String::new(),
            value: String::new(),
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OtoolsHostHttpRequestConfig {
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<OtoolsHostHttpKeyValue>,
    pub cookies: Vec<OtoolsHostHttpKeyValue>,
    pub params: Vec<OtoolsHostHttpKeyValue>,
    #[serde(alias = "bodyType")]
    pub body_type: String,
    pub body: String,
    #[serde(alias = "timeoutSecs")]
    pub timeout_secs: u64,
    #[serde(alias = "followRedirects")]
    pub follow_redirects: bool,
}

impl Default for OtoolsHostHttpRequestConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            method: "GET".to_string(),
            url: String::new(),
            headers: Vec::new(),
            cookies: Vec::new(),
            params: Vec::new(),
            body_type: "none".to_string(),
            body: String::new(),
            timeout_secs: 30,
            follow_redirects: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtoolsHostHttpResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtoolsHostHttpResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<OtoolsHostHttpResponseHeader>,
    pub cookies: Vec<String>,
    pub elapsed_ms: u128,
    pub content_type: String,
    pub size: usize,
    pub body_text: Option<String>,
    pub body_base64: String,
    pub is_image: bool,
    pub file_name: String,
    pub final_url: String,
}

fn host_error_to_string(error: otools_core::HostError) -> String {
    match error.detail {
        Some(detail) if !detail.trim().is_empty() && detail != error.message => {
            format!("{}: {detail}", error.message)
        }
        _ => error.message,
    }
}

pub fn normalize_http_request(request: &mut OtoolsHostHttpRequestConfig) {
    let Ok(value) = serde_json::to_value(&*request) else {
        return;
    };
    let normalized = otools_platform_http_client::normalize_otools_host_http_request(value);
    if let Ok(next) = serde_json::from_value(normalized) {
        *request = next;
    }
}

pub async fn otools_host_http_send(
    request: OtoolsHostHttpRequestConfig,
) -> Result<OtoolsHostHttpResponseData, String> {
    let value = serde_json::to_value(request).map_err(|error| error.to_string())?;
    let response = otools_platform_http_client::otools_host_http_send(value)
        .await
        .map_err(host_error_to_string)?;
    serde_json::from_value(response).map_err(|error| error.to_string())
}

pub fn otools_host_http_write_base64_file(
    file_path: String,
    data_base64: String,
) -> Result<(), String> {
    otools_platform_http_client::otools_host_http_write_base64_file_from_value_blocking(
        serde_json::json!({
            "filePath": file_path,
            "dataBase64": data_base64,
        }),
    )
    .map_err(host_error_to_string)
}

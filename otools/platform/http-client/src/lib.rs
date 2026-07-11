use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use otools_core::HostError;
use reqwest::header::{
    HeaderMap, HeaderName, HeaderValue, CONTENT_DISPOSITION, CONTENT_TYPE, COOKIE, SET_COOKIE,
};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

#[derive(Debug, Clone, Serialize)]
pub struct OtoolsHostHttpResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OtoolsHostHttpResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<OtoolsHostHttpResponseHeader>,
    pub cookies: Vec<String>,
    pub elapsed_ms: u64,
    pub content_type: String,
    pub size: usize,
    pub body_text: Option<String>,
    pub body_base64: String,
    pub is_image: bool,
    pub file_name: String,
    pub final_url: String,
}

pub async fn otools_host_http_write_base64_file(
    file_path: String,
    data_base64: String,
) -> Result<(), HostError> {
    write_base64_file_to_path(file_path, data_base64)
}

pub fn otools_host_http_write_base64_file_from_value_blocking(
    request: Value,
) -> Result<(), HostError> {
    let file_path = request
        .get("filePath")
        .or_else(|| request.get("file_path"))
        .or_else(|| request.get("path"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let data_base64 = request
        .get("dataBase64")
        .or_else(|| request.get("data_base64"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    write_base64_file_to_path(file_path, data_base64)
}

pub async fn otools_host_http_send(request: Value) -> Result<Value, HostError> {
    let request = parse_otools_host_http_request(request)?;
    let response = send_otools_host_http_request(request).await?;
    response_to_value(&response)
}

pub fn otools_host_http_send_blocking(request: Value) -> Result<Value, HostError> {
    let request = parse_otools_host_http_request(request)?;
    let response = send_otools_host_http_request_blocking(request)?;
    response_to_value(&response)
}

pub fn normalize_otools_host_http_request(request: Value) -> Value {
    let mut object = match request {
        Value::Object(object) => object,
        _ => serde_json::Map::new(),
    };

    let method = object
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET")
        .trim()
        .to_ascii_uppercase();
    object.insert(
        "method".to_string(),
        Value::String(if method.is_empty() {
            "GET".to_string()
        } else {
            method
        }),
    );

    let body_type = object
        .get("body_type")
        .or_else(|| object.get("bodyType"))
        .and_then(Value::as_str)
        .unwrap_or("none")
        .trim()
        .to_ascii_lowercase();
    let body_type = match body_type.as_str() {
        "json" | "text" | "xml" | "form" | "binary" => body_type,
        _ => "none".to_string(),
    };
    object.insert("body_type".to_string(), Value::String(body_type.clone()));
    object.insert("bodyType".to_string(), Value::String(body_type));

    let timeout_secs = object
        .get("timeout_secs")
        .or_else(|| object.get("timeoutSecs"))
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .unwrap_or(30);
    object.insert(
        "timeout_secs".to_string(),
        Value::Number(timeout_secs.into()),
    );
    object.insert(
        "timeoutSecs".to_string(),
        Value::Number(timeout_secs.into()),
    );

    let follow_redirects = object
        .get("follow_redirects")
        .or_else(|| object.get("followRedirects"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    object.insert(
        "follow_redirects".to_string(),
        Value::Bool(follow_redirects),
    );
    object.insert(
        "followRedirects".to_string(),
        Value::Bool(follow_redirects),
    );

    for key in ["headers", "cookies", "params"] {
        if let Some(value) = object.get(key).cloned() {
            object.insert(key.to_string(), normalize_http_key_value_entries(value));
        }
    }

    if let Some(body) = object.get("body").cloned() {
        let normalized = match body {
            Value::Null => Value::String(String::new()),
            Value::String(_) => body,
            other => {
                Value::String(serde_json::to_string(&other).unwrap_or_else(|_| other.to_string()))
            }
        };
        object.insert("body".to_string(), normalized);
    }

    Value::Object(object)
}

fn write_base64_file_to_path(file_path: String, data_base64: String) -> Result<(), HostError> {
    let target = PathBuf::from(require_non_empty(file_path, "filePath")?);
    let bytes = BASE64_STANDARD
        .decode(data_base64.trim())
        .map_err(|error| {
            HostError::invalid_input("Invalid base64 file payload").with_detail(error.to_string())
        })?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }
    fs::write(target, bytes).map_err(HostError::io)
}

fn parse_otools_host_http_request(
    request: Value,
) -> Result<OtoolsHostHttpRequestConfig, HostError> {
    serde_json::from_value(normalize_otools_host_http_request(request)).map_err(|error| {
        HostError::invalid_input("Invalid OTools HTTP request payload")
            .with_detail(error.to_string())
    })
}

async fn send_otools_host_http_request(
    mut request: OtoolsHostHttpRequestConfig,
) -> Result<OtoolsHostHttpResponseData, HostError> {
    normalize_http_request_config(&mut request);

    let method = parse_method(&request.method)?;
    let mut url = parse_url_with_default_scheme(&request.url)?;
    append_query_params(&mut url, &request.params);

    let redirect_policy = if request.follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(request.timeout_secs.max(1)))
        .redirect(redirect_policy)
        .build()
        .map_err(|error| {
            HostError::task_execution_failed("Initialize OTools HTTP client failed")
                .with_detail(error.to_string())
        })?;
    let mut builder = client.request(method, url);

    for header in &request.headers {
        if !header.enabled || header.key.trim().is_empty() {
            continue;
        }
        let header_name = HeaderName::from_bytes(header.key.trim().as_bytes()).map_err(|error| {
            HostError::invalid_input(format!("Invalid HTTP header '{}'", header.key))
                .with_detail(error.to_string())
        })?;
        let header_value = HeaderValue::from_str(header.value.as_str()).map_err(|error| {
            HostError::invalid_input(format!("Invalid HTTP header value '{}'", header.key))
                .with_detail(error.to_string())
        })?;
        builder = builder.header(header_name, header_value);
    }

    let cookie_header = build_cookie_header(&request.cookies);
    if !cookie_header.is_empty() {
        builder = builder.header(COOKIE, cookie_header);
    }

    if request.body_type != "none" && !request.body.is_empty() {
        if !has_content_type(&request.headers) {
            builder = apply_default_content_type(builder, &request.body_type);
        }
        if request.body_type == "binary" {
            let binary = BASE64_STANDARD
                .decode(request.body.trim())
                .map_err(|error| {
                    HostError::invalid_input("Binary body must be base64")
                        .with_detail(error.to_string())
                })?;
            builder = builder.body(binary);
        } else {
            builder = builder.body(request.body.clone());
        }
    }

    let started_at = Instant::now();
    let response = builder.send().await.map_err(|error| {
        HostError::task_execution_failed("OTools HTTP request failed")
            .with_detail(error.to_string())
    })?;
    let elapsed_ms = elapsed_ms(started_at);
    let status = response.status();
    let final_url = response.url().to_string();
    let headers = response.headers().clone();
    let bytes = response.bytes().await.map_err(|error| {
        HostError::task_execution_failed("Failed to read OTools HTTP response")
            .with_detail(error.to_string())
    })?;

    Ok(build_http_response_data(
        status,
        final_url,
        headers,
        bytes.as_ref(),
        elapsed_ms,
    ))
}

fn send_otools_host_http_request_blocking(
    mut request: OtoolsHostHttpRequestConfig,
) -> Result<OtoolsHostHttpResponseData, HostError> {
    normalize_http_request_config(&mut request);

    let method = parse_method(&request.method)?;
    let mut url = parse_url_with_default_scheme(&request.url)?;
    append_query_params(&mut url, &request.params);

    let redirect_policy = if request.follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(request.timeout_secs.max(1)))
        .redirect(redirect_policy)
        .build()
        .map_err(|error| {
            HostError::task_execution_failed("Initialize OTools HTTP client failed")
                .with_detail(error.to_string())
        })?;
    let mut builder = client.request(method, url);

    for header in &request.headers {
        if !header.enabled || header.key.trim().is_empty() {
            continue;
        }
        let header_name = HeaderName::from_bytes(header.key.trim().as_bytes()).map_err(|error| {
            HostError::invalid_input(format!("Invalid HTTP header '{}'", header.key))
                .with_detail(error.to_string())
        })?;
        let header_value = HeaderValue::from_str(header.value.as_str()).map_err(|error| {
            HostError::invalid_input(format!("Invalid HTTP header value '{}'", header.key))
                .with_detail(error.to_string())
        })?;
        builder = builder.header(header_name, header_value);
    }

    let cookie_header = build_cookie_header(&request.cookies);
    if !cookie_header.is_empty() {
        builder = builder.header(COOKIE, cookie_header);
    }

    if request.body_type != "none" && !request.body.is_empty() {
        if !has_content_type(&request.headers) {
            builder = apply_default_blocking_content_type(builder, &request.body_type);
        }
        if request.body_type == "binary" {
            let binary = BASE64_STANDARD
                .decode(request.body.trim())
                .map_err(|error| {
                    HostError::invalid_input("Binary body must be base64")
                        .with_detail(error.to_string())
                })?;
            builder = builder.body(binary);
        } else {
            builder = builder.body(request.body.clone());
        }
    }

    let started_at = Instant::now();
    let response = builder.send().map_err(|error| {
        HostError::task_execution_failed("OTools HTTP request failed")
            .with_detail(error.to_string())
    })?;
    let elapsed_ms = elapsed_ms(started_at);
    let status = response.status();
    let final_url = response.url().to_string();
    let headers = response.headers().clone();
    let bytes = response.bytes().map_err(|error| {
        HostError::task_execution_failed("Failed to read OTools HTTP response")
            .with_detail(error.to_string())
    })?;

    Ok(build_http_response_data(
        status,
        final_url,
        headers,
        bytes.as_ref(),
        elapsed_ms,
    ))
}

fn normalize_http_request_config(request: &mut OtoolsHostHttpRequestConfig) {
    let method = request.method.trim().to_ascii_uppercase();
    request.method = if method.is_empty() {
        "GET".to_string()
    } else {
        method
    };

    let body_type = request.body_type.trim().to_ascii_lowercase();
    request.body_type = match body_type.as_str() {
        "json" | "text" | "xml" | "form" | "binary" => body_type,
        _ => "none".to_string(),
    };

    if request.timeout_secs == 0 {
        request.timeout_secs = 30;
    }
}

fn normalize_http_key_value_entries(value: Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items),
        Value::Object(map) => Value::Array(
            map.into_iter()
                .map(|(key, value)| {
                    json!({
                        "key": key,
                        "value": value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string()),
                        "enabled": true,
                    })
                })
                .collect(),
        ),
        _ => Value::Array(Vec::new()),
    }
}

fn parse_method(method: &str) -> Result<Method, HostError> {
    Method::from_bytes(method.as_bytes()).map_err(|error| {
        HostError::invalid_input("Invalid HTTP method").with_detail(error.to_string())
    })
}

fn parse_url_with_default_scheme(url: &str) -> Result<Url, HostError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input("url is required"));
    }
    if let Ok(parsed) = Url::parse(trimmed) {
        return Ok(parsed);
    }
    Url::parse(&format!("http://{trimmed}")).map_err(|error| {
        HostError::invalid_input("Invalid OTools HTTP url").with_detail(error.to_string())
    })
}

fn append_query_params(url: &mut Url, params: &[OtoolsHostHttpKeyValue]) {
    let mut query_pairs = url.query_pairs_mut();
    for item in params {
        if !item.enabled || item.key.trim().is_empty() {
            continue;
        }
        query_pairs.append_pair(item.key.trim(), item.value.as_str());
    }
}

fn has_content_type(headers: &[OtoolsHostHttpKeyValue]) -> bool {
    headers
        .iter()
        .any(|item| item.enabled && item.key.trim().eq_ignore_ascii_case("content-type"))
}

fn build_cookie_header(cookies: &[OtoolsHostHttpKeyValue]) -> String {
    cookies
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| format!("{}={}", item.key.trim(), item.value))
        .collect::<Vec<_>>()
        .join("; ")
}

fn apply_default_content_type(
    builder: reqwest::RequestBuilder,
    body_type: &str,
) -> reqwest::RequestBuilder {
    match body_type {
        "json" => builder.header(CONTENT_TYPE, "application/json"),
        "xml" => builder.header(CONTENT_TYPE, "application/xml"),
        "form" => builder.header(CONTENT_TYPE, "application/x-www-form-urlencoded"),
        "text" => builder.header(CONTENT_TYPE, "text/plain; charset=utf-8"),
        "binary" => builder.header(CONTENT_TYPE, "application/octet-stream"),
        _ => builder,
    }
}

fn apply_default_blocking_content_type(
    builder: reqwest::blocking::RequestBuilder,
    body_type: &str,
) -> reqwest::blocking::RequestBuilder {
    match body_type {
        "json" => builder.header(CONTENT_TYPE, "application/json"),
        "xml" => builder.header(CONTENT_TYPE, "application/xml"),
        "form" => builder.header(CONTENT_TYPE, "application/x-www-form-urlencoded"),
        "text" => builder.header(CONTENT_TYPE, "text/plain; charset=utf-8"),
        "binary" => builder.header(CONTENT_TYPE, "application/octet-stream"),
        _ => builder,
    }
}

fn build_http_response_data(
    status: reqwest::StatusCode,
    final_url: String,
    headers: HeaderMap,
    bytes: &[u8],
    elapsed_ms: u64,
) -> OtoolsHostHttpResponseData {
    let response_headers = headers
        .iter()
        .map(|(name, value)| OtoolsHostHttpResponseHeader {
            key: name.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect::<Vec<_>>();
    let response_cookies = headers
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(|item| item.to_string()))
        .collect::<Vec<_>>();
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let is_image = content_type.to_ascii_lowercase().starts_with("image/");
    let body_base64 = BASE64_STANDARD.encode(bytes);
    let body_text = if is_image {
        None
    } else {
        Some(String::from_utf8_lossy(bytes).to_string())
    };
    let file_name = guess_response_file_name(&headers, &final_url, &content_type);

    OtoolsHostHttpResponseData {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: response_headers,
        cookies: response_cookies,
        elapsed_ms,
        content_type,
        size: bytes.len(),
        body_text,
        body_base64,
        is_image,
        file_name,
        final_url,
    }
}

fn response_to_value(response: &OtoolsHostHttpResponseData) -> Result<Value, HostError> {
    let mut value = serde_json::to_value(response).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize OTools HTTP response")
            .with_detail(error.to_string())
    })?;
    let Some(object) = value.as_object_mut() else {
        return Ok(value);
    };

    let headers_map = response_headers_map(&response.headers);
    object.insert("headers_map".to_string(), Value::Object(headers_map.clone()));
    object.insert("headersMap".to_string(), Value::Object(headers_map));
    object.insert(
        "statusText".to_string(),
        Value::String(response.status_text.clone()),
    );
    object.insert("elapsedMs".to_string(), Value::Number(response.elapsed_ms.into()));
    object.insert(
        "contentType".to_string(),
        Value::String(response.content_type.clone()),
    );
    object.insert(
        "bodyText".to_string(),
        response
            .body_text
            .as_ref()
            .map(|value| Value::String(value.clone()))
            .unwrap_or(Value::Null),
    );
    object.insert(
        "bodyBase64".to_string(),
        Value::String(response.body_base64.clone()),
    );
    object.insert("isImage".to_string(), Value::Bool(response.is_image));
    object.insert("fileName".to_string(), Value::String(response.file_name.clone()));
    object.insert("finalUrl".to_string(), Value::String(response.final_url.clone()));
    object.insert(
        "body".to_string(),
        Value::String(response.body_text.clone().unwrap_or_default()),
    );

    Ok(value)
}

fn response_headers_map(
    headers: &[OtoolsHostHttpResponseHeader],
) -> serde_json::Map<String, Value> {
    headers
        .iter()
        .map(|header| {
            (
                header.key.clone(),
                Value::String(header.value.clone()),
            )
        })
        .collect()
}

fn parse_content_disposition_filename(content_disposition: &str) -> Option<String> {
    for segment in content_disposition.split(';').map(str::trim) {
        if let Some(value) = segment.strip_prefix("filename=") {
            let file_name = value.trim_matches('"').trim();
            if !file_name.is_empty() {
                return Some(file_name.to_string());
            }
        }
    }
    None
}

fn sanitize_response_file_name(file_name: &str) -> String {
    let sanitized = file_name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if sanitized.is_empty() {
        "response.bin".to_string()
    } else {
        sanitized
    }
}

fn guess_response_file_name(headers: &HeaderMap, final_url: &str, content_type: &str) -> String {
    if let Some(value) = headers
        .get(CONTENT_DISPOSITION)
        .and_then(|item| item.to_str().ok())
        .and_then(parse_content_disposition_filename)
    {
        return sanitize_response_file_name(&value);
    }

    if let Ok(url) = Url::parse(final_url) {
        if let Some(segment) = url
            .path_segments()
            .and_then(|segments| segments.last())
            .filter(|segment| !segment.trim().is_empty())
        {
            return sanitize_response_file_name(segment);
        }
    }

    let extension = if content_type.starts_with("image/") {
        content_type
            .split('/')
            .nth(1)
            .and_then(|value| value.split(';').next())
            .unwrap_or("png")
            .trim()
            .to_string()
    } else if content_type.contains("json") {
        "json".to_string()
    } else if content_type.contains("xml") {
        "xml".to_string()
    } else if content_type.contains("text") {
        "txt".to_string()
    } else {
        "bin".to_string()
    };

    format!(
        "response_{}.{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0),
        extension
    )
}

fn require_non_empty(value: String, name: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input(format!("{name} is required")));
    }
    Ok(trimmed.to_string())
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis().min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_http_request_shape() {
        let normalized = normalize_otools_host_http_request(json!({
            "method": "post",
            "bodyType": "JSON",
            "timeoutSecs": 0,
            "headers": {
                "Accept": "application/json"
            },
            "body": {
                "ok": true
            }
        }));

        assert_eq!(normalized["method"], "POST");
        assert_eq!(normalized["body_type"], "json");
        assert_eq!(normalized["bodyType"], "json");
        assert_eq!(normalized["timeout_secs"], 30);
        assert_eq!(normalized["timeoutSecs"], 30);
        assert_eq!(normalized["headers"][0]["key"], "Accept");
        assert_eq!(normalized["headers"][0]["enabled"], true);
        assert_eq!(normalized["body"], "{\"ok\":true}");
    }

    #[test]
    fn serializes_response_with_original_and_compatibility_fields() {
        let response = OtoolsHostHttpResponseData {
            status: 200,
            status_text: "OK".to_string(),
            headers: vec![OtoolsHostHttpResponseHeader {
                key: "content-type".to_string(),
                value: "text/plain".to_string(),
            }],
            cookies: Vec::new(),
            elapsed_ms: 3,
            content_type: "text/plain".to_string(),
            size: 2,
            body_text: Some("ok".to_string()),
            body_base64: "b2s=".to_string(),
            is_image: false,
            file_name: "response.txt".to_string(),
            final_url: "http://localhost/".to_string(),
        };

        let value = response_to_value(&response).unwrap();

        assert_eq!(value["body_base64"], "b2s=");
        assert_eq!(value["bodyBase64"], "b2s=");
        assert_eq!(value["body"], "ok");
        assert_eq!(value["headers"][0]["key"], "content-type");
        assert_eq!(value["headers_map"]["content-type"], "text/plain");
    }
}

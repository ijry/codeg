use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use otools_core::catalog;
pub use otools_core::validate_plugin_id;
pub use otools_core::OtoolsPluginInfo;
use otools_core::{HostError, HostErrorCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtoolsManifest {
    uuid: Option<String>,
    packid: Option<String>,
    display_name: Option<String>,
    #[serde(alias = "displayNameCN")]
    display_name_cn: Option<String>,
    developer_name: Option<String>,
    summary: Option<String>,
    #[serde(default)]
    screenshots: Vec<String>,
    version: Option<String>,
    #[serde(
        rename = "minOToolsVersion",
        alias = "minOtoolsVersion",
        alias = "min_otools_version"
    )]
    min_otools_version: Option<String>,
    icon: Option<String>,
    #[serde(default)]
    key: Vec<String>,
    entry: Option<String>,
    preload: Option<String>,
    has_ad: Option<bool>,
    in_plugin_purchase: Option<bool>,
    dev_url: Option<String>,
    quick_dev: Option<bool>,
    source: Option<String>,
    open_in_browser: Option<bool>,
    autostart: Option<catalog::ToolPluginAutostart>,
    shutdown_hooks: Option<Vec<catalog::ToolPluginShutdownHook>>,
    #[serde(default, deserialize_with = "catalog::deserialize_plugin_permissions")]
    permissions: Vec<String>,
    enabled: Option<bool>,
    builtin: Option<bool>,
    native: Option<OtoolsNativeManifest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OtoolsNativeManifest {
    enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsAssetPayload {
    pub path: String,
    pub mime: String,
    pub data_base64: String,
    pub text: Option<String>,
}

pub async fn list_plugins() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    list_plugins_blocking()
}

pub async fn reload_all_plugins() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    // Disk-backed catalog has no process cache; re-scan roots and plugins file.
    list_plugins_blocking()
}

pub async fn get_plugin(plugin_uuid: String) -> Result<OtoolsPluginInfo, HostError> {
    get_plugin_blocking(&plugin_uuid)
}

pub fn list_lifecycle_plugins() -> Result<Vec<catalog::ToolPlugin>, HostError> {
    let mut plugins = catalog::load_merged_plugins()?;
    let mut seen = plugins
        .iter()
        .map(tool_plugin_identity)
        .collect::<HashSet<_>>();

    for root in plugin_roots() {
        if !root.exists() {
            continue;
        }
        for entry in fs::read_dir(&root).map_err(HostError::io)? {
            let entry = entry.map_err(HostError::io)?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(plugin) = read_tool_plugin_manifest(&path)? {
                let identity = tool_plugin_identity(&plugin);
                if seen.insert(identity) {
                    plugins.push(plugin);
                }
            }
        }
    }

    plugins.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(plugins)
}

pub fn tool_plugin_dispatch_id(plugin: &catalog::ToolPlugin) -> String {
    if plugin.uuid.trim().is_empty() {
        plugin.packid.trim().to_string()
    } else {
        plugin.uuid.trim().to_string()
    }
}

pub async fn get_plugin_asset(
    plugin_uuid: String,
    asset_path: String,
) -> Result<OtoolsAssetPayload, HostError> {
    let plugin = get_plugin_blocking(&plugin_uuid)?;
    if catalog::is_external_entry(&plugin.entry) {
        return load_external_plugin_asset(&plugin, &asset_path).await;
    }
    let path = resolve_plugin_asset_path(&plugin_uuid, &asset_path)?;
    let bytes = fs::read(&path).map_err(HostError::io)?;
    let mime = guess_mime(&path).to_string();
    let text = if is_text_mime(&mime) {
        Some(String::from_utf8_lossy(&bytes).to_string())
    } else {
        None
    };
    Ok(OtoolsAssetPayload {
        path: path.to_string_lossy().to_string(),
        mime,
        data_base64: BASE64_STANDARD.encode(bytes),
        text,
    })
}

pub fn resolve_plugin_asset_path(
    plugin_uuid: &str,
    asset_path: &str,
) -> Result<PathBuf, HostError> {
    let plugin = get_plugin_blocking(plugin_uuid)?;
    let root = plugin_root(&plugin.uuid)?;
    let relative = sanitize_relative_path(if asset_path.is_empty() {
        plugin.entry.as_str()
    } else {
        asset_path
    })?;
    let candidate = root.join(relative);
    let canonical_root = root.canonicalize().map_err(HostError::io)?;
    let canonical_file = candidate.canonicalize().map_err(HostError::io)?;
    if !canonical_file.starts_with(&canonical_root) || !canonical_file.is_file() {
        return Err(HostError::not_found("OTools asset not found"));
    }
    Ok(canonical_file)
}

pub fn plugin_roots() -> Vec<PathBuf> {
    catalog::local_plugin_roots()
}

pub fn plugins_file_path() -> PathBuf {
    catalog::plugins_file_path()
}

fn get_plugin_blocking(plugin_uuid: &str) -> Result<OtoolsPluginInfo, HostError> {
    let plugin_uuid = validate_plugin_id(plugin_uuid)?;
    list_plugins_blocking()?
        .into_iter()
        .find(|plugin| plugin.uuid == plugin_uuid || plugin.packid == plugin_uuid)
        .ok_or_else(|| HostError::not_found("OTools plugin not found"))
}

fn list_plugins_blocking() -> Result<Vec<OtoolsPluginInfo>, HostError> {
    let mut plugins = builtin_plugins();
    for plugin in catalog::read_plugins_file(&catalog::plugins_file_path())?
        .into_iter()
        .filter(|plugin| plugin.enabled)
        .map(catalog::tool_plugin_to_info)
    {
        if plugins
            .iter()
            .position(|existing| same_plugin_identity(existing, &plugin))
            .is_none()
        {
            plugins.push(plugin);
        }
    }
    for root in plugin_roots() {
        if !root.exists() {
            continue;
        }
        for entry in fs::read_dir(&root).map_err(HostError::io)? {
            let entry = entry.map_err(HostError::io)?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if let Some(plugin) = read_plugin_manifest(&path)? {
                if let Some(index) = plugins
                    .iter()
                    .position(|existing| same_plugin_identity(existing, &plugin))
                {
                    if plugins[index].source != "builtin" {
                        let source = plugins[index].source.clone();
                        plugins[index] = plugin;
                        if !source.trim().is_empty() {
                            plugins[index].source = source;
                        }
                    }
                } else {
                    plugins.push(plugin);
                }
            }
        }
    }
    plugins.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(plugins)
}

async fn load_external_plugin_asset(
    plugin: &OtoolsPluginInfo,
    asset_path: &str,
) -> Result<OtoolsAssetPayload, HostError> {
    let target = resolve_external_asset_url(&plugin.entry, asset_path)?;
    match target.scheme() {
        "http" | "https" => fetch_external_http_asset(target).await,
        "file" => read_external_file_asset(target),
        _ => Err(HostError::invalid_input(
            "Unsupported external OTools plugin asset URL",
        )),
    }
}

fn resolve_external_asset_url(entry: &str, asset_path: &str) -> Result<Url, HostError> {
    let base = Url::parse(entry).map_err(|error| {
        HostError::invalid_input("Invalid external OTools plugin entry")
            .with_detail(error.to_string())
    })?;
    let requested = asset_path.trim();
    let target = if requested.is_empty() || requested == entry {
        base.clone()
    } else {
        base.join(requested).map_err(|error| {
            HostError::invalid_input("Invalid external OTools plugin asset URL")
                .with_detail(error.to_string())
        })?
    };

    if !same_external_asset_scope(&base, &target) {
        return Err(HostError::new(
            HostErrorCode::PermissionDenied,
            "External OTools plugin assets must stay in the plugin entry scope",
        ));
    }
    Ok(target)
}

fn same_external_asset_scope(base: &Url, target: &Url) -> bool {
    if base.scheme() != target.scheme() {
        return false;
    }

    match base.scheme() {
        "http" | "https" => {
            base.host_str() == target.host_str()
                && base.port_or_known_default() == target.port_or_known_default()
        }
        "file" => file_asset_stays_under_entry_dir(base, target),
        _ => false,
    }
}

fn file_asset_stays_under_entry_dir(base: &Url, target: &Url) -> bool {
    let Ok(base_path) = base.to_file_path() else {
        return false;
    };
    let Ok(target_path) = target.to_file_path() else {
        return false;
    };
    let base_dir = if base_path.is_dir() {
        base_path
    } else {
        base_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    };
    let base_dir = base_dir.canonicalize().unwrap_or(base_dir);
    let target_path = target_path.canonicalize().unwrap_or(target_path);
    target_path.starts_with(base_dir)
}

async fn fetch_external_http_asset(target: Url) -> Result<OtoolsAssetPayload, HostError> {
    let response = otools_platform_http_client::otools_host_http_send(serde_json::json!({
        "method": "GET",
        "url": target.as_str(),
    }))
    .await?;
    let status = response.get("status").and_then(Value::as_u64).unwrap_or(0);
    if !(200..300).contains(&status) {
        return Err(HostError::task_execution_failed(format!(
            "Failed to load external OTools plugin asset ({status})"
        )));
    }
    let bytes = response
        .get("bodyBase64")
        .and_then(Value::as_str)
        .ok_or_else(|| HostError::task_execution_failed("Missing external asset body"))?;
    let bytes = BASE64_STANDARD.decode(bytes).map_err(|error| {
        HostError::task_execution_failed("Failed to decode external asset body")
            .with_detail(error.to_string())
    })?;
    let mime = response_header_value(&response, "content-type")
        .map(|value| value.split(';').next().unwrap_or(value).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| guess_mime(Path::new(target.path())).to_string());
    let text = if is_text_mime(&mime) {
        Some(String::from_utf8_lossy(&bytes).to_string())
    } else {
        None
    };
    Ok(OtoolsAssetPayload {
        path: target.to_string(),
        mime,
        data_base64: BASE64_STANDARD.encode(bytes),
        text,
    })
}

fn response_header_value<'a>(response: &'a Value, name: &str) -> Option<&'a str> {
    response
        .get("headersMap")
        .or_else(|| response.get("headers_map"))
        .and_then(Value::as_object)
        .and_then(|headers| {
            headers
                .iter()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .and_then(|(_, value)| value.as_str())
        })
        .or_else(|| {
            response
                .get("headers")
                .and_then(Value::as_array)
                .and_then(|headers| {
                    headers.iter().find_map(|header| {
                        let key = header.get("key").and_then(Value::as_str)?;
                        if key.eq_ignore_ascii_case(name) {
                            header.get("value").and_then(Value::as_str)
                        } else {
                            None
                        }
                    })
                })
        })
        .or_else(|| {
            response.get("headers").and_then(Value::as_object).and_then(|headers| {
                headers
                    .iter()
                    .find(|(key, _)| key.eq_ignore_ascii_case(name))
                    .and_then(|(_, value)| value.as_str())
            })
        })
}

fn read_external_file_asset(target: Url) -> Result<OtoolsAssetPayload, HostError> {
    let path = target
        .to_file_path()
        .map_err(|_| HostError::invalid_input("Invalid file OTools plugin asset URL"))?;
    let bytes = fs::read(&path).map_err(HostError::io)?;
    let mime = guess_mime(&path).to_string();
    let text = if is_text_mime(&mime) {
        Some(String::from_utf8_lossy(&bytes).to_string())
    } else {
        None
    };
    Ok(OtoolsAssetPayload {
        path: target.to_string(),
        mime,
        data_base64: BASE64_STANDARD.encode(bytes),
        text,
    })
}

fn same_plugin_identity(left: &OtoolsPluginInfo, right: &OtoolsPluginInfo) -> bool {
    left.uuid == right.uuid
        || left.uuid == right.packid
        || left.packid == right.uuid
        || left.packid == right.packid
}

fn builtin_plugins() -> Vec<OtoolsPluginInfo> {
    catalog::inner_plugins()
        .into_iter()
        .map(catalog::tool_plugin_to_info)
        .collect()
}

fn read_plugin_manifest(root: &Path) -> Result<Option<OtoolsPluginInfo>, HostError> {
    let Some(manifest_path) = catalog::resolve_plugin_manifest_path(root) else {
        return Ok(None);
    };
    let bytes = fs::read(&manifest_path).map_err(HostError::io)?;
    let manifest: OtoolsManifest = serde_json::from_slice(&bytes).map_err(|error| {
        HostError::configuration_invalid("Invalid OTools plugin manifest")
            .with_detail(format!("{}: {error}", manifest_path.display()))
    })?;
    let fallback_id = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("otools-plugin")
        .to_string();
    let uuid = validate_plugin_id(manifest.uuid.as_deref().unwrap_or(&fallback_id))?;
    let packid = validate_plugin_id(manifest.packid.as_deref().unwrap_or(&uuid))?;
    if manifest.enabled == Some(false) {
        return Ok(None);
    }
    let display_name = manifest
        .display_name
        .clone()
        .or_else(|| manifest.display_name_cn.clone())
        .unwrap_or_else(|| uuid.clone());
    let raw_entry = manifest
        .entry
        .as_deref()
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .unwrap_or("index.html");
    let (entry, asset_base_url) = if catalog::is_external_entry(raw_entry) {
        (raw_entry.to_string(), String::new())
    } else {
        (
            sanitize_relative_path(raw_entry)?
                .to_string_lossy()
                .replace('\\', "/"),
            format!("/otools-assets/{uuid}"),
        )
    };
    let quick_dev = manifest.quick_dev.filter(|value| *value);
    let source = catalog::normalize_plugin_source(
        manifest.source,
        manifest.builtin.unwrap_or(false),
        quick_dev.unwrap_or(false),
    );
    let native_enabled = manifest
        .native
        .and_then(|native| native.enabled)
        .unwrap_or(false);
    Ok(Some(OtoolsPluginInfo {
        uuid: uuid.clone(),
        packid,
        display_name,
        display_name_cn: manifest.display_name_cn,
        developer_name: manifest.developer_name,
        summary: manifest.summary,
        screenshots: normalize_manifest_string_list(manifest.screenshots),
        version: manifest.version,
        min_otools_version: manifest.min_otools_version,
        icon: manifest.icon,
        key: normalize_manifest_string_list(manifest.key),
        entry,
        preload: normalize_manifest_optional_string(manifest.preload),
        has_ad: manifest.has_ad.unwrap_or(false),
        in_plugin_purchase: manifest.in_plugin_purchase.unwrap_or(false),
        dev_url: normalize_manifest_optional_string(manifest.dev_url),
        quick_dev,
        open_in_browser: manifest.open_in_browser.unwrap_or(false),
        native_enabled,
        permissions: manifest.permissions,
        autostart: manifest.autostart,
        shutdown_hooks: manifest.shutdown_hooks,
        enabled: true,
        builtin: manifest.builtin,
        source,
        asset_base_url,
    }))
}

fn read_tool_plugin_manifest(root: &Path) -> Result<Option<catalog::ToolPlugin>, HostError> {
    let Some(manifest_path) = catalog::resolve_plugin_manifest_path(root) else {
        return Ok(None);
    };
    let value = catalog::read_json_file::<Value>(&manifest_path)?;
    let mut plugin = serde_json::from_value::<catalog::ToolPlugin>(value).map_err(|error| {
        HostError::configuration_invalid("Invalid OTools plugin manifest")
            .with_detail(format!("{}: {error}", manifest_path.display()))
    })?;
    if plugin.uuid.trim().is_empty() {
        plugin.uuid = plugin.packid.clone();
    }
    Ok(catalog::normalize_plugin(plugin).filter(|plugin| plugin.enabled))
}

fn tool_plugin_identity(plugin: &catalog::ToolPlugin) -> String {
    tool_plugin_dispatch_id(plugin).to_ascii_lowercase()
}

fn normalize_manifest_string_list(items: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for item in items {
        let value = item.trim();
        if value.is_empty()
            || normalized
                .iter()
                .any(|existing: &String| existing.as_str() == value)
        {
            continue;
        }
        normalized.push(value.to_string());
    }
    normalized
}

fn normalize_manifest_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn plugin_root(plugin_uuid: &str) -> Result<PathBuf, HostError> {
    let plugin = get_plugin_blocking(plugin_uuid)?;
    if catalog::is_external_entry(&plugin.entry) {
        return Err(HostError::not_found(
            "OTools plugin does not have a local asset root",
        ));
    }
    for root in plugin_roots() {
        for id in [&plugin.uuid, &plugin.packid] {
            if id.trim().is_empty() {
                continue;
            }
            let candidate = root.join(id);
            if let Some(adapter_root) = catalog::resolve_plugin_adapter_root(&candidate) {
                return Ok(adapter_root);
            }
        }
    }
    Err(HostError::not_found("OTools plugin not found"))
}

fn sanitize_relative_path(value: &str) -> Result<PathBuf, HostError> {
    let path = Path::new(value.trim_start_matches('/'));
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(HostError::invalid_input("Invalid OTools asset path"));
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => return Err(HostError::invalid_input("Invalid OTools asset path")),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(HostError::invalid_input("Invalid OTools asset path"));
    }
    Ok(clean)
}

fn guess_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") | Some("htm") => "text/html",
        Some("js") | Some("mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("md") | Some("txt") | Some("log") => "text/plain",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn is_text_mime(mime: &str) -> bool {
    mime.starts_with("text/")
        || matches!(
            mime,
            "application/json" | "application/javascript" | "application/xml"
        )
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
    }

    #[test]
    fn sanitize_relative_path_rejects_parent_traversal() {
        assert!(sanitize_relative_path("../index.html").is_err());
        assert!(sanitize_relative_path("assets/../../index.html").is_err());
    }

    #[test]
    fn sanitize_relative_path_normalizes_plugin_assets() {
        assert_eq!(
            sanitize_relative_path("/assets/./main.js").expect("asset path"),
            PathBuf::from("assets").join("main.js")
        );
    }

    #[test]
    fn external_http_assets_stay_on_same_origin() {
        let base = Url::parse("https://example.test/plugin/index.html").expect("base url");
        let same = Url::parse("https://example.test/plugin/app.js").expect("same url");
        let other = Url::parse("https://other.test/plugin/app.js").expect("other url");

        assert!(same_external_asset_scope(&base, &same));
        assert!(!same_external_asset_scope(&base, &other));
    }
}

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use url::Url;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use otools_core::catalog::{self, ToolPlugin};
use otools_core::{HostError, HostErrorCode};

const DEV_STATE_FILE_VERSION: u64 = 1;
const DEV_LOCAL_STATE_FILE_VERSION: u64 = 1;
const DEV_DOCS_URL: &str = "https://otools.lingyun.net/guide/overview";
const DEFAULT_PACK_INCLUDES: [&str; 5] = ["plugin.json", "logo.png", "logo.svg", "dist", "lib"];
const REQUIRED_PACK_FILES: [&str; 1] = ["plugin.json"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevVersionRecord {
    pub id: String,
    pub version: String,
    pub changelog: String,
    pub download_url: String,
    pub published_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginRecord {
    pub uuid: String,
    pub icon: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    pub dev_url: String,
    pub has_ad: bool,
    pub in_plugin_purchase: bool,
    pub agreement_accepted: bool,
    pub created_at: String,
    pub updated_at: String,
    pub debug_enabled: bool,
    pub directory_bound: bool,
    pub bound_directory_path: String,
    pub plugin_manifest_path: String,
    pub pack_file_path: String,
    pub version_records: Vec<DevVersionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginInput {
    pub icon: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    pub dev_url: String,
    pub has_ad: bool,
    pub in_plugin_purchase: bool,
    pub agreement_accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginUpdateInput {
    pub uuid: String,
    pub meta: DevPluginInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevBindDirectoryInput {
    pub uuid: String,
    pub directory_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPublishVersionInput {
    pub uuid: String,
    pub version: String,
    pub changelog: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevWorkspace {
    pub meta_state_file_path: String,
    pub binding_state_file_path: String,
    pub packs_dir: String,
    pub docs_url: String,
    pub items: Vec<DevPluginRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeBuildJobStart {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeBuildJobSnapshot {
    pub job_id: String,
    pub running: bool,
    pub success: Option<bool>,
    pub log: String,
    pub message: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevPluginActionResult {
    pub message: String,
    pub item: DevPluginRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DevNativeConfig {
    pub enabled: bool,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevPluginMetaRecord {
    uuid: String,
    icon: String,
    packid: String,
    display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    display_name_cn: Option<String>,
    developer_name: String,
    summary: String,
    screenshots: Vec<String>,
    version: String,
    dev_url: String,
    has_ad: bool,
    in_plugin_purchase: bool,
    agreement_accepted: bool,
    created_at: String,
    updated_at: String,
    version_records: Vec<DevVersionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevPluginBindingRecord {
    uuid: String,
    directory_path: String,
    plugin_manifest_path: String,
    bound_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevMetaStateFile {
    version: u64,
    items: Vec<DevPluginMetaRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevBindingStateFile {
    version: u64,
    items: Vec<DevPluginBindingRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RepoPluginPackConfig {
    includes: Vec<String>,
    excludes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RepoPluginManifest {
    uuid: String,
    icon: String,
    packid: String,
    display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    display_name_cn: Option<String>,
    developer_name: String,
    summary: String,
    screenshots: Vec<String>,
    version: String,
    dev_url: String,
    has_ad: bool,
    in_plugin_purchase: bool,
    entry: String,
    pack: RepoPluginPackConfig,
}

#[derive(Debug, Default)]
struct DevNativeBuildJobState {
    running: bool,
    success: Option<bool>,
    log: String,
    message: String,
    error: String,
}

type DevNativeBuildJobs = Arc<Mutex<HashMap<String, Arc<Mutex<DevNativeBuildJobState>>>>>;

static DEV_NATIVE_BUILD_JOBS: OnceLock<DevNativeBuildJobs> = OnceLock::new();

fn dev_native_build_jobs() -> &'static DevNativeBuildJobs {
    DEV_NATIVE_BUILD_JOBS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn dev_meta_state_path() -> PathBuf {
    catalog::plugin_sync_state_path("dev")
}

fn dev_binding_state_path() -> PathBuf {
    catalog::dev_local_root_dir().join("state.json")
}

fn dev_packs_dir() -> PathBuf {
    catalog::dev_local_root_dir().join("packs")
}

fn native_platform_lib_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS.dylib"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows.dll"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux.so"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "native.so"
    }
}

fn now_text() -> String {
    Local::now().to_rfc3339()
}

fn sanitize_packid(raw: &str) -> String {
    let mut normalized = String::with_capacity(raw.len());
    for item in raw.trim().chars() {
        if item.is_ascii_alphanumeric() {
            normalized.push(item.to_ascii_lowercase());
        } else if matches!(item, '-' | '_' | '.') {
            normalized.push('-');
        }
    }
    normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

fn host_error(message: impl Into<String>) -> HostError {
    HostError::new(HostErrorCode::TaskExecutionFailed, message)
}

fn is_https_image_url(raw: &str) -> bool {
    let text = raw.trim();
    if text.is_empty() {
        return false;
    }
    let Ok(parsed) = Url::parse(text) else {
        return false;
    };
    if !parsed.scheme().eq_ignore_ascii_case("https") {
        return false;
    }
    let path = parsed.path().to_ascii_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico", ".avif",
    ]
    .iter()
    .any(|suffix| path.ends_with(suffix))
}

fn is_short_text_icon(raw: &str) -> bool {
    let text = raw.trim();
    !text.is_empty()
        && !text.starts_with("http://")
        && !text.starts_with("https://")
        && text.chars().count() <= 4
}

fn is_valid_plugin_icon(raw: &str) -> bool {
    let text = raw.trim();
    !text.is_empty()
        && (text.starts_with("@builtin:") || is_https_image_url(text) || is_short_text_icon(text))
}

fn dedupe_string_list(items: &[String]) -> Vec<String> {
    let mut seen = HashSet::<String>::new();
    let mut output = Vec::new();
    for item in items {
        let value = item.trim().to_string();
        if value.is_empty() {
            continue;
        }
        if seen.insert(value.to_lowercase()) {
            output.push(value);
        }
    }
    output
}

fn package_name_from_pack_id(packid: &str) -> String {
    let normalized = sanitize_packid(packid);
    if normalized.is_empty() {
        "otools-dev-plugin".to_string()
    } else {
        normalized
    }
}

fn normalize_dev_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:5173".to_string();
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("file://")
    {
        return trimmed.trim_end_matches('/').to_string();
    }
    let base = trimmed
        .split(|item| item == '?' || item == '#')
        .next()
        .unwrap_or(trimmed);
    let first_segment = base.split('/').next().unwrap_or(base);
    let is_windows_drive = first_segment.len() >= 2
        && first_segment.as_bytes()[1] == b':'
        && first_segment.as_bytes()[0].is_ascii_alphabetic();
    let is_html_like =
        base.to_ascii_lowercase().ends_with(".html") || base.to_ascii_lowercase().ends_with(".htm");
    let is_ip_like = first_segment
        .chars()
        .all(|item| item.is_ascii_digit() || item == '.')
        && first_segment.contains('.');
    let host_hint = first_segment.eq_ignore_ascii_case("localhost")
        || first_segment.contains(':')
        || is_ip_like;
    if host_hint && !is_windows_drive && !is_html_like {
        return format!("http://{trimmed}")
            .trim_end_matches('/')
            .to_string();
    }
    trimmed.to_string()
}

fn path_to_file_url(path: &Path) -> Result<String, HostError> {
    let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Url::from_file_path(canonical)
        .map(|url| url.to_string())
        .map_err(|_| HostError::invalid_input(format!("无法转换文件 URL: {}", path.display())))
}

fn resolve_bound_plugin_root(directory_path: &str) -> Result<PathBuf, HostError> {
    catalog::resolve_plugin_adapter_root(Path::new(directory_path.trim())).ok_or_else(|| {
        HostError::not_found(format!("无法解析插件根目录: {}", directory_path.trim()))
    })
}

fn read_bound_manifest_map(uuid: &str) -> Option<Map<String, Value>> {
    let binding_items = read_binding_state(&dev_binding_state_path()).ok()?;
    let binding = binding_items.iter().find(|item| item.uuid == uuid)?;
    let manifest_path = if binding.plugin_manifest_path.trim().is_empty() {
        catalog::resolve_plugin_manifest_path(Path::new(binding.directory_path.trim()))?
    } else {
        PathBuf::from(binding.plugin_manifest_path.trim())
    };
    match catalog::read_json_file::<Value>(&manifest_path).ok()? {
        Value::Object(map) => Some(map),
        _ => None,
    }
}

fn resolve_bound_manifest_quick_dev(meta: &DevPluginMetaRecord) -> bool {
    read_bound_manifest_map(&meta.uuid)
        .and_then(|map| map.get("quickDev").and_then(Value::as_bool))
        .unwrap_or(false)
}

fn resolve_debug_dev_url(meta: &DevPluginMetaRecord) -> String {
    let raw = meta.dev_url.trim();
    if raw.is_empty() {
        return raw.to_string();
    }
    let lower = raw.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("file://")
    {
        return raw.to_string();
    }
    let Some(binding) = read_binding_state(&dev_binding_state_path())
        .ok()
        .and_then(|items| items.into_iter().find(|item| item.uuid == meta.uuid))
    else {
        return raw.to_string();
    };
    let Ok(base_dir) = resolve_bound_plugin_root(&binding.directory_path) else {
        return raw.to_string();
    };
    let (path_part, suffix) = if let Some(pos) = raw.find('?').or_else(|| raw.find('#')) {
        (&raw[..pos], &raw[pos..])
    } else {
        (raw, "")
    };
    let candidate = PathBuf::from(path_part);
    let target_path = if candidate.is_absolute() {
        candidate
    } else {
        base_dir.join(candidate)
    };
    path_to_file_url(&target_path)
        .map(|mut url| {
            url.push_str(suffix);
            url
        })
        .unwrap_or_else(|_| raw.to_string())
}

fn pack_file_path_for(packid: &str, version: &str) -> PathBuf {
    dev_packs_dir().join(format!(
        "{}-{}.oplg",
        package_name_from_pack_id(packid),
        version.trim()
    ))
}

fn build_default_version_record(version: &str) -> DevVersionRecord {
    DevVersionRecord {
        id: format!("local-{}", sanitize_packid(version)),
        version: version.trim().to_string(),
        changelog: "本地版本记录".to_string(),
        download_url: String::new(),
        published_at: now_text(),
        status: "local".to_string(),
    }
}

fn normalize_version_records(
    current_version: &str,
    items: &[DevVersionRecord],
) -> Vec<DevVersionRecord> {
    let mut output = items
        .iter()
        .filter_map(|item| {
            let version = item.version.trim();
            if version.is_empty() {
                return None;
            }
            Some(DevVersionRecord {
                id: if item.id.trim().is_empty() {
                    Uuid::new_v4().to_string()
                } else {
                    item.id.trim().to_string()
                },
                version: version.to_string(),
                changelog: item.changelog.trim().to_string(),
                download_url: item.download_url.trim().to_string(),
                published_at: if item.published_at.trim().is_empty() {
                    now_text()
                } else {
                    item.published_at.trim().to_string()
                },
                status: if item.status.trim().is_empty() {
                    "published".to_string()
                } else {
                    item.status.trim().to_string()
                },
            })
        })
        .collect::<Vec<_>>();
    if output.is_empty() {
        output.push(build_default_version_record(current_version));
    } else if !output
        .iter()
        .any(|item| item.version.eq_ignore_ascii_case(current_version.trim()))
    {
        output.insert(0, build_default_version_record(current_version));
    }
    output.sort_by(|left, right| right.published_at.cmp(&left.published_at));
    output
}

fn normalize_meta(input: DevPluginInput) -> Result<DevPluginInput, HostError> {
    let packid = sanitize_packid(&input.packid);
    if packid.is_empty() {
        return Err(HostError::invalid_input(
            "Pack ID 不能为空，仅支持字母、数字、-、_、.",
        ));
    }
    let icon = input.icon.trim().to_string();
    if !is_valid_plugin_icon(&icon) {
        return Err(HostError::invalid_input(
            "插件图标必须是 https 图片地址、@builtin 标记，或 1-4 个字符的短图标",
        ));
    }
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(HostError::invalid_input("插件显示名称不能为空"));
    }
    let developer_name = input.developer_name.trim().to_string();
    if developer_name.is_empty() {
        return Err(HostError::invalid_input("开发者显示名称不能为空"));
    }
    let screenshots = dedupe_string_list(&input.screenshots);
    for screenshot in &screenshots {
        if !is_https_image_url(screenshot) {
            return Err(HostError::invalid_input(format!(
                "插件截图必须是 https 开头的图片地址: {screenshot}"
            )));
        }
    }
    Ok(DevPluginInput {
        icon,
        packid,
        display_name,
        display_name_cn: input
            .display_name_cn
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        developer_name,
        summary: input.summary.trim().to_string(),
        screenshots,
        version: if input.version.trim().is_empty() {
            "0.1.0".to_string()
        } else {
            input.version.trim().to_string()
        },
        dev_url: normalize_dev_url(&input.dev_url),
        has_ad: input.has_ad,
        in_plugin_purchase: input.in_plugin_purchase,
        agreement_accepted: input.agreement_accepted,
    })
}

fn build_meta_record(
    uuid: &str,
    meta: &DevPluginInput,
    existing: Option<&DevPluginMetaRecord>,
) -> DevPluginMetaRecord {
    DevPluginMetaRecord {
        uuid: uuid.to_string(),
        icon: meta.icon.clone(),
        packid: meta.packid.clone(),
        display_name: meta.display_name.clone(),
        display_name_cn: meta.display_name_cn.clone(),
        developer_name: meta.developer_name.clone(),
        summary: meta.summary.clone(),
        screenshots: meta.screenshots.clone(),
        version: meta.version.clone(),
        dev_url: meta.dev_url.clone(),
        has_ad: meta.has_ad,
        in_plugin_purchase: meta.in_plugin_purchase,
        agreement_accepted: meta.agreement_accepted,
        created_at: existing
            .map(|item| item.created_at.clone())
            .unwrap_or_else(now_text),
        updated_at: now_text(),
        version_records: normalize_version_records(
            &meta.version,
            &existing
                .map(|item| item.version_records.clone())
                .unwrap_or_default(),
        ),
    }
}

fn build_debug_plugin_entry(meta: &DevPluginMetaRecord) -> ToolPlugin {
    ToolPlugin {
        uuid: meta.uuid.clone(),
        packid: meta.packid.clone(),
        display_name: meta.display_name.clone(),
        display_name_cn: meta.display_name_cn.clone(),
        developer_name: meta.developer_name.clone(),
        summary: meta.summary.clone(),
        screenshots: meta.screenshots.clone(),
        version: meta.version.clone(),
        icon: meta.icon.clone(),
        key: vec![
            meta.packid.clone(),
            meta.display_name.clone(),
            meta.developer_name.clone(),
            "dev".to_string(),
            "plugin".to_string(),
        ],
        entry: resolve_debug_dev_url(meta),
        quick_dev: resolve_bound_manifest_quick_dev(meta).then_some(true),
        source: Some(catalog::dev_debug_source().to_string()),
        open_in_browser: Some(false),
        ..ToolPlugin::default()
    }
}

fn build_workspace_item(
    meta: &DevPluginMetaRecord,
    binding: Option<&DevPluginBindingRecord>,
    debug_enabled: bool,
) -> DevPluginRecord {
    DevPluginRecord {
        uuid: meta.uuid.clone(),
        icon: meta.icon.clone(),
        packid: meta.packid.clone(),
        display_name: meta.display_name.clone(),
        display_name_cn: meta.display_name_cn.clone(),
        developer_name: meta.developer_name.clone(),
        summary: meta.summary.clone(),
        screenshots: meta.screenshots.clone(),
        version: meta.version.clone(),
        dev_url: meta.dev_url.clone(),
        has_ad: meta.has_ad,
        in_plugin_purchase: meta.in_plugin_purchase,
        agreement_accepted: meta.agreement_accepted,
        created_at: meta.created_at.clone(),
        updated_at: meta.updated_at.clone(),
        debug_enabled,
        directory_bound: binding.is_some(),
        bound_directory_path: binding
            .map(|item| item.directory_path.clone())
            .unwrap_or_default(),
        plugin_manifest_path: binding
            .map(|item| item.plugin_manifest_path.clone())
            .unwrap_or_default(),
        pack_file_path: pack_file_path_for(&meta.packid, &meta.version)
            .to_string_lossy()
            .to_string(),
        version_records: normalize_version_records(&meta.version, &meta.version_records),
    }
}

fn read_meta_state(path: &Path) -> Result<Vec<DevPluginMetaRecord>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &DevMetaStateFile {
                version: DEV_STATE_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = catalog::read_json_file::<Value>(path)?;
    match value {
        Value::Object(_) => serde_json::from_value::<DevMetaStateFile>(value)
            .map(|file| file.items)
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools dev state")
                    .with_detail(format!("{}: {error}", path.display()))
            }),
        Value::Array(array) => Ok(array
            .into_iter()
            .filter_map(|item| serde_json::from_value::<DevPluginMetaRecord>(item).ok())
            .collect()),
        _ => Ok(Vec::new()),
    }
}

fn write_meta_state(path: &Path, items: &[DevPluginMetaRecord]) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &DevMetaStateFile {
            version: DEV_STATE_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

fn read_binding_state(path: &Path) -> Result<Vec<DevPluginBindingRecord>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &DevBindingStateFile {
                version: DEV_LOCAL_STATE_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = catalog::read_json_file::<Value>(path)?;
    match value {
        Value::Object(_) => serde_json::from_value::<DevBindingStateFile>(value)
            .map(|file| file.items)
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools dev binding state")
                    .with_detail(format!("{}: {error}", path.display()))
            }),
        Value::Array(array) => Ok(array
            .into_iter()
            .filter_map(|item| serde_json::from_value::<DevPluginBindingRecord>(item).ok())
            .collect()),
        _ => Ok(Vec::new()),
    }
}

fn write_binding_state(path: &Path, items: &[DevPluginBindingRecord]) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &DevBindingStateFile {
            version: DEV_LOCAL_STATE_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

fn ensure_dev_workspace() -> Result<(), HostError> {
    catalog::ensure_dir_exists(&catalog::dev_local_root_dir())?;
    catalog::ensure_dir_exists(&dev_packs_dir())?;
    let _ = read_meta_state(&dev_meta_state_path())?;
    let _ = read_binding_state(&dev_binding_state_path())?;
    Ok(())
}

fn load_workspace_items() -> Result<Vec<DevPluginRecord>, HostError> {
    let meta_items = read_meta_state(&dev_meta_state_path())?;
    let binding_items = read_binding_state(&dev_binding_state_path())?;
    let mut output = Vec::with_capacity(meta_items.len());
    for meta in &meta_items {
        let binding = binding_items.iter().find(|item| item.uuid == meta.uuid);
        output.push(build_workspace_item(
            meta,
            binding,
            catalog::is_debug_registered(&meta.uuid)?,
        ));
    }
    output.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(output)
}

fn find_workspace_item(uuid: &str) -> Result<DevPluginRecord, HostError> {
    load_workspace_items()?
        .into_iter()
        .find(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))
}

fn validate_bound_directory(directory_path: &str) -> Result<(String, String), HostError> {
    let trimmed = directory_path.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input("请选择开发目录"));
    }
    let directory = PathBuf::from(trimmed);
    if !directory.exists() || !directory.is_dir() {
        return Err(HostError::not_found(format!(
            "开发目录不存在: {}",
            directory.display()
        )));
    }
    let manifest_path = catalog::resolve_plugin_manifest_path(&directory).ok_or_else(|| {
        HostError::not_found(format!(
            "绑定失败，目录中必须包含 plugin.json 或 otools/plugin.json: {}",
            directory.display()
        ))
    })?;
    Ok((
        directory.to_string_lossy().to_string(),
        manifest_path.to_string_lossy().to_string(),
    ))
}

fn update_bound_manifest_basic_fields(
    uuid: &str,
    meta: &DevPluginMetaRecord,
) -> Result<(), HostError> {
    let Some(mut map) = read_bound_manifest_map(uuid) else {
        return Ok(());
    };
    map.insert("uuid".to_string(), Value::String(meta.uuid.clone()));
    map.insert("packid".to_string(), Value::String(meta.packid.clone()));
    map.insert(
        "displayName".to_string(),
        Value::String(meta.display_name.clone()),
    );
    if let Some(display_name_cn) = &meta.display_name_cn {
        map.insert(
            "displayNameCN".to_string(),
            Value::String(display_name_cn.clone()),
        );
    }
    map.insert(
        "developerName".to_string(),
        Value::String(meta.developer_name.clone()),
    );
    map.insert("summary".to_string(), Value::String(meta.summary.clone()));
    map.insert("version".to_string(), Value::String(meta.version.clone()));
    map.insert("icon".to_string(), Value::String(meta.icon.clone()));

    let bindings = read_binding_state(&dev_binding_state_path())?;
    if let Some(binding) = bindings.iter().find(|item| item.uuid == uuid) {
        catalog::write_json_file(
            Path::new(&binding.plugin_manifest_path),
            &Value::Object(map),
        )?;
    }
    Ok(())
}

fn parse_host_port_from_dev_url(dev_url: &str) -> (String, u16) {
    let url = normalize_dev_url(dev_url);
    if let Ok(parsed) = Url::parse(&url) {
        let host = parsed.host_str().unwrap_or("127.0.0.1").to_string();
        let port = parsed.port_or_known_default().unwrap_or(5173);
        return (host, port);
    }
    ("127.0.0.1".to_string(), 5173)
}

fn write_if_missing(path: &Path, content: &str) -> Result<(), HostError> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    fs::write(path, content).map_err(HostError::io)
}

fn manifest_path_for_uuid(uuid: &str) -> Result<PathBuf, HostError> {
    let binding_items = read_binding_state(&dev_binding_state_path())?;
    binding_items
        .into_iter()
        .find(|item| item.uuid == uuid.trim())
        .map(|item| PathBuf::from(item.plugin_manifest_path))
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))
}

fn read_native_enabled_from_value(value: &Value) -> bool {
    let Value::Object(map) = value else {
        return false;
    };
    match map.get("native") {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Object(native_map)) => native_map
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        _ => false,
    }
}

fn update_native_enabled_in_map(map: &mut Map<String, Value>, enabled: bool) {
    match map.get_mut("native") {
        Some(Value::Object(native_map)) => {
            native_map.insert("enabled".to_string(), Value::Bool(enabled));
        }
        _ => {
            map.insert(
                "native".to_string(),
                serde_json::json!({ "enabled": enabled }),
            );
        }
    }
}

fn read_repo_plugin_manifest(path: &Path) -> Result<RepoPluginManifest, HostError> {
    let value = catalog::read_json_file::<Value>(path)?;
    serde_json::from_value(value).map_err(|error| {
        HostError::configuration_invalid("Invalid plugin.json")
            .with_detail(format!("{}: {error}", path.display()))
    })
}

fn normalize_manifest_entry(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("./")
        .trim_start_matches('/')
        .replace('\\', "/")
}

fn normalize_pack_pattern(raw: &str) -> Result<String, HostError> {
    let value = raw.trim().trim_start_matches("./").trim_start_matches('/');
    if value.is_empty()
        || value.contains("..")
        || Path::new(value).is_absolute()
        || value.starts_with('\\')
    {
        return Err(HostError::invalid_input(format!("非法打包路径: {raw}")));
    }
    Ok(value.replace('\\', "/"))
}

fn build_pack_file_entries(
    plugin_root: &Path,
    manifest_path: &Path,
) -> Result<Vec<(PathBuf, String)>, HostError> {
    let manifest = read_repo_plugin_manifest(manifest_path)?;
    let mut includes = manifest.pack.includes;
    if includes.is_empty() {
        includes = DEFAULT_PACK_INCLUDES
            .iter()
            .map(|item| item.to_string())
            .collect();
    }
    let excludes = manifest
        .pack
        .excludes
        .iter()
        .filter_map(|item| normalize_pack_pattern(item).ok())
        .collect::<Vec<_>>();
    let mut entries = Vec::<(PathBuf, String)>::new();
    for include in includes {
        let normalized = normalize_pack_pattern(&include)?;
        let target = plugin_root.join(&normalized);
        if !target.exists() {
            continue;
        }
        if target.is_file() {
            entries.push((target, normalized));
            continue;
        }
        for walk_entry in WalkDir::new(&target).into_iter().flatten() {
            let path = walk_entry.path();
            if !path.is_file() {
                continue;
            }
            let relative = path
                .strip_prefix(plugin_root)
                .map_err(|error| HostError::invalid_input(error.to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            if excludes.iter().any(|exclude| relative.starts_with(exclude)) {
                continue;
            }
            entries.push((path.to_path_buf(), relative));
        }
    }
    for required in REQUIRED_PACK_FILES {
        if !entries.iter().any(|(_, relative)| relative == required) {
            return Err(HostError::not_found(format!(
                "打包缺少必要文件: {required}"
            )));
        }
    }
    let entry = normalize_manifest_entry(&manifest.entry);
    if !entry.is_empty() && !catalog::is_external_entry(&entry) {
        let entry_exists = entries.iter().any(|(_, relative)| relative == &entry);
        if !entry_exists {
            return Err(HostError::not_found(format!("打包缺少入口文件: {entry}")));
        }
    }
    entries.sort_by(|left, right| left.1.cmp(&right.1));
    Ok(entries)
}

fn write_zip_pack(entries: &[(PathBuf, String)], target: &Path) -> Result<(), HostError> {
    if let Some(parent) = target.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    let file = fs::File::create(target).map_err(HostError::io)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (path, relative) in entries {
        zip.start_file(relative, options)
            .map_err(|error| host_error(error.to_string()))?;
        let mut file = fs::File::open(path).map_err(HostError::io)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(HostError::io)?;
        zip.write_all(&buffer).map_err(HostError::io)?;
    }
    zip.finish()
        .map(|_| ())
        .map_err(|error| host_error(error.to_string()))
}

fn native_dir_for_uuid(uuid: &str) -> Result<PathBuf, HostError> {
    let bindings = read_binding_state(&dev_binding_state_path())?;
    let binding = bindings
        .into_iter()
        .find(|item| item.uuid == uuid.trim())
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    Ok(resolve_bound_plugin_root(&binding.directory_path)?.join("native"))
}

fn latest_native_artifact(native_dir: &Path) -> Result<PathBuf, HostError> {
    let release_dir = native_dir.join("target").join("release");
    let extensions = if cfg!(target_os = "windows") {
        vec!["dll"]
    } else if cfg!(target_os = "macos") {
        vec!["dylib"]
    } else {
        vec!["so"]
    };
    fs::read_dir(&release_dir)
        .map_err(HostError::io)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|ext| extensions.iter().any(|item| item.eq_ignore_ascii_case(ext)))
        })
        .max_by_key(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok())
        .ok_or_else(|| HostError::not_found("未找到 cargo release 产物"))
}

fn build_native_artifact(native_dir: &Path, copy_to_plugin_lib: bool) -> Result<String, HostError> {
    if !native_dir.join("Cargo.toml").is_file() {
        return Err(HostError::not_found(format!(
            "原生工程不存在: {}",
            native_dir.display()
        )));
    }
    let output = Command::new("cargo")
        .args(["build", "--release"])
        .current_dir(native_dir)
        .output()
        .map_err(HostError::io)?;
    let mut log = String::new();
    log.push_str(&String::from_utf8_lossy(&output.stdout));
    log.push_str(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(host_error(format!("原生插件构建失败\n{log}")));
    }
    let artifact = latest_native_artifact(native_dir)?;
    if copy_to_plugin_lib {
        let plugin_root = native_dir
            .parent()
            .ok_or_else(|| HostError::not_found("无法解析插件根目录"))?;
        let lib_dir = plugin_root.join("lib");
        catalog::ensure_dir_exists(&lib_dir)?;
        fs::copy(&artifact, lib_dir.join(native_platform_lib_name())).map_err(HostError::io)?;
    }
    Ok(format!("原生插件构建完成: {}", artifact.display()))
}

pub async fn dev_get_workspace() -> Result<DevWorkspace, HostError> {
    ensure_dev_workspace()?;
    Ok(DevWorkspace {
        meta_state_file_path: dev_meta_state_path().to_string_lossy().to_string(),
        binding_state_file_path: dev_binding_state_path().to_string_lossy().to_string(),
        packs_dir: dev_packs_dir().to_string_lossy().to_string(),
        docs_url: DEV_DOCS_URL.to_string(),
        items: load_workspace_items()?,
    })
}

pub async fn dev_create_plugin(input: DevPluginInput) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace()?;
    let meta = normalize_meta(input)?;
    if !meta.agreement_accepted {
        return Err(HostError::invalid_input("请先同意开发者协议"));
    }
    let path = dev_meta_state_path();
    let mut items = read_meta_state(&path)?;
    if items
        .iter()
        .any(|item| item.packid.eq_ignore_ascii_case(&meta.packid))
    {
        return Err(HostError::new(
            HostErrorCode::AlreadyExists,
            format!("Pack ID 已存在: {}", meta.packid),
        ));
    }
    let uuid = Uuid::new_v4().to_string();
    let record = build_meta_record(&uuid, &meta, None);
    items.push(record);
    write_meta_state(&path, &items)?;
    Ok(DevPluginActionResult {
        message: format!("开发插件 {} 已创建", meta.display_name),
        item: find_workspace_item(&uuid)?,
    })
}

pub async fn dev_update_plugin(
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace()?;
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let meta = normalize_meta(input.meta)?;
    let path = dev_meta_state_path();
    let mut items = read_meta_state(&path)?;
    let current_index = items
        .iter()
        .position(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    if items.iter().enumerate().any(|(index, item)| {
        index != current_index && item.packid.eq_ignore_ascii_case(&meta.packid)
    }) {
        return Err(HostError::new(
            HostErrorCode::AlreadyExists,
            format!("Pack ID 已存在: {}", meta.packid),
        ));
    }
    let previous = items[current_index].clone();
    let next = build_meta_record(&uuid, &meta, Some(&previous));
    update_bound_manifest_basic_fields(&uuid, &next)?;
    items[current_index] = next.clone();
    write_meta_state(&path, &items)?;
    if catalog::is_debug_registered(&previous.uuid)? {
        if previous.packid != next.packid {
            let _ = catalog::remove_external_plugin_by_uuid(&previous.uuid, true)?;
        }
        let _ = catalog::upsert_external_plugin(build_debug_plugin_entry(&next))?;
    }
    Ok(DevPluginActionResult {
        message: format!("插件 {} 基础信息已保存", next.display_name),
        item: find_workspace_item(&uuid)?,
    })
}

pub async fn dev_bind_plugin_directory(
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace()?;
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let (directory_path, manifest_path) = validate_bound_directory(&input.directory_path)?;
    let meta_items = read_meta_state(&dev_meta_state_path())?;
    if !meta_items.iter().any(|item| item.uuid == uuid) {
        return Err(HostError::not_found("未找到对应的开发插件"));
    }
    let path = dev_binding_state_path();
    let mut bindings = read_binding_state(&path)?;
    if let Some(existing) = bindings.iter_mut().find(|item| item.uuid == uuid) {
        existing.directory_path = directory_path.clone();
        existing.plugin_manifest_path = manifest_path.clone();
        existing.updated_at = now_text();
    } else {
        bindings.push(DevPluginBindingRecord {
            uuid: uuid.clone(),
            directory_path: directory_path.clone(),
            plugin_manifest_path: manifest_path.clone(),
            bound_at: now_text(),
            updated_at: now_text(),
        });
    }
    write_binding_state(&path, &bindings)?;
    Ok(DevPluginActionResult {
        message: format!("已绑定开发目录: {directory_path}"),
        item: find_workspace_item(&uuid)?,
    })
}

pub async fn dev_enable_debug(uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace()?;
    let normalized_uuid = uuid.trim().to_string();
    let meta = read_meta_state(&dev_meta_state_path())?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let _ = catalog::upsert_external_plugin(build_debug_plugin_entry(&meta))?;
    Ok(format!(
        "已开启调试，可在 OTools 首页直接打开 {}",
        meta.display_name
    ))
}

pub async fn dev_disable_debug(uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace()?;
    let normalized_uuid = uuid.trim().to_string();
    if normalized_uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let meta = read_meta_state(&dev_meta_state_path())?
        .into_iter()
        .find(|item| item.uuid.eq_ignore_ascii_case(&normalized_uuid))
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let _ = catalog::remove_external_plugin_by_uuid(&meta.uuid, true)?;
    Ok(format!("已取消调试: {}", meta.display_name))
}

pub async fn dev_initialize_vue_project(uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace()?;
    let meta = read_meta_state(&dev_meta_state_path())?
        .into_iter()
        .find(|item| item.uuid == uuid.trim())
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let binding = read_binding_state(&dev_binding_state_path())?
        .into_iter()
        .find(|item| item.uuid == meta.uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    let base_dir = resolve_bound_plugin_root(&binding.directory_path)?;
    let src_dir = base_dir.join("src");
    catalog::ensure_dir_exists(&src_dir)?;
    let package_name = package_name_from_pack_id(&meta.packid);
    let (host, port) = parse_host_port_from_dev_url(&meta.dev_url);
    write_if_missing(
        &base_dir.join("package.json"),
        &format!(
            r#"{{
  "name": "{package_name}",
  "private": true,
  "version": "{version}",
  "type": "module",
  "scripts": {{
    "dev": "vite --host {host} --port {port}",
    "build": "vite build",
    "preview": "vite preview --host {host} --port 4173"
  }},
  "dependencies": {{
    "vue": "^3.5.13"
  }},
  "devDependencies": {{
    "@vitejs/plugin-vue": "^5.2.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.0"
  }}
}}
"#,
            version = meta.version
        ),
    )?;
    write_if_missing(
        &base_dir.join("vite.config.ts"),
        "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\nexport default defineConfig({ plugins: [vue()], build: { outDir: 'dist', emptyOutDir: true } })\n",
    )?;
    write_if_missing(
        &base_dir.join("index.html"),
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" /><title>OTools Plugin</title></head><body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.ts\"></script></body></html>\n",
    )?;
    write_if_missing(
        &src_dir.join("main.ts"),
        "import { createApp } from 'vue'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n",
    )?;
    write_if_missing(
        &src_dir.join("App.vue"),
        &format!(
            "<template><main class=\"app\"><h1>{}</h1><p>{}</p></main></template><style scoped>.app{{min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#e2e8f0;background:#0f172a}}p{{max-width:720px;line-height:1.7}}</style>\n",
            meta.display_name,
            if meta.summary.trim().is_empty() {
                "Vue 工程骨架已初始化，可执行 pnpm install && pnpm dev 开始开发。"
            } else {
                meta.summary.as_str()
            }
        ),
    )?;
    write_if_missing(
        &base_dir.join(".gitignore"),
        "node_modules\n.DS_Store\ndist\n.vscode\n",
    )?;
    Ok("Vue 工程骨架已初始化到绑定目录，后续可执行 pnpm install && pnpm dev".to_string())
}

pub async fn dev_initialize_native_project(uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace()?;
    let meta = read_meta_state(&dev_meta_state_path())?
        .into_iter()
        .find(|item| item.uuid == uuid.trim())
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let binding = read_binding_state(&dev_binding_state_path())?
        .into_iter()
        .find(|item| item.uuid == meta.uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    let base_dir = resolve_bound_plugin_root(&binding.directory_path)?.join("native");
    let src_dir = base_dir.join("src");
    catalog::ensure_dir_exists(&src_dir)?;
    let crate_name = format!("{}-native", package_name_from_pack_id(&meta.packid));
    write_if_missing(
        &base_dir.join("Cargo.toml"),
        &format!(
            "[package]\nname = \"{crate_name}\"\nversion = \"{}\"\nedition = \"2021\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n\n[dependencies]\nserde_json = \"1\"\n",
            meta.version
        ),
    )?;
    write_if_missing(
        &src_dir.join("lib.rs"),
        r#"use serde_json::{json, Value};

#[no_mangle]
pub extern "C" fn otools_plugin_invoke(input_ptr: *const u8, input_len: usize, output_len: *mut usize) -> *mut u8 {
    if input_ptr.is_null() || output_len.is_null() {
        return std::ptr::null_mut();
    }
    let input = unsafe { std::slice::from_raw_parts(input_ptr, input_len) };
    let parsed: Value = serde_json::from_slice(input).unwrap_or(Value::Null);
    let method = parsed.get("method").and_then(Value::as_str).unwrap_or_default();
    let payload = parsed.get("payload").cloned().unwrap_or(Value::Null);
    let response = match method {
        "ping" => json!({ "ok": true, "data": { "message": "pong" } }),
        "echo" => json!({ "ok": true, "data": payload }),
        _ => json!({ "ok": false, "error": format!("Unknown method: {}", method) }),
    };
    let mut output = serde_json::to_vec(&response).unwrap_or_else(|_| b"{\"ok\":false}".to_vec());
    unsafe { *output_len = output.len(); }
    let ptr = output.as_mut_ptr();
    std::mem::forget(output);
    ptr
}

#[no_mangle]
pub extern "C" fn otools_plugin_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, len, len);
    }
}
"#,
    )?;
    Ok("Rust 原生插件工程已初始化到 native 目录".to_string())
}

pub async fn dev_build_native_plugin(uuid: String) -> Result<String, HostError> {
    build_native_artifact(&native_dir_for_uuid(&uuid)?, true)
}

pub async fn dev_build_native_artifact(uuid: String) -> Result<String, HostError> {
    build_native_artifact(&native_dir_for_uuid(&uuid)?, false)
}

pub async fn dev_build_native_artifact_from_dir(
    directory_path: String,
) -> Result<String, HostError> {
    let base_dir = resolve_bound_plugin_root(&directory_path)?;
    build_native_artifact(&base_dir.join("native"), false)
}

fn start_native_job<F>(runner: F) -> Result<DevNativeBuildJobStart, HostError>
where
    F: FnOnce() -> Result<String, HostError> + Send + 'static,
{
    let job_id = Uuid::new_v4().to_string();
    let state = Arc::new(Mutex::new(DevNativeBuildJobState {
        running: true,
        message: "构建中".to_string(),
        ..DevNativeBuildJobState::default()
    }));
    dev_native_build_jobs()
        .lock()
        .map_err(|_| host_error("Native build job lock poisoned"))?
        .insert(job_id.clone(), state.clone());
    thread::spawn(move || {
        let result = runner();
        if let Ok(mut guard) = state.lock() {
            guard.running = false;
            match result {
                Ok(message) => {
                    guard.success = Some(true);
                    guard.message = message.clone();
                    guard.log = message;
                }
                Err(error) => {
                    guard.success = Some(false);
                    guard.error = error.message;
                }
            }
        }
    });
    Ok(DevNativeBuildJobStart { job_id })
}

pub async fn dev_start_native_plugin_build(
    uuid: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    let native_dir = native_dir_for_uuid(&uuid)?;
    start_native_job(move || build_native_artifact(&native_dir, true))
}

pub async fn dev_start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    let native_dir = resolve_bound_plugin_root(&directory_path)?.join("native");
    start_native_job(move || build_native_artifact(&native_dir, false))
}

pub async fn dev_get_native_build_job(
    job_id: String,
) -> Result<DevNativeBuildJobSnapshot, HostError> {
    let state = dev_native_build_jobs()
        .lock()
        .map_err(|_| host_error("Native build job lock poisoned"))?
        .get(job_id.trim())
        .cloned()
        .ok_or_else(|| HostError::not_found("未找到构建任务"))?;
    let guard = state
        .lock()
        .map_err(|_| host_error("Native build job state lock poisoned"))?;
    Ok(DevNativeBuildJobSnapshot {
        job_id,
        running: guard.running,
        success: guard.success,
        log: guard.log.clone(),
        message: guard.message.clone(),
        error: guard.error.clone(),
    })
}

pub async fn dev_get_native_config(uuid: String) -> Result<DevNativeConfig, HostError> {
    let manifest_path = manifest_path_for_uuid(&uuid)?;
    let value = catalog::read_json_file::<Value>(&manifest_path)?;
    Ok(DevNativeConfig {
        enabled: read_native_enabled_from_value(&value),
        manifest_path: manifest_path.to_string_lossy().to_string(),
    })
}

pub async fn dev_set_native_enabled(uuid: String, enabled: bool) -> Result<String, HostError> {
    let manifest_path = manifest_path_for_uuid(&uuid)?;
    let mut value = catalog::read_json_file::<Value>(&manifest_path)?;
    let Value::Object(ref mut map) = value else {
        return Err(HostError::configuration_invalid("plugin.json 必须是对象"));
    };
    update_native_enabled_in_map(map, enabled);
    catalog::write_json_file(&manifest_path, &value)?;
    Ok(if enabled {
        "已启用原生插件能力".to_string()
    } else {
        "已关闭原生插件能力".to_string()
    })
}

pub async fn dev_pack_plugin(uuid: String) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace()?;
    let meta = read_meta_state(&dev_meta_state_path())?
        .into_iter()
        .find(|item| item.uuid == uuid.trim())
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let binding = read_binding_state(&dev_binding_state_path())?
        .into_iter()
        .find(|item| item.uuid == meta.uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    let plugin_root = resolve_bound_plugin_root(&binding.directory_path)?;
    let manifest_path = PathBuf::from(binding.plugin_manifest_path);
    let entries = build_pack_file_entries(&plugin_root, &manifest_path)?;
    let pack_path = pack_file_path_for(&meta.packid, &meta.version);
    write_zip_pack(&entries, &pack_path)?;
    Ok(DevPluginActionResult {
        message: format!("插件已打包: {}", pack_path.display()),
        item: find_workspace_item(&meta.uuid)?,
    })
}

pub async fn dev_publish_version(
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace()?;
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let path = dev_meta_state_path();
    let mut items = read_meta_state(&path)?;
    let item = items
        .iter_mut()
        .find(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let version = input.version.trim();
    if version.is_empty() {
        return Err(HostError::invalid_input("版本号不能为空"));
    }
    item.version = version.to_string();
    item.updated_at = now_text();
    item.version_records.insert(
        0,
        DevVersionRecord {
            id: Uuid::new_v4().to_string(),
            version: version.to_string(),
            changelog: input.changelog.trim().to_string(),
            download_url: input.download_url.trim().to_string(),
            published_at: now_text(),
            status: "published".to_string(),
        },
    );
    let uuid_for_result = item.uuid.clone();
    write_meta_state(&path, &items)?;
    Ok(DevPluginActionResult {
        message: "版本记录已保存到本地开发工作区".to_string(),
        item: find_workspace_item(&uuid_for_result)?,
    })
}

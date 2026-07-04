use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use chrono::Local;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use otools_core::catalog::{self, ToolPlugin, ToolPluginAutostart, ToolPluginShutdownHook};
use otools_core::{HostError, HostErrorCode};

const PARK_PLUGIN_MARKET_FILE_VERSION: u64 = 1;
const MARKET_PLUGIN_SOURCE: &str = "market";
const PARK_REMOTE_LIST_API: &str = "https://otools-api.lingyun.net/api/v1/otools/plugin/lists";
const PARK_REMOTE_CATEGORIES: [(&str, &str); 4] = [
    ("hot", "热门"),
    ("latest", "最新"),
    ("featured", "精选"),
    ("official", "官方"),
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkReviewItem {
    pub user: String,
    pub rating: f32,
    pub content: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkCatalogItem {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    pub display_name_cn: Option<String>,
    pub developer_name: String,
    pub summary: String,
    pub screenshots: Vec<String>,
    pub version: String,
    #[serde(rename = "minOToolsVersion", alias = "minOtoolsVersion")]
    pub min_otools_version: String,
    pub installed_version: String,
    pub update_available: bool,
    #[serde(rename = "meetsMinOToolsVersion", alias = "meetsMinOtoolsVersion")]
    pub meets_min_otools_version: bool,
    pub icon: String,
    pub entry: String,
    pub easy_mode: u8,
    pub has_ad: bool,
    pub in_plugin_purchase: bool,
    pub official: bool,
    pub rating: f32,
    pub rating_count: usize,
    pub categories: Vec<String>,
    pub package_url: String,
    pub reviews: Vec<ParkReviewItem>,
    pub support_macos: bool,
    pub support_windows: bool,
    pub support_linux: bool,
    pub installed: bool,
    pub installable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkCategory {
    pub key: String,
    pub label: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ParkWorkspace {
    pub downloads_dir: String,
    pub plugins_dir: String,
    pub plugins_file_path: String,
    #[serde(rename = "currentOToolsVersion", alias = "currentOtoolsVersion")]
    pub current_otools_version: String,
    pub categories: Vec<ParkCategory>,
    pub items: Vec<ParkCatalogItem>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkInstallInput {
    pub item: ParkCatalogItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkUninstallInput {
    pub item: ParkCatalogItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkInstallResult {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", skip_serializing_if = "Option::is_none")]
    pub display_name_cn: Option<String>,
    pub download_path: String,
    pub install_path: String,
    pub all_plugins_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkUninstallResult {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", skip_serializing_if = "Option::is_none")]
    pub display_name_cn: Option<String>,
    pub all_plugins_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkPluginPackageManifest {
    uuid: String,
    packid: String,
    display_name: String,
    #[serde(rename = "displayNameCN", alias = "displayNameZh")]
    display_name_cn: Option<String>,
    developer_name: String,
    summary: String,
    screenshots: Vec<String>,
    version: String,
    #[serde(rename = "minOToolsVersion", alias = "minOtoolsVersion")]
    min_otools_version: Option<String>,
    icon: String,
    key: Vec<String>,
    entry: Option<String>,
    open_in_browser: Option<bool>,
    autostart: Option<ToolPluginAutostart>,
    shutdown_hooks: Option<Vec<ToolPluginShutdownHook>>,
    permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkLocalCatalogFile {
    version: u64,
    items: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkRemoteListResponse {
    code: i64,
    msg: String,
    data: ParkRemoteListData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkRemoteListData {
    data_list: Vec<ParkRemoteCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkRemoteCatalogItem {
    id: Value,
    cloud_id: Value,
    uid: Value,
    packid: String,
    display_name: String,
    #[serde(alias = "displayNameCN", alias = "displayNameZh")]
    display_name_cn: Option<String>,
    developer_name: String,
    summary: String,
    screenshots: Vec<String>,
    version: String,
    #[serde(alias = "minOToolsVersion", alias = "min_otools_version")]
    min_otools_version: String,
    icon: String,
    entry: String,
    easy_mode: Value,
    has_ad: Value,
    in_plugin_purchase: Value,
    official: Value,
    rating: Value,
    rating_count: Value,
    categories: Value,
    package_url: String,
    url: String,
    reviews: Value,
    support_macos: Value,
    support_windows: Value,
    support_linux: Value,
}

fn park_downloads_dir() -> PathBuf {
    catalog::park_root_dir().join("downloads")
}

fn park_plugins_dir() -> PathBuf {
    catalog::installed_plugins_dir()
}

fn park_plugins_file_path() -> PathBuf {
    catalog::plugins_file_path()
}

fn park_local_catalog_path() -> PathBuf {
    catalog::park_root_dir().join("local_catalog.json")
}

fn current_otools_version() -> String {
    std::env::var("CODEG_OTOOLS_VERSION")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

fn normalize_catalog_item_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn normalize_catalog_item_uuid(uuid: &str, packid: &str) -> String {
    let value = uuid.trim();
    if value.is_empty() {
        normalize_catalog_item_id(packid)
    } else {
        normalize_catalog_item_id(value)
    }
}

fn sanitize_plugin_packid(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter_map(|item| {
            if item.is_ascii_alphanumeric() {
                Some(item.to_ascii_lowercase())
            } else if matches!(item, '-' | '_' | '.') {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn host_error(message: impl Into<String>) -> HostError {
    HostError::new(HostErrorCode::TaskExecutionFailed, message)
}

fn value_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        _ => String::new(),
    }
}

fn value_bool(value: &Value) -> bool {
    match value {
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_i64().unwrap_or_default() != 0,
        Value::String(text) => matches!(
            text.trim().to_ascii_lowercase().as_str(),
            "true" | "1" | "yes"
        ),
        _ => false,
    }
}

fn value_u8(value: &Value) -> u8 {
    match value {
        Value::Number(number) => number.as_u64().unwrap_or_default().min(u8::MAX as u64) as u8,
        Value::String(text) => text.trim().parse::<u8>().unwrap_or_default(),
        _ => 0,
    }
}

fn value_f32(value: &Value) -> f32 {
    match value {
        Value::Number(number) => number.as_f64().unwrap_or_default() as f32,
        Value::String(text) => text.trim().parse::<f32>().unwrap_or_default(),
        _ => 0.0,
    }
}

fn value_usize(value: &Value) -> usize {
    match value {
        Value::Number(number) => number.as_u64().unwrap_or_default() as usize,
        Value::String(text) => text.trim().parse::<usize>().unwrap_or_default(),
        _ => 0,
    }
}

fn value_string_list(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .map(value_string)
            .filter(|item| !item.is_empty())
            .collect(),
        Value::String(text) => text
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn value_reviews(value: &Value) -> Vec<ParkReviewItem> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| serde_json::from_value::<ParkReviewItem>(item.clone()).ok())
            .collect(),
        _ => Vec::new(),
    }
}

fn read_local_park_catalog(path: &Path) -> Result<Vec<Value>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &ParkLocalCatalogFile {
                version: PARK_PLUGIN_MARKET_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = catalog::read_json_file::<Value>(path)?;
    match value {
        Value::Object(_) => serde_json::from_value::<ParkLocalCatalogFile>(value)
            .map(|file| file.items)
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools Park local catalog")
                    .with_detail(error.to_string())
            }),
        Value::Array(items) => Ok(items),
        _ => Ok(Vec::new()),
    }
}

fn write_local_park_catalog(path: &Path, items: &[Value]) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &ParkLocalCatalogFile {
            version: PARK_PLUGIN_MARKET_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

fn plugin_to_catalog_item(plugin: &ToolPlugin) -> ParkCatalogItem {
    ParkCatalogItem {
        uuid: plugin.uuid.clone(),
        packid: plugin.packid.clone(),
        display_name: plugin.display_name.clone(),
        display_name_cn: plugin.display_name_cn.clone(),
        developer_name: plugin.developer_name.clone(),
        summary: plugin.summary.clone(),
        screenshots: plugin.screenshots.clone(),
        version: plugin.version.clone(),
        min_otools_version: plugin.min_otools_version.clone().unwrap_or_default(),
        installed_version: plugin.version.clone(),
        update_available: false,
        meets_min_otools_version: true,
        icon: plugin.icon.clone(),
        entry: plugin.entry.clone(),
        easy_mode: 0,
        has_ad: false,
        in_plugin_purchase: false,
        official: plugin.builtin.unwrap_or(false),
        rating: 0.0,
        rating_count: 0,
        categories: vec!["installed".to_string()],
        package_url: String::new(),
        reviews: Vec::new(),
        support_macos: true,
        support_windows: true,
        support_linux: true,
        installed: true,
        installable: false,
    }
}

fn remote_to_catalog_item(item: ParkRemoteCatalogItem) -> ParkCatalogItem {
    let uuid = {
        let raw_id = value_string(&item.cloud_id);
        if raw_id.is_empty() {
            value_string(&item.id)
        } else {
            raw_id
        }
    };
    ParkCatalogItem {
        uuid: if uuid.is_empty() {
            item.packid.clone()
        } else {
            uuid
        },
        packid: item.packid,
        display_name: item.display_name,
        display_name_cn: item.display_name_cn,
        developer_name: item.developer_name,
        summary: item.summary,
        screenshots: item.screenshots,
        version: item.version,
        min_otools_version: item.min_otools_version,
        installed_version: String::new(),
        update_available: false,
        meets_min_otools_version: true,
        icon: item.icon,
        entry: item.entry,
        easy_mode: value_u8(&item.easy_mode),
        has_ad: value_bool(&item.has_ad),
        in_plugin_purchase: value_bool(&item.in_plugin_purchase),
        official: value_bool(&item.official),
        rating: value_f32(&item.rating),
        rating_count: value_usize(&item.rating_count),
        categories: value_string_list(&item.categories),
        package_url: if item.package_url.trim().is_empty() {
            item.url
        } else {
            item.package_url
        },
        reviews: value_reviews(&item.reviews),
        support_macos: value_bool(&item.support_macos),
        support_windows: value_bool(&item.support_windows),
        support_linux: value_bool(&item.support_linux),
        installed: false,
        installable: true,
    }
}

fn build_installed_packids(plugins: &[ToolPlugin]) -> HashSet<String> {
    plugins
        .iter()
        .map(|plugin| plugin.packid.trim().to_ascii_lowercase())
        .filter(|item| !item.is_empty())
        .collect()
}

fn build_installed_plugins_index(plugins: &[ToolPlugin]) -> HashMap<String, ToolPlugin> {
    plugins
        .iter()
        .map(|plugin| {
            (
                normalize_catalog_item_uuid(&plugin.uuid, &plugin.packid),
                plugin.clone(),
            )
        })
        .collect()
}

fn normalize_version_text(value: &str) -> String {
    value.trim().trim_start_matches('v').to_string()
}

fn is_version_greater(candidate: &str, current: &str) -> bool {
    let candidate = normalize_version_text(candidate);
    let current = normalize_version_text(current);
    match (Version::parse(&candidate), Version::parse(&current)) {
        (Ok(candidate), Ok(current)) => candidate > current,
        _ => candidate > current,
    }
}

fn validate_min_otools_version(
    display_name: &str,
    min_otools_version: &str,
    current_version: &str,
) -> Result<(), HostError> {
    let min = normalize_version_text(min_otools_version);
    if min.is_empty() {
        return Ok(());
    }
    let current = normalize_version_text(current_version);
    if is_version_greater(&min, &current) {
        return Err(HostError::invalid_input(format!(
            "插件 {display_name} 需要 OTools {min} 或更高版本，当前版本 {current}"
        )));
    }
    Ok(())
}

fn apply_catalog_runtime_state(
    items: &mut [ParkCatalogItem],
    installed_plugins_index: &HashMap<String, ToolPlugin>,
    current_version: &str,
) {
    for item in items {
        let key = normalize_catalog_item_uuid(&item.uuid, &item.packid);
        if let Some(plugin) = installed_plugins_index.get(&key) {
            item.installed = true;
            item.installed_version = plugin.version.clone();
            item.update_available = !item.version.trim().is_empty()
                && is_version_greater(&item.version, &plugin.version);
        }
        item.meets_min_otools_version = validate_min_otools_version(
            &item.display_name,
            &item.min_otools_version,
            current_version,
        )
        .is_ok();
        item.installable = !item.installed || item.update_available;
    }
}

async fn fetch_remote_category_items(
    client: &reqwest::Client,
    cate: &str,
) -> Result<Vec<ParkCatalogItem>, HostError> {
    let response = client
        .get(PARK_REMOTE_LIST_API)
        .query(&[("cate", cate)])
        .send()
        .await
        .map_err(|error| host_error(format!("获取插件市场失败: {error}")))?;
    let payload = response
        .json::<ParkRemoteListResponse>()
        .await
        .map_err(|error| host_error(format!("解析插件市场失败: {error}")))?;
    Ok(payload
        .data
        .data_list
        .into_iter()
        .map(remote_to_catalog_item)
        .collect())
}

async fn fetch_remote_items_index(
    client: &reqwest::Client,
) -> Result<HashMap<String, ParkCatalogItem>, HostError> {
    let items = fetch_remote_category_items(client, "latest").await?;
    Ok(items
        .into_iter()
        .map(|item| (normalize_catalog_item_uuid(&item.uuid, &item.packid), item))
        .collect())
}

async fn build_workspace_categories(
    requested_cate: &str,
    item_count: usize,
    installed_count: usize,
) -> Vec<ParkCategory> {
    let mut categories = PARK_REMOTE_CATEGORIES
        .iter()
        .map(|(key, label)| ParkCategory {
            key: (*key).to_string(),
            label: (*label).to_string(),
            count: if *key == requested_cate {
                item_count
            } else {
                0
            },
        })
        .collect::<Vec<_>>();
    categories.push(ParkCategory {
        key: "installed".to_string(),
        label: "已安装".to_string(),
        count: installed_count,
    });
    categories
}

fn resolve_local_source_path(raw_source: &str) -> Result<PathBuf, HostError> {
    let trimmed = raw_source.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input("本地文件路径不能为空"));
    }
    if trimmed.starts_with("file://") {
        let url =
            Url::parse(trimmed).map_err(|error| HostError::invalid_input(error.to_string()))?;
        return url
            .to_file_path()
            .map_err(|_| HostError::invalid_input("无法解析 file URL"));
    }
    Ok(PathBuf::from(trimmed))
}

async fn download_or_copy_package(raw_source: &str, target_path: &Path) -> Result<(), HostError> {
    if let Some(parent) = target_path.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    let lower = raw_source.trim().to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        let bytes = reqwest::get(raw_source)
            .await
            .map_err(|error| host_error(format!("下载插件失败: {error}")))?
            .bytes()
            .await
            .map_err(|error| host_error(format!("读取插件下载内容失败: {error}")))?;
        fs::write(target_path, bytes).map_err(HostError::io)?;
        return Ok(());
    }
    let source = resolve_local_source_path(raw_source)?;
    fs::copy(&source, target_path).map_err(HostError::io)?;
    Ok(())
}

async fn download_easy_mode_logo(raw_source: &str, target_path: &Path) -> Result<(), HostError> {
    if raw_source.starts_with("http://") || raw_source.starts_with("https://") {
        let bytes = reqwest::get(raw_source)
            .await
            .map_err(|error| host_error(format!("下载插件图标失败: {error}")))?
            .bytes()
            .await
            .map_err(|error| host_error(format!("读取插件图标失败: {error}")))?;
        fs::write(target_path, bytes).map_err(HostError::io)?;
        return Ok(());
    }
    fs::write(target_path, []).map_err(HostError::io)
}

fn sanitize_zip_entry(path: &Path) -> Option<PathBuf> {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => output.push(value),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if output.as_os_str().is_empty() {
        None
    } else {
        Some(output)
    }
}

fn extract_zip_archive(zip_path: &Path, target_dir: &Path) -> Result<(), HostError> {
    let file = fs::File::open(zip_path).map_err(HostError::io)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| host_error(error.to_string()))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| host_error(error.to_string()))?;
        let Some(relative) = sanitize_zip_entry(Path::new(file.name())) else {
            continue;
        };
        let outpath = target_dir.join(relative);
        if file.is_dir() {
            catalog::ensure_dir_exists(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                catalog::ensure_dir_exists(parent)?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(HostError::io)?;
            io::copy(&mut file, &mut outfile).map_err(HostError::io)?;
        }
    }
    Ok(())
}

fn move_or_replace_dir(from: &Path, to: &Path) -> Result<(), HostError> {
    if to.exists() {
        fs::remove_dir_all(to).map_err(HostError::io)?;
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            copy_dir_all(from, to)?;
            fs::remove_dir_all(from).map_err(HostError::io)
        }
    }
}

fn copy_dir_all(from: &Path, to: &Path) -> Result<(), HostError> {
    catalog::ensure_dir_exists(to)?;
    for entry in fs::read_dir(from).map_err(HostError::io)? {
        let entry = entry.map_err(HostError::io)?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_dir_all(&source, &target)?;
        } else {
            fs::copy(&source, &target).map_err(HostError::io)?;
        }
    }
    Ok(())
}

fn resolve_extracted_plugin_root(staging_dir: &Path) -> Result<PathBuf, HostError> {
    if let Some(root) = catalog::resolve_plugin_adapter_root(staging_dir) {
        return Ok(root);
    }
    let mut candidates = Vec::new();
    for entry in fs::read_dir(staging_dir).map_err(HostError::io)? {
        let entry = entry.map_err(HostError::io)?;
        if entry.path().is_dir() {
            if let Some(root) = catalog::resolve_plugin_adapter_root(&entry.path()) {
                candidates.push(root);
            }
        }
    }
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| HostError::not_found("插件包中未找到 plugin.json"))
}

fn read_package_manifest(
    plugin_root: &Path,
) -> Result<Option<ParkPluginPackageManifest>, HostError> {
    let Some(manifest_path) = catalog::resolve_plugin_manifest_path(plugin_root) else {
        return Ok(None);
    };
    let value = catalog::read_json_file::<Value>(&manifest_path)?;
    serde_json::from_value::<ParkPluginPackageManifest>(value)
        .map(Some)
        .map_err(|error| {
            HostError::configuration_invalid("Invalid plugin package manifest")
                .with_detail(format!("{}: {error}", manifest_path.display()))
        })
}

fn build_plugin_record_from_install(
    catalog_item: &ParkCatalogItem,
    install_dir: &Path,
) -> Result<ToolPlugin, HostError> {
    let manifest = read_package_manifest(install_dir)?;
    let uuid = manifest
        .as_ref()
        .map(|item| item.uuid.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| {
            if catalog_item.uuid.trim().is_empty() {
                catalog_item.packid.trim().to_string()
            } else {
                catalog_item.uuid.trim().to_string()
            }
        });
    let packid = manifest
        .as_ref()
        .map(|item| item.packid.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| catalog_item.packid.trim().to_string());
    if packid.is_empty() {
        return Err(HostError::invalid_input("安装插件失败: packid 为空"));
    }
    Ok(ToolPlugin {
        uuid,
        packid,
        display_name: manifest
            .as_ref()
            .map(|item| item.display_name.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.display_name.clone()),
        display_name_cn: manifest
            .as_ref()
            .and_then(|item| item.display_name_cn.clone())
            .or_else(|| catalog_item.display_name_cn.clone()),
        developer_name: manifest
            .as_ref()
            .map(|item| item.developer_name.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.developer_name.clone()),
        summary: manifest
            .as_ref()
            .map(|item| item.summary.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.summary.clone()),
        screenshots: manifest
            .as_ref()
            .map(|item| item.screenshots.clone())
            .filter(|items| !items.is_empty())
            .unwrap_or_else(|| catalog_item.screenshots.clone()),
        version: manifest
            .as_ref()
            .map(|item| item.version.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.version.clone()),
        min_otools_version: manifest
            .as_ref()
            .and_then(|item| item.min_otools_version.clone())
            .filter(|item| !item.trim().is_empty())
            .or_else(|| {
                (!catalog_item.min_otools_version.trim().is_empty())
                    .then(|| catalog_item.min_otools_version.clone())
            }),
        icon: manifest
            .as_ref()
            .map(|item| item.icon.trim().to_string())
            .filter(|item| !item.is_empty())
            .unwrap_or_else(|| catalog_item.icon.clone()),
        key: manifest
            .as_ref()
            .map(|item| item.key.clone())
            .filter(|items| !items.is_empty())
            .unwrap_or_else(|| vec![catalog_item.packid.clone(), "park".to_string()]),
        entry: manifest
            .as_ref()
            .and_then(|item| item.entry.clone())
            .filter(|item| !item.trim().is_empty())
            .unwrap_or_else(|| catalog_item.entry.clone()),
        source: Some(MARKET_PLUGIN_SOURCE.to_string()),
        open_in_browser: manifest
            .as_ref()
            .and_then(|item| item.open_in_browser)
            .or(Some(false)),
        autostart: manifest.as_ref().and_then(|item| item.autostart.clone()),
        shutdown_hooks: manifest
            .as_ref()
            .and_then(|item| item.shutdown_hooks.clone()),
        permissions: manifest
            .as_ref()
            .map(|item| item.permissions.clone())
            .unwrap_or_default(),
        enabled: true,
        builtin: Some(false),
        ..ToolPlugin::default()
    })
}

async fn install_easy_mode_catalog_item(
    item: &ParkCatalogItem,
) -> Result<ParkInstallResult, HostError> {
    let current_version = current_otools_version();
    let requested_packid = item.packid.trim().to_string();
    if requested_packid.is_empty() {
        return Err(HostError::invalid_input("插件 packID 不能为空"));
    }
    if item.entry.trim().is_empty() {
        return Err(HostError::invalid_input(format!(
            "插件 {requested_packid} 缺少 entry"
        )));
    }
    validate_min_otools_version(
        &item.display_name,
        &item.min_otools_version,
        &current_version,
    )?;
    catalog::ensure_dir_exists(&park_plugins_dir())?;
    let uuid = if item.uuid.trim().is_empty() {
        requested_packid.clone()
    } else {
        item.uuid.trim().to_string()
    };
    let dir_name = sanitize_plugin_packid(&uuid);
    let install_dir = park_plugins_dir().join(&dir_name);
    if install_dir.exists() {
        fs::remove_dir_all(&install_dir).map_err(HostError::io)?;
    }
    catalog::ensure_dir_exists(&install_dir)?;
    let logo_path = install_dir.join("logo.png");
    download_easy_mode_logo(&item.icon, &logo_path).await?;
    let manifest = ParkPluginPackageManifest {
        uuid: uuid.clone(),
        packid: requested_packid.clone(),
        display_name: item.display_name.clone(),
        display_name_cn: item.display_name_cn.clone(),
        developer_name: item.developer_name.clone(),
        summary: item.summary.clone(),
        screenshots: item.screenshots.clone(),
        version: item.version.clone(),
        min_otools_version: (!item.min_otools_version.trim().is_empty())
            .then(|| item.min_otools_version.clone()),
        icon: "logo.png".to_string(),
        key: vec![
            requested_packid.clone(),
            "park".to_string(),
            "plugin".to_string(),
        ],
        entry: Some(item.entry.clone()),
        ..ParkPluginPackageManifest::default()
    };
    catalog::write_json_file(&install_dir.join("plugin.json"), &manifest)?;
    let plugin_record = build_plugin_record_from_install(item, &install_dir)?;
    let all_plugins = catalog::upsert_external_plugin(plugin_record.clone())?;
    Ok(ParkInstallResult {
        uuid: plugin_record.uuid,
        packid: plugin_record.packid,
        display_name: plugin_record.display_name.clone(),
        display_name_cn: plugin_record.display_name_cn,
        download_path: String::new(),
        install_path: install_dir.to_string_lossy().to_string(),
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {} 安装成功", plugin_record.display_name),
    })
}

async fn install_catalog_item_internal(
    item: &ParkCatalogItem,
) -> Result<ParkInstallResult, HostError> {
    let current_version = current_otools_version();
    if item.easy_mode > 0 {
        return install_easy_mode_catalog_item(item).await;
    }
    let requested_packid = item.packid.trim().to_string();
    if requested_packid.is_empty() {
        return Err(HostError::invalid_input("插件 packID 不能为空"));
    }
    if item.package_url.trim().is_empty() {
        return Err(HostError::invalid_input(format!(
            "插件 {requested_packid} 缺少下载地址"
        )));
    }
    validate_min_otools_version(
        &item.display_name,
        &item.min_otools_version,
        &current_version,
    )?;
    catalog::ensure_dir_exists(&park_downloads_dir())?;
    catalog::ensure_dir_exists(&park_plugins_dir())?;
    let timestamp = Local::now().format("%Y%m%d%H%M%S").to_string();
    let download_path = park_downloads_dir().join(format!("{requested_packid}-{timestamp}.oplg"));
    download_or_copy_package(&item.package_url, &download_path).await?;
    let staging_dir =
        park_plugins_dir().join(format!(".__installing__{requested_packid}-{timestamp}"));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(HostError::io)?;
    }
    catalog::ensure_dir_exists(&staging_dir)?;
    extract_zip_archive(&download_path, &staging_dir)?;
    let extracted_root = resolve_extracted_plugin_root(&staging_dir)?;
    let first_record = build_plugin_record_from_install(item, &extracted_root)?;
    validate_min_otools_version(
        &first_record.display_name,
        first_record
            .min_otools_version
            .as_deref()
            .unwrap_or(&item.min_otools_version),
        &current_version,
    )?;
    let final_dir_name = sanitize_plugin_packid(if first_record.uuid.trim().is_empty() {
        &first_record.packid
    } else {
        &first_record.uuid
    });
    if final_dir_name.is_empty() {
        return Err(HostError::invalid_input(
            "安装插件失败: 解析到的插件 UUID 为空",
        ));
    }
    let final_install_dir = park_plugins_dir().join(final_dir_name);
    move_or_replace_dir(&extracted_root, &final_install_dir)?;
    if staging_dir.exists() {
        let _ = fs::remove_dir_all(&staging_dir);
    }
    let plugin_record = build_plugin_record_from_install(item, &final_install_dir)?;
    let all_plugins = catalog::upsert_external_plugin(plugin_record.clone())?;
    Ok(ParkInstallResult {
        uuid: plugin_record.uuid,
        packid: plugin_record.packid,
        display_name: plugin_record.display_name.clone(),
        display_name_cn: plugin_record.display_name_cn,
        download_path: download_path.to_string_lossy().to_string(),
        install_path: final_install_dir.to_string_lossy().to_string(),
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {} 安装成功", plugin_record.display_name),
    })
}

fn remove_installed_plugin(
    item: &ParkCatalogItem,
) -> Result<(Vec<ToolPlugin>, Option<ToolPlugin>), HostError> {
    let target_uuid = normalize_catalog_item_uuid(&item.uuid, &item.packid);
    let path = park_plugins_file_path();
    let mut plugins = catalog::read_plugins_file(&path)?;
    let mut removed = None;
    plugins.retain(|plugin| {
        let plugin_uuid = normalize_catalog_item_uuid(&plugin.uuid, &plugin.packid);
        if plugin_uuid == target_uuid {
            removed = Some(plugin.clone());
            false
        } else {
            true
        }
    });
    catalog::write_plugins_file(&path, &plugins)?;
    if let Some(plugin) = &removed {
        let install_dir =
            park_plugins_dir().join(sanitize_plugin_packid(if plugin.uuid.trim().is_empty() {
                &plugin.packid
            } else {
                &plugin.uuid
            }));
        if install_dir.exists() {
            fs::remove_dir_all(install_dir).map_err(HostError::io)?;
        }
    }
    Ok((plugins, removed))
}

pub async fn park_get_workspace(cate: Option<String>) -> Result<ParkWorkspace, HostError> {
    catalog::ensure_dir_exists(&park_downloads_dir())?;
    catalog::ensure_dir_exists(&park_plugins_dir())?;
    catalog::ensure_plugins_file(&park_plugins_file_path())?;
    let requested_cate = cate
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("hot")
        .to_ascii_lowercase();
    let current_version = current_otools_version();
    let merged_plugins = catalog::load_merged_plugins()?;
    let external_plugins = merged_plugins
        .iter()
        .filter(|plugin| !plugin.builtin.unwrap_or(false))
        .cloned()
        .collect::<Vec<_>>();
    let installed_plugins_index = build_installed_plugins_index(&external_plugins);
    let installed_count = build_installed_packids(&external_plugins).len();
    let client = reqwest::Client::new();
    let mut note = "Park 是一个大家园，欢迎大家提交插件。".to_string();
    let mut items = if requested_cate == "installed" {
        let remote_index = fetch_remote_items_index(&client).await.unwrap_or_default();
        let mut installed_items = external_plugins
            .iter()
            .map(|plugin| {
                let key = normalize_catalog_item_uuid(&plugin.uuid, &plugin.packid);
                let mut item = remote_index
                    .get(&key)
                    .cloned()
                    .unwrap_or_else(|| plugin_to_catalog_item(plugin));
                item.installed = true;
                item.installed_version = plugin.version.clone();
                item
            })
            .collect::<Vec<_>>();
        installed_items.sort_by(|left, right| {
            left.display_name
                .to_ascii_lowercase()
                .cmp(&right.display_name.to_ascii_lowercase())
        });
        installed_items
    } else {
        match fetch_remote_category_items(&client, &requested_cate).await {
            Ok(items) => items,
            Err(error) => {
                note = format!("插件市场远程列表暂不可用: {}", error.message);
                let local_items = read_local_park_catalog(&park_local_catalog_path())?
                    .into_iter()
                    .filter_map(|value| serde_json::from_value::<ParkCatalogItem>(value).ok())
                    .collect::<Vec<_>>();
                if local_items.is_empty() {
                    external_plugins
                        .iter()
                        .map(plugin_to_catalog_item)
                        .collect()
                } else {
                    local_items
                }
            }
        }
    };
    apply_catalog_runtime_state(&mut items, &installed_plugins_index, &current_version);
    let categories =
        build_workspace_categories(&requested_cate, items.len(), installed_count).await;
    Ok(ParkWorkspace {
        downloads_dir: park_downloads_dir().to_string_lossy().to_string(),
        plugins_dir: park_plugins_dir().to_string_lossy().to_string(),
        plugins_file_path: park_plugins_file_path().to_string_lossy().to_string(),
        current_otools_version: current_version,
        categories,
        items,
        note,
    })
}

pub async fn park_install_plugin(input: ParkInstallInput) -> Result<ParkInstallResult, HostError> {
    let result = install_catalog_item_internal(&input.item).await?;
    let mut local_items = read_local_park_catalog(&park_local_catalog_path()).unwrap_or_default();
    if let Ok(value) = serde_json::to_value(&input.item) {
        let target = normalize_catalog_item_uuid(&input.item.uuid, &input.item.packid);
        local_items.retain(|item| {
            serde_json::from_value::<ParkCatalogItem>(item.clone())
                .map(|catalog_item| {
                    normalize_catalog_item_uuid(&catalog_item.uuid, &catalog_item.packid) != target
                })
                .unwrap_or(true)
        });
        local_items.push(value);
        let _ = write_local_park_catalog(&park_local_catalog_path(), &local_items);
    }
    Ok(result)
}

pub async fn park_install_offline_plugin(
    file_path: String,
) -> Result<ParkInstallResult, HostError> {
    let path = resolve_local_source_path(&file_path)?;
    if !path.exists() || path.is_dir() {
        return Err(HostError::not_found(format!(
            "离线插件文件不存在: {}",
            path.display()
        )));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension != "oplg" && extension != "zip" {
        return Err(HostError::invalid_input(format!(
            "仅支持 oplg/zip 插件包，当前文件: {}",
            path.display()
        )));
    }
    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("offline-plugin");
    let fallback_packid = sanitize_plugin_packid(file_stem);
    let catalog_item = ParkCatalogItem {
        uuid: fallback_packid.clone(),
        packid: fallback_packid,
        display_name: file_stem.to_string(),
        developer_name: "Offline".to_string(),
        summary: "离线插件安装".to_string(),
        version: "-".to_string(),
        icon: "🧩".to_string(),
        package_url: path.to_string_lossy().to_string(),
        categories: vec!["installed".to_string()],
        meets_min_otools_version: true,
        installable: true,
        support_macos: true,
        support_windows: true,
        support_linux: true,
        ..ParkCatalogItem::default()
    };
    install_catalog_item_internal(&catalog_item).await
}

pub async fn park_uninstall_plugin(
    input: ParkUninstallInput,
) -> Result<ParkUninstallResult, HostError> {
    let item = input.item;
    let (all_plugins, removed_plugin) = remove_installed_plugin(&item)?;
    let uuid = removed_plugin
        .as_ref()
        .map(|plugin| plugin.uuid.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| item.uuid.trim().to_string());
    let packid = removed_plugin
        .as_ref()
        .map(|plugin| plugin.packid.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| item.packid.trim().to_string());
    let display_name = removed_plugin
        .as_ref()
        .map(|plugin| plugin.display_name.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            let fallback = item.display_name.trim();
            if fallback.is_empty() {
                packid.clone()
            } else {
                fallback.to_string()
            }
        });
    let display_name_cn = removed_plugin
        .as_ref()
        .and_then(|plugin| plugin.display_name_cn.clone())
        .or(item.display_name_cn);
    Ok(ParkUninstallResult {
        uuid,
        packid,
        display_name: display_name.clone(),
        display_name_cn,
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {display_name} 已卸载"),
    })
}

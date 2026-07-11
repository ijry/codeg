//! Generic host storage helpers: the caller supplies catalog entries (metadata + absolute paths);
//! this module measures disk usage under those paths and clears directory contents when requested.

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStorageCatalogItemInput {
    pub id: String,
    pub category: String,
    pub name: String,
    pub note: String,
    pub clean_level: String,
    pub recommended: bool,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStoragePathCleanEntry {
    pub path: String,
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub item_name: String,
}

#[derive(Debug, Clone, Copy, Default)]
struct PathMeasure {
    bytes: u64,
    files: u64,
}

impl PathMeasure {
    fn add_assign(&mut self, other: PathMeasure) {
        self.bytes = self.bytes.saturating_add(other.bytes);
        self.files = self.files.saturating_add(other.files);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStorageItem {
    pub id: String,
    pub category: String,
    pub name: String,
    pub note: String,
    pub clean_level: String,
    pub recommended: bool,
    pub paths: Vec<String>,
    pub path_entries: Vec<OtoolsHostStoragePathEntry>,
    pub exists: bool,
    pub total_bytes: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStoragePathEntry {
    pub path: String,
    pub exists: bool,
    pub is_symlink: bool,
    pub link_target: Option<String>,
    pub total_bytes: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStorageScanResult {
    pub os: String,
    pub scanned_at: String,
    pub total_bytes: u64,
    pub existing_items: usize,
    pub items: Vec<OtoolsHostStorageItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStorageCleanResult {
    pub id: String,
    pub name: String,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub freed_bytes: u64,
    pub cleaned_paths: Vec<String>,
    pub skipped_paths: Vec<String>,
    pub failed_paths: Vec<String>,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostStoragePathCleanResult {
    pub item_id: String,
    pub item_name: String,
    pub path: String,
    pub before_bytes: u64,
    pub after_bytes: u64,
    pub freed_bytes: u64,
    pub success: bool,
    pub message: String,
}

fn path_to_key(path: &Path) -> String {
    path.to_string_lossy()
        .trim()
        .trim_end_matches('/')
        .to_string()
}

fn os_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "Unknown"
    }
}

fn resolve_path_strings(strings: &[String]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for item in strings {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(PathBuf::from(trimmed));
    }
    dedup_paths_buf(out)
}

fn dedup_paths_buf(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::<String>::new();
    let mut result = Vec::new();
    for path in paths {
        let text = path_to_key(&path);
        if text.is_empty() {
            continue;
        }
        if seen.insert(text) {
            result.push(path);
        }
    }
    result
}

fn detect_symlink(path: &Path) -> (bool, Option<String>) {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(_) => return (false, None),
    };

    if !metadata.file_type().is_symlink() {
        return (false, None);
    }

    let target = fs::read_link(path)
        .ok()
        .map(|value| value.to_string_lossy().to_string());
    (true, target)
}

fn measure_path(path: &Path) -> PathMeasure {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(_) => return PathMeasure::default(),
    };

    let file_type = metadata.file_type();
    if file_type.is_file() || file_type.is_symlink() {
        return PathMeasure {
            bytes: metadata.len(),
            files: 1,
        };
    }

    if !file_type.is_dir() {
        return PathMeasure::default();
    }

    let mut total = PathMeasure::default();
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        let read = match fs::read_dir(&current) {
            Ok(value) => value,
            Err(_) => continue,
        };

        for entry in read.flatten() {
            let path = entry.path();
            let meta = match fs::symlink_metadata(&path) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let ty = meta.file_type();
            if ty.is_dir() {
                stack.push(path);
                continue;
            }

            total.bytes = total.bytes.saturating_add(meta.len());
            total.files = total.files.saturating_add(1);
        }
    }

    total
}

fn measure_paths(paths: &[PathBuf]) -> PathMeasure {
    let mut total = PathMeasure::default();
    for path in paths {
        total.add_assign(measure_path(path));
    }
    total
}

fn clear_path_contents(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|err| format!("读取路径元数据失败 {}: {}", path.display(), err))?;
    let ty = metadata.file_type();

    if ty.is_file() || ty.is_symlink() {
        fs::remove_file(path).map_err(|err| format!("删除文件失败 {}: {}", path.display(), err))?;
        return Ok(());
    }

    if !ty.is_dir() {
        return Ok(());
    }

    let entries =
        fs::read_dir(path).map_err(|err| format!("读取目录失败 {}: {}", path.display(), err))?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {}", err))?;
        let child = entry.path();
        let child_meta = fs::symlink_metadata(&child)
            .map_err(|err| format!("读取路径元数据失败 {}: {}", child.display(), err))?;
        let child_ty = child_meta.file_type();

        if child_ty.is_dir() {
            fs::remove_dir_all(&child)
                .map_err(|err| format!("删除目录失败 {}: {}", child.display(), err))?;
        } else {
            fs::remove_file(&child)
                .map_err(|err| format!("删除文件失败 {}: {}", child.display(), err))?;
        }
    }

    Ok(())
}

fn scan_items_sync(catalog: Vec<OtoolsHostStorageCatalogItemInput>) -> OtoolsHostStorageScanResult {
    let mut items = Vec::new();
    let mut total_bytes = 0u64;
    let mut existing_items = 0usize;

    for item in catalog {
        let path_bufs = resolve_path_strings(&item.paths);
        if path_bufs.is_empty() {
            continue;
        }

        let mut measure = PathMeasure::default();
        let mut path_entries = Vec::new();
        for path in &path_bufs {
            let path_measure = measure_path(path);
            measure.add_assign(path_measure);
            let (is_symlink, link_target) = detect_symlink(path);
            path_entries.push(OtoolsHostStoragePathEntry {
                path: path_to_key(path),
                exists: path.exists(),
                is_symlink,
                link_target,
                total_bytes: path_measure.bytes,
                file_count: path_measure.files,
            });
        }

        let exists = path_entries.iter().any(|entry| entry.exists);
        if exists {
            existing_items += 1;
        }
        total_bytes = total_bytes.saturating_add(measure.bytes);
        items.push(OtoolsHostStorageItem {
            id: item.id,
            category: item.category,
            name: item.name,
            note: item.note,
            clean_level: item.clean_level,
            recommended: item.recommended,
            paths: path_bufs.iter().map(|p| path_to_key(p.as_path())).collect(),
            path_entries,
            exists,
            total_bytes: measure.bytes,
            file_count: measure.files,
        });
    }

    items.sort_by(|a, b| {
        b.total_bytes
            .cmp(&a.total_bytes)
            .then_with(|| a.category.cmp(&b.category))
            .then_with(|| a.name.cmp(&b.name))
    });

    OtoolsHostStorageScanResult {
        os: os_name().to_string(),
        scanned_at: Local::now().to_rfc3339(),
        total_bytes,
        existing_items,
        items,
    }
}

fn clean_items_sync(
    catalog: Vec<OtoolsHostStorageCatalogItemInput>,
    ids: Vec<String>,
) -> Vec<OtoolsHostStorageCleanResult> {
    let mut defs_map: HashMap<String, OtoolsHostStorageCatalogItemInput> = HashMap::new();
    for item in catalog {
        let id = item.id.trim().to_string();
        if id.is_empty() {
            continue;
        }
        defs_map.insert(id, item);
    }

    let mut unique_ids = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();
    for raw_id in ids {
        let id = raw_id.trim().to_string();
        if id.is_empty() {
            continue;
        }
        if seen.insert(id.clone()) {
            unique_ids.push(id);
        }
    }

    let mut results = Vec::new();
    for id in unique_ids {
        let Some(def) = defs_map.get(&id) else {
            results.push(OtoolsHostStorageCleanResult {
                id: id.clone(),
                name: "未知清理项".to_string(),
                before_bytes: 0,
                after_bytes: 0,
                freed_bytes: 0,
                cleaned_paths: Vec::new(),
                skipped_paths: Vec::new(),
                failed_paths: vec![format!("未找到清理项: {}", id)],
                success: false,
                message: format!("清理项不存在: {}", id),
            });
            continue;
        };

        let path_bufs = resolve_path_strings(&def.paths);
        let before = measure_paths(&path_bufs);
        let mut cleaned_paths = Vec::new();
        let mut skipped_paths = Vec::new();
        let mut failed_paths = Vec::new();

        for path in &path_bufs {
            let path_text = path.to_string_lossy().to_string();
            if !path.exists() {
                skipped_paths.push(path_text);
                continue;
            }

            match clear_path_contents(path) {
                Ok(_) => cleaned_paths.push(path_text),
                Err(err) => failed_paths.push(err),
            }
        }

        let after = measure_paths(&path_bufs);
        let freed = before.bytes.saturating_sub(after.bytes);
        let success = failed_paths.is_empty();
        let message = if success {
            if cleaned_paths.is_empty() {
                "未发现可清理内容".to_string()
            } else {
                format!("已清理 {} 项路径", cleaned_paths.len())
            }
        } else {
            format!("清理完成，但有 {} 个路径失败", failed_paths.len())
        };

        results.push(OtoolsHostStorageCleanResult {
            id: def.id.clone(),
            name: def.name.clone(),
            before_bytes: before.bytes,
            after_bytes: after.bytes,
            freed_bytes: freed,
            cleaned_paths,
            skipped_paths,
            failed_paths,
            success,
            message,
        });
    }

    results
}

fn clean_paths_sync(
    entries: Vec<OtoolsHostStoragePathCleanEntry>,
) -> Vec<OtoolsHostStoragePathCleanResult> {
    let mut unique = Vec::<OtoolsHostStoragePathCleanEntry>::new();
    let mut seen = HashSet::<String>::new();
    for mut entry in entries {
        let key = entry.path.trim().trim_end_matches('/').to_string();
        if key.is_empty() {
            continue;
        }
        entry.path = key.clone();
        if seen.insert(key) {
            unique.push(entry);
        }
    }

    let mut results = Vec::new();
    for entry in unique {
        let item_id = if entry.item_id.trim().is_empty() {
            "unknown".to_string()
        } else {
            entry.item_id.trim().to_string()
        };
        let item_name = if entry.item_name.trim().is_empty() {
            "unknown".to_string()
        } else {
            entry.item_name.trim().to_string()
        };

        let path_key = entry.path.clone();
        let path = PathBuf::from(&path_key);

        if !path.exists() {
            results.push(OtoolsHostStoragePathCleanResult {
                item_id,
                item_name,
                path: path_key,
                before_bytes: 0,
                after_bytes: 0,
                freed_bytes: 0,
                success: true,
                message: "路径不存在，无需清理".to_string(),
            });
            continue;
        }

        let before = measure_path(&path);
        let clear_result = clear_path_contents(&path);
        let after = measure_path(&path);
        let freed = before.bytes.saturating_sub(after.bytes);

        let (success, message) = match clear_result {
            Ok(_) => (true, "清理完成".to_string()),
            Err(err) => (false, err),
        };

        results.push(OtoolsHostStoragePathCleanResult {
            item_id,
            item_name,
            path: path_key,
            before_bytes: before.bytes,
            after_bytes: after.bytes,
            freed_bytes: freed,
            success,
            message,
        });
    }

    results
}

pub async fn otools_host_scan_storage_catalog(
    catalog: Vec<OtoolsHostStorageCatalogItemInput>,
) -> Result<OtoolsHostStorageScanResult, String> {
    if catalog.is_empty() {
        return Err("catalog 不能为空".to_string());
    }

    tokio::task::spawn_blocking(move || scan_items_sync(catalog))
        .await
        .map_err(|err| format!("扫描磁盘占用失败: {}", err))
}

pub async fn otools_host_clean_storage_items(
    catalog: Vec<OtoolsHostStorageCatalogItemInput>,
    ids: Vec<String>,
) -> Result<Vec<OtoolsHostStorageCleanResult>, String> {
    if catalog.is_empty() {
        return Err("catalog 不能为空".to_string());
    }
    if ids.is_empty() {
        return Err("请至少选择一个清理项".to_string());
    }

    tokio::task::spawn_blocking(move || clean_items_sync(catalog, ids))
        .await
        .map_err(|err| format!("清理磁盘占用失败: {}", err))
}

pub async fn otools_host_clean_storage_paths(
    entries: Vec<OtoolsHostStoragePathCleanEntry>,
) -> Result<Vec<OtoolsHostStoragePathCleanResult>, String> {
    if entries.is_empty() {
        return Err("请至少选择一个路径".to_string());
    }

    tokio::task::spawn_blocking(move || clean_paths_sync(entries))
        .await
        .map_err(|err| format!("清理路径失败: {}", err))
}

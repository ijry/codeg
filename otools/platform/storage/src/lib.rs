use std::path::{Path, PathBuf};

use otools_core::HostError;
use serde_json::{json, Value};
use walkdir::WalkDir;

pub async fn otools_host_scan_storage_catalog(catalog: Vec<Value>) -> Result<Value, HostError> {
    let mut total_bytes = 0_u64;
    let mut existing_items = 0_u64;
    let mut items = Vec::new();

    for item in catalog {
        let paths = value_string_array(item.get("paths")).unwrap_or_default();
        let mut item_bytes = 0_u64;
        let mut item_files = 0_u64;
        let mut path_entries = Vec::new();

        for raw_path in &paths {
            let path = PathBuf::from(expand_home_path(raw_path));
            let stats = scan_path(&path);
            item_bytes = item_bytes.saturating_add(stats.total_bytes);
            item_files = item_files.saturating_add(stats.file_count);
            path_entries.push(json!({
                "path": path.to_string_lossy(),
                "exists": stats.exists,
                "isSymlink": stats.is_symlink,
                "linkTarget": stats.link_target,
                "totalBytes": stats.total_bytes,
                "fileCount": stats.file_count,
            }));
        }

        if item_bytes > 0
            || path_entries
                .iter()
                .any(|entry| entry["exists"].as_bool() == Some(true))
        {
            existing_items += 1;
        }
        total_bytes = total_bytes.saturating_add(item_bytes);
        items.push(json!({
            "id": value_string(item.get("id")),
            "category": value_string(item.get("category")),
            "name": value_string(item.get("name")),
            "note": value_string(item.get("note")),
            "cleanLevel": value_string(item.get("cleanLevel")),
            "recommended": item.get("recommended").and_then(Value::as_bool).unwrap_or(false),
            "paths": paths,
            "pathEntries": path_entries,
            "exists": item_bytes > 0,
            "totalBytes": item_bytes,
            "fileCount": item_files,
        }));
    }

    Ok(json!({
        "os": std::env::consts::OS,
        "scannedAt": chrono::Utc::now().to_rfc3339(),
        "totalBytes": total_bytes,
        "existingItems": existing_items,
        "items": items,
    }))
}

pub async fn otools_host_clean_storage_paths(entries: Vec<Value>) -> Result<Vec<Value>, HostError> {
    let mut results = Vec::new();
    for entry in entries {
        let path = PathBuf::from(expand_home_path(&value_string(entry.get("path"))));
        let before = scan_path(&path).total_bytes;
        let success = clean_path(&path).is_ok();
        let after = scan_path(&path).total_bytes;
        results.push(json!({
            "itemId": value_string(entry.get("itemId")),
            "itemName": value_string(entry.get("itemName")),
            "path": path.to_string_lossy(),
            "beforeBytes": before,
            "afterBytes": after,
            "freedBytes": before.saturating_sub(after),
            "success": success,
            "message": if success { "ok" } else { "failed" },
        }));
    }
    Ok(results)
}

pub async fn otools_host_clean_storage_items(
    catalog: Vec<Value>,
    ids: Vec<String>,
) -> Result<Vec<Value>, HostError> {
    let id_set = ids.into_iter().collect::<std::collections::HashSet<_>>();
    let entries = catalog
        .into_iter()
        .filter(|item| id_set.contains(&value_string(item.get("id"))))
        .flat_map(|item| {
            let item_id = value_string(item.get("id"));
            let item_name = value_string(item.get("name"));
            value_string_array(item.get("paths"))
                .unwrap_or_default()
                .into_iter()
                .map(move |path| json!({ "path": path, "itemId": item_id, "itemName": item_name }))
        })
        .collect::<Vec<_>>();
    otools_host_clean_storage_paths(entries).await
}

#[derive(Debug, Default)]
struct PathStats {
    exists: bool,
    is_symlink: bool,
    link_target: Option<String>,
    total_bytes: u64,
    file_count: u64,
}

fn scan_path(path: &Path) -> PathStats {
    let symlink_metadata = match std::fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(_) => return PathStats::default(),
    };
    let is_symlink = symlink_metadata.file_type().is_symlink();
    let link_target = if is_symlink {
        std::fs::read_link(path)
            .ok()
            .map(|value| value.to_string_lossy().to_string())
    } else {
        None
    };
    if symlink_metadata.is_file() {
        return PathStats {
            exists: true,
            is_symlink,
            link_target,
            total_bytes: symlink_metadata.len(),
            file_count: 1,
        };
    }
    if !symlink_metadata.is_dir() {
        return PathStats {
            exists: true,
            is_symlink,
            link_target,
            total_bytes: 0,
            file_count: 0,
        };
    }

    let mut total_bytes = 0_u64;
    let mut file_count = 0_u64;
    for entry in WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                total_bytes = total_bytes.saturating_add(metadata.len());
                file_count = file_count.saturating_add(1);
            }
        }
    }
    PathStats {
        exists: true,
        is_symlink,
        link_target,
        total_bytes,
        file_count,
    }
}

fn clean_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("canonicalize failed: {error}"))?;
    if is_dangerous_clean_target(&canonical) {
        return Err("refusing to clean dangerous path".to_string());
    }
    let metadata = std::fs::symlink_metadata(&canonical).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&canonical).map_err(|error| error.to_string())
    } else {
        std::fs::remove_file(&canonical).map_err(|error| error.to_string())
    }
}

fn is_dangerous_clean_target(path: &Path) -> bool {
    path.parent().is_none()
        || dirs::home_dir().as_deref() == Some(path)
        || std::env::current_dir()
            .ok()
            .as_deref()
            .is_some_and(|cwd| cwd == path)
}

fn expand_home_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "~" {
        return dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from(trimmed))
            .to_string_lossy()
            .to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    trimmed.to_string()
}

fn value_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn value_string_array(value: Option<&Value>) -> Option<Vec<String>> {
    value.and_then(Value::as_array).map(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect()
    })
}

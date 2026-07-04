use std::fs;
use std::path::Path;

use otools_core::HostError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsItem {
    pub id: String,
    pub label: String,
    pub path: String,
    pub is_directory: bool,
    pub is_leaf: bool,
}

pub async fn read_file_content(file_path: String) -> Result<String, HostError> {
    let file_path = require_non_empty(file_path, "filePath")?;
    fs::read_to_string(&file_path).map_err(HostError::io)
}

pub async fn write_file_content(file_path: String, content: String) -> Result<(), HostError> {
    let file_path = require_non_empty(file_path, "filePath")?;
    fs::write(&file_path, content).map_err(HostError::io)
}

pub async fn read_directory_recursive(path: String) -> Result<Vec<FsItem>, HostError> {
    let path = require_non_empty(path, "path")?;
    let mut items = Vec::new();

    for entry in fs::read_dir(&path).map_err(HostError::io)? {
        let entry = entry.map_err(HostError::io)?;
        let entry_path = entry.path();

        if entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }

        let metadata = entry_path.symlink_metadata().map_err(HostError::io)?;
        let label = entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string();
        let item_path = entry_path.to_string_lossy().to_string();
        let is_directory = metadata.is_dir();

        items.push(FsItem {
            id: format!("{entry_path:?}"),
            label,
            path: item_path,
            is_directory,
            is_leaf: !is_directory,
        });
    }

    Ok(items)
}

pub async fn create_directory(path: String) -> Result<(), HostError> {
    let path = require_non_empty(path, "path")?;
    fs::create_dir_all(path).map_err(HostError::io)
}

pub async fn delete_file(path: String) -> Result<(), HostError> {
    let path = require_non_empty(path, "path")?;
    let target = Path::new(&path);
    if !target.is_file() {
        return Err(HostError::invalid_input("Path is not a file").with_detail(path));
    }
    fs::remove_file(target).map_err(HostError::io)
}

pub async fn delete_directory(path: String) -> Result<(), HostError> {
    let path = require_non_empty(path, "path")?;
    let target = Path::new(&path);
    if !target.is_dir() {
        return Err(HostError::invalid_input("Path is not a directory").with_detail(path));
    }
    fs::remove_dir_all(target).map_err(HostError::io)
}

fn require_non_empty(value: String, field: &'static str) -> Result<String, HostError> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(HostError::invalid_input(format!("{field} is required")))
    } else {
        Ok(value)
    }
}

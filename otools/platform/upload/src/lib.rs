use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use chrono::Local;
use md5::Md5;
use otools_core::{catalog, HostError};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImage {
    pub local_path: String,
    pub relative_path: String,
    pub static_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRecord {
    pub original_name: String,
    pub stored_path: String,
    pub size: u64,
    pub md5: String,
    pub sha1: String,
    pub uploaded_at: String,
    pub source_module: String,
}

pub fn upload_save_image(
    file_name: String,
    mime: String,
    data_base64: String,
    source_module: Option<String>,
) -> Result<SavedImage, HostError> {
    if data_base64.trim().is_empty() {
        return Err(HostError::invalid_input("图片内容为空"));
    }

    let encoded = trim_data_url_prefix(data_base64.trim());
    let bytes = BASE64_STANDARD.decode(encoded).map_err(|error| {
        HostError::invalid_input("图片内容解码失败").with_detail(error.to_string())
    })?;

    let now = Local::now();
    let date_dir = now.format("%Y-%m-%d").to_string();
    let upload_root = upload_root_dir();
    let base_dir = upload_root.join(&date_dir);
    fs::create_dir_all(&base_dir).map_err(HostError::io)?;

    let original_name = file_name.clone();
    let uuid = Uuid::new_v4().to_string();
    let stored_file_name = guess_extension(&file_name, &mime)
        .map(|ext| format!("{uuid}.{ext}"))
        .unwrap_or(uuid);

    let md5 = md5_hex(&bytes);
    let sha1 = sha1_hex(&bytes);
    let source_module = source_module
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    let mut index = read_upload_index()?;
    let hash_size = bytes.len() as u64;
    let existing_index = index
        .iter()
        .position(|item| item.size == hash_size && item.md5 == md5 && item.sha1 == sha1);

    if let Some(idx) = existing_index {
        let stored_path = normalize_stored_path(&index[idx].stored_path);
        let relative_path = stored_path_to_relative(&stored_path);
        let local_path = catalog::otools_root_dir().join(&stored_path);
        if local_path.exists() {
            return Ok(SavedImage {
                local_path: local_path.to_string_lossy().to_string(),
                relative_path: relative_path.clone(),
                static_url: static_url(&relative_path),
            });
        }
    }

    let relative_path = format!("{date_dir}/{stored_file_name}");
    let target_path = base_dir.join(&stored_file_name);
    fs::write(&target_path, bytes).map_err(HostError::io)?;

    let stored_path = format!("upload/{relative_path}");
    if let Some(idx) = existing_index {
        if let Some(existing) = index.get_mut(idx) {
            existing.original_name = original_name;
            existing.stored_path = stored_path.clone();
            existing.uploaded_at = now.to_rfc3339();
            existing.source_module = source_module.clone();
        }
    } else {
        index.push(UploadRecord {
            original_name,
            stored_path: stored_path.clone(),
            size: hash_size,
            md5,
            sha1,
            uploaded_at: now.to_rfc3339(),
            source_module,
        });
    }
    write_upload_index(&index)?;

    Ok(SavedImage {
        local_path: target_path.to_string_lossy().to_string(),
        relative_path: relative_path.clone(),
        static_url: static_url(&relative_path),
    })
}

pub fn resolve_upload_static_path(relative_path: &str) -> Result<PathBuf, HostError> {
    let relative = sanitize_relative_path(relative_path)?;
    let root = upload_root_dir();
    let candidate = root.join(relative);
    let canonical_root = root.canonicalize().map_err(HostError::io)?;
    let canonical_file = candidate.canonicalize().map_err(HostError::io)?;
    if !canonical_file.starts_with(&canonical_root) || !canonical_file.is_file() {
        return Err(HostError::not_found("OTools upload asset not found"));
    }
    Ok(canonical_file)
}

pub fn upload_root_dir() -> PathBuf {
    catalog::otools_root_dir().join("upload")
}

fn static_url(relative_path: &str) -> String {
    format!("static://{relative_path}")
}

fn upload_index_path() -> PathBuf {
    catalog::otools_root_dir().join("upload.json")
}

fn read_upload_index() -> Result<Vec<UploadRecord>, HostError> {
    let path = upload_index_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    catalog::read_json_file(&path)
}

fn write_upload_index(records: &[UploadRecord]) -> Result<(), HostError> {
    catalog::write_json_file(&upload_index_path(), &records.to_vec())
}

fn trim_data_url_prefix(encoded: &str) -> &str {
    encoded
        .find("base64,")
        .map(|index| &encoded[index + "base64,".len()..])
        .unwrap_or(encoded)
}

fn sanitize_extension(ext: &str) -> Option<String> {
    let normalized = ext
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn guess_extension(file_name: &str, mime: &str) -> Option<String> {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .and_then(sanitize_extension)
        .or_else(|| match mime.trim().to_ascii_lowercase().as_str() {
            "image/png" => Some("png".to_string()),
            "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
            "image/gif" => Some("gif".to_string()),
            "image/webp" => Some("webp".to_string()),
            "image/svg+xml" => Some("svg".to_string()),
            "image/bmp" => Some("bmp".to_string()),
            "image/tiff" => Some("tiff".to_string()),
            _ => None,
        })
}

fn normalize_stored_path(stored_path: &str) -> String {
    let trimmed = stored_path.trim().trim_start_matches('/');
    if trimmed.starts_with("upload/") {
        trimmed.to_string()
    } else {
        format!("upload/{trimmed}")
    }
}

fn stored_path_to_relative(stored_path: &str) -> String {
    normalize_stored_path(stored_path)
        .trim_start_matches("upload/")
        .to_string()
}

fn sanitize_relative_path(value: &str) -> Result<PathBuf, HostError> {
    let path = Path::new(value.trim_start_matches('/'));
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(HostError::invalid_input("Invalid OTools upload asset path"));
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => clean.push(part),
            std::path::Component::CurDir => {}
            _ => return Err(HostError::invalid_input("Invalid OTools upload asset path")),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(HostError::invalid_input("Invalid OTools upload asset path"));
    }
    Ok(clean)
}

fn md5_hex(bytes: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

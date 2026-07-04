use std::borrow::Cow;
use std::fs;
use std::path::{Path, PathBuf};

use arboard::Clipboard;
use base64::Engine as _;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsCopiedFile {
    pub path: String,
    pub is_diractory: bool,
    pub is_file: bool,
    pub name: String,
}

pub fn otools_copy_text(text: String) -> Result<bool, String> {
    let mut clipboard = Clipboard::new()
        .map_err(|error| format!("初始化系统剪贴板失败: {error}"))?;
    clipboard
        .set()
        .text(text)
        .map_err(|error| format!("写入系统剪贴板失败: {error}"))?;
    Ok(true)
}

pub fn otools_copy_file(paths: Vec<String>) -> Result<bool, String> {
    let file_list = normalize_existing_paths(paths);
    if file_list.is_empty() {
        return Err("未找到有效文件路径".to_string());
    }

    let mut clipboard = Clipboard::new()
        .map_err(|error| format!("初始化系统剪贴板失败: {error}"))?;
    clipboard
        .set()
        .file_list(&file_list)
        .map_err(|error| format!("写入系统剪贴板失败: {error}"))?;
    Ok(true)
}

pub fn otools_copy_image(image: String) -> Result<bool, String> {
    let payload = image.trim();
    if payload.is_empty() {
        return Err("图片内容为空".to_string());
    }

    let bytes = if payload.starts_with("data:") {
        decode_data_url_payload(payload)?
    } else {
        fs::read(payload).map_err(|error| format!("读取图片失败: {error}"))?
    };

    write_image_bytes_to_system_clipboard(&bytes)?;
    Ok(true)
}

pub fn otools_get_copied_files() -> Result<Vec<OtoolsCopiedFile>, String> {
    let mut clipboard = Clipboard::new()
        .map_err(|error| format!("初始化系统剪贴板失败: {error}"))?;
    let files = clipboard
        .get()
        .file_list()
        .map_err(|error| format!("读取剪贴板文件失败: {error}"))?;

    Ok(files
        .into_iter()
        .map(|path| {
            let meta = fs::metadata(&path).ok();
            let is_dir = meta.as_ref().map(|item| item.is_dir()).unwrap_or(false);
            let is_file = meta.as_ref().map(|item| item.is_file()).unwrap_or(false);
            let name = path
                .file_name()
                .and_then(|item| item.to_str())
                .unwrap_or_default()
                .to_string();
            OtoolsCopiedFile {
                path: path.to_string_lossy().to_string(),
                is_diractory: is_dir,
                is_file,
                name,
            }
        })
        .collect())
}

pub fn otools_get_file_icon(path: String) -> Result<String, String> {
    let target = path.trim();
    if target.is_empty() {
        return Ok(String::new());
    }
    let path = Path::new(target);
    if !path.exists() || !path.is_file() {
        return Ok(String::new());
    }

    let mime = mime_guess::from_path(path)
        .first()
        .map(|item| item.to_string())
        .unwrap_or_default();
    if !mime.starts_with("image/") {
        return Ok(String::new());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取图标失败: {error}"))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn decode_data_url_payload(data_url: &str) -> Result<Vec<u8>, String> {
    let payload = data_url
        .split_once(',')
        .map(|(_, raw)| raw)
        .unwrap_or(data_url)
        .trim();

    base64::engine::general_purpose::STANDARD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .map_err(|error| format!("解析图片数据失败: {error}"))
}

fn write_image_bytes_to_system_clipboard(bytes: &[u8]) -> Result<(), String> {
    let image = image::load_from_memory(bytes)
        .map_err(|error| format!("解析图片失败: {error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    let rgba = image.into_raw();

    let mut clipboard = Clipboard::new()
        .map_err(|error| format!("初始化系统剪贴板失败: {error}"))?;
    clipboard
        .set()
        .image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: Cow::Owned(rgba),
        })
        .map_err(|error| format!("写入系统剪贴板失败: {error}"))
}

fn normalize_existing_paths(paths: Vec<String>) -> Vec<PathBuf> {
    paths
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .collect()
}

use std::fs;
use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::{HostError, HostErrorCode};
use url::Url;

pub fn resolve_local_source_path(raw_source: &str) -> Result<PathBuf, HostError> {
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

pub async fn download_or_copy_package(
    raw_source: &str,
    target_path: &Path,
) -> Result<(), HostError> {
    if let Some(parent) = target_path.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    let lower = raw_source.trim().to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        let bytes = reqwest::get(raw_source)
            .await
            .map_err(|error| download_error(format!("下载插件失败: {error}")))?
            .bytes()
            .await
            .map_err(|error| download_error(format!("读取插件下载内容失败: {error}")))?;
        fs::write(target_path, bytes).map_err(HostError::io)?;
        return Ok(());
    }
    let source = resolve_local_source_path(raw_source)?;
    fs::copy(&source, target_path).map_err(HostError::io)?;
    Ok(())
}

pub async fn download_easy_mode_logo(
    raw_source: &str,
    target_path: &Path,
) -> Result<(), HostError> {
    if raw_source.starts_with("http://") || raw_source.starts_with("https://") {
        let bytes = reqwest::get(raw_source)
            .await
            .map_err(|error| download_error(format!("下载插件图标失败: {error}")))?
            .bytes()
            .await
            .map_err(|error| download_error(format!("读取插件图标失败: {error}")))?;
        fs::write(target_path, bytes).map_err(HostError::io)?;
        return Ok(());
    }
    fs::write(target_path, []).map_err(HostError::io)
}

fn download_error(message: impl Into<String>) -> HostError {
    HostError::new(HostErrorCode::TaskExecutionFailed, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_plain_and_file_url_sources() {
        let plain = resolve_local_source_path(" C:\\temp\\plugin.oplg ")
            .expect("plain path should resolve");
        assert_eq!(plain, PathBuf::from("C:\\temp\\plugin.oplg"));

        let file_path = std::env::temp_dir().join("sample-plugin.oplg");
        let file_url = Url::from_file_path(&file_path).expect("file url");
        let resolved = resolve_local_source_path(file_url.as_str())
            .expect("file url should resolve");

        assert_eq!(resolved, file_path);
    }

    #[test]
    fn rejects_empty_local_source() {
        let error = resolve_local_source_path(" ").expect_err("empty source should fail");

        assert!(error.message.contains("不能为空"));
    }
}

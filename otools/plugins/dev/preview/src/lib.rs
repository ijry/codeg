use std::fs;
use std::path::{Path, PathBuf};

use otools_core::HostError;
use url::Url;

pub fn path_to_file_url(path: &Path) -> Result<String, HostError> {
    let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Url::from_file_path(canonical)
        .map(|url| url.to_string())
        .map_err(|_| HostError::invalid_input(format!("无法转换文件 URL: {}", path.display())))
}

pub fn normalize_preview_source(raw: &str) -> Option<String> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    if text.starts_with("http://") || text.starts_with("https://") || text.starts_with("data:") {
        return Some(text.to_string());
    }
    let path = PathBuf::from(text);
    if !path.exists() {
        return None;
    }
    path_to_file_url(&path).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn normalizes_web_and_file_preview_sources() {
        assert_eq!(
            normalize_preview_source(" https://example.com/a.png "),
            Some("https://example.com/a.png".to_string())
        );
        assert_eq!(
            normalize_preview_source("data:image/png;base64,abc"),
            Some("data:image/png;base64,abc".to_string())
        );

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!("otools-dev-preview-{stamp}.png"));
        fs::write(&path, "png").expect("write preview file");

        let file_url = normalize_preview_source(&path.to_string_lossy())
            .expect("file preview should normalize");

        assert!(file_url.starts_with("file://"));
        fs::remove_file(path).ok();
    }

    #[test]
    fn ignores_missing_or_empty_preview_sources() {
        assert_eq!(normalize_preview_source(" "), None);
        assert_eq!(normalize_preview_source("missing-preview.png"), None);
    }
}

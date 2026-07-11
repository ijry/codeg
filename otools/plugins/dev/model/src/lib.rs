use otools_core::HostError;
use otools_plugin_support::sanitize_plugin_packid;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use url::Url;

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
pub struct DevPublishVersionInput {
    pub uuid: String,
    pub version: String,
    pub changelog: String,
    pub download_url: String,
}

pub fn normalize_dev_plugin_input(input: DevPluginInput) -> Result<DevPluginInput, HostError> {
    let packid = sanitize_plugin_packid(&input.packid);
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

pub fn normalize_publish_version_input(
    input: DevPublishVersionInput,
) -> Result<DevPublishVersionInput, HostError> {
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let version = input.version.trim().to_string();
    if version.is_empty() {
        return Err(HostError::invalid_input("版本号不能为空"));
    }
    let download_url = input.download_url.trim().to_string();
    if download_url.is_empty() {
        return Err(HostError::invalid_input("插件下载地址不能为空"));
    }
    let parsed = Url::parse(&download_url)
        .map_err(|error| HostError::invalid_input(format!("插件下载地址无效: {error}")))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(HostError::invalid_input("插件下载地址仅支持 http/https"));
    }
    Ok(DevPublishVersionInput {
        uuid,
        version,
        changelog: input.changelog.trim().to_string(),
        download_url,
    })
}

pub fn is_https_image_url(raw: &str) -> bool {
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

pub fn is_short_text_icon(raw: &str) -> bool {
    let text = raw.trim();
    !text.is_empty()
        && !text.starts_with("http://")
        && !text.starts_with("https://")
        && text.chars().count() <= 4
}

pub fn is_valid_plugin_icon(raw: &str) -> bool {
    let text = raw.trim();
    !text.is_empty()
        && (text.starts_with("@builtin:") || is_https_image_url(text) || is_short_text_icon(text))
}

pub fn dedupe_string_list(items: &[String]) -> Vec<String> {
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

pub fn normalize_dev_url(raw: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_dev_plugin_input() {
        let input = DevPluginInput {
            icon: " 🧩 ".to_string(),
            packid: " Sample.Plugin ".to_string(),
            display_name: " Sample ".to_string(),
            display_name_cn: Some(" 示例 ".to_string()),
            developer_name: " Developer ".to_string(),
            screenshots: vec![
                " https://example.com/a.png ".to_string(),
                "https://example.com/a.PNG".to_string(),
                " ".to_string(),
            ],
            dev_url: "localhost:5173/".to_string(),
            agreement_accepted: true,
            ..DevPluginInput::default()
        };

        let normalized = normalize_dev_plugin_input(input).expect("normalize input");

        assert_eq!(normalized.icon, "🧩");
        assert_eq!(normalized.packid, "sample-plugin");
        assert_eq!(normalized.display_name, "Sample");
        assert_eq!(normalized.display_name_cn.as_deref(), Some("示例"));
        assert_eq!(normalized.developer_name, "Developer");
        assert_eq!(normalized.version, "0.1.0");
        assert_eq!(normalized.dev_url, "http://localhost:5173");
        assert_eq!(normalized.screenshots, vec!["https://example.com/a.png"]);
        assert!(normalized.agreement_accepted);
    }

    #[test]
    fn rejects_invalid_icon_and_screenshot() {
        let invalid_icon = DevPluginInput {
            icon: "http://example.com/icon.png".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            ..DevPluginInput::default()
        };
        assert!(normalize_dev_plugin_input(invalid_icon).is_err());

        let invalid_screenshot = DevPluginInput {
            icon: "🧩".to_string(),
            packid: "sample".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            screenshots: vec!["https://example.com/file.txt".to_string()],
            ..DevPluginInput::default()
        };
        assert!(normalize_dev_plugin_input(invalid_screenshot).is_err());
    }

    #[test]
    fn normalizes_publish_version_input() {
        let input = DevPublishVersionInput {
            uuid: " dev-uuid ".to_string(),
            version: " 1.0.0 ".to_string(),
            changelog: " changelog ".to_string(),
            download_url: " https://example.com/plugin.oplg ".to_string(),
        };

        let normalized = normalize_publish_version_input(input).expect("normalize publish input");

        assert_eq!(normalized.uuid, "dev-uuid");
        assert_eq!(normalized.version, "1.0.0");
        assert_eq!(normalized.changelog, "changelog");
        assert_eq!(normalized.download_url, "https://example.com/plugin.oplg");
    }

    #[test]
    fn rejects_invalid_publish_download_url() {
        let input = DevPublishVersionInput {
            uuid: "dev-uuid".to_string(),
            version: "1.0.0".to_string(),
            download_url: "file:///tmp/plugin.oplg".to_string(),
            ..DevPublishVersionInput::default()
        };

        assert!(normalize_publish_version_input(input).is_err());
    }
}

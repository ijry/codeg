use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_park_sync::{upsert_local_park_catalog_item, upsert_local_park_catalog_item_at};
use otools_plugin_dev_state::{read_binding_state, read_meta_state};
use otools_plugin_dev_workspace::{pack_file_path_for, validate_bound_directory};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use zip::write::SimpleFileOptions;

const DEFAULT_PACK_INCLUDES: [&str; 5] = ["plugin.json", "logo.png", "logo.svg", "dist", "lib"];
const REQUIRED_PACK_FILES: [&str; 1] = ["plugin.json"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RepoPluginPackConfig {
    pub includes: Vec<String>,
    pub excludes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RepoPluginManifest {
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
    pub entry: String,
    pub pack: RepoPluginPackConfig,
}

#[derive(Debug, Clone)]
pub struct DevPluginPackResult {
    pub uuid: String,
    pub pack_path: PathBuf,
}

pub fn read_repo_plugin_manifest(path: &Path) -> Result<RepoPluginManifest, HostError> {
    let value = catalog::read_json_file::<Value>(path)?;
    serde_json::from_value(value).map_err(|error| {
        HostError::configuration_invalid("Invalid plugin.json")
            .with_detail(format!("{}: {error}", path.display()))
    })
}

pub fn pack_bound_plugin_for_uuid(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
    uuid: &str,
) -> Result<DevPluginPackResult, HostError> {
    pack_bound_plugin_for_uuid_with_catalog_path(meta_path, binding_path, packs_dir, uuid, None)
}

pub(crate) fn pack_bound_plugin_for_uuid_with_catalog_path(
    meta_path: &Path,
    binding_path: &Path,
    packs_dir: &Path,
    uuid: &str,
    park_catalog_path: Option<&Path>,
) -> Result<DevPluginPackResult, HostError> {
    let normalized_uuid = uuid.trim();
    if normalized_uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }

    let meta = read_meta_state(meta_path)?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let binding = read_binding_state(binding_path)?
        .into_iter()
        .find(|item| item.uuid == meta.uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    let plugin_root = resolve_bound_plugin_root(&binding.directory_path)?;
    let manifest_path = if binding.plugin_manifest_path.trim().is_empty() {
        validate_bound_directory(&binding.directory_path)?.1
    } else {
        binding.plugin_manifest_path
    };
    let manifest_path = PathBuf::from(manifest_path);

    ensure_plugin_pack_entry_ready(&plugin_root, &manifest_path)?;
    let entries = build_pack_file_entries(&plugin_root, &manifest_path)?;
    let pack_path = pack_file_path_for(packs_dir, &meta.packid, &meta.version);
    write_zip_pack(&entries, &pack_path)?;
    if let Some(catalog_path) = park_catalog_path {
        upsert_local_park_catalog_item_at(&meta, &pack_path, catalog_path)?;
    } else {
        upsert_local_park_catalog_item(&meta, &pack_path)?;
    }

    Ok(DevPluginPackResult {
        uuid: meta.uuid,
        pack_path,
    })
}

pub fn ensure_plugin_pack_entry_ready(
    plugin_root: &Path,
    manifest_path: &Path,
) -> Result<(), HostError> {
    let manifest = read_repo_plugin_manifest(manifest_path)?;
    let Some(entry) = manifest_relative_entry_for_pack(&manifest) else {
        return Ok(());
    };

    if plugin_root.join(&entry).exists() {
        return Ok(());
    }

    if !plugin_root.join("package.json").exists() {
        return Ok(());
    }

    if run_plugin_pnpm_command(plugin_root, &["run", "build"], "pnpm run build").is_err() {
        run_plugin_pnpm_command(plugin_root, &["install"], "pnpm install")?;
        run_plugin_pnpm_command(plugin_root, &["run", "build"], "pnpm run build")?;
    }

    if !plugin_root.join(&entry).exists() {
        return Err(HostError::not_found(format!(
            "自动构建完成后仍未找到入口文件: {}",
            plugin_root.join(&entry).display()
        )));
    }

    Ok(())
}

pub fn build_pack_file_entries(
    plugin_root: &Path,
    manifest_path: &Path,
) -> Result<Vec<(PathBuf, String)>, HostError> {
    let manifest = read_repo_plugin_manifest(manifest_path)?;
    let manifest_entry = manifest_relative_entry_for_pack(&manifest);

    let mut include_patterns = Vec::<String>::new();
    for raw in DEFAULT_PACK_INCLUDES {
        include_patterns.extend(expand_pack_pattern(plugin_root, raw, false)?);
    }
    for raw in manifest.pack.includes {
        include_patterns.extend(expand_pack_pattern(plugin_root, &raw, true)?);
    }

    let mut exclude_patterns = Vec::<String>::new();
    for raw in manifest.pack.excludes {
        exclude_patterns.extend(expand_pack_pattern(plugin_root, &raw, false)?);
    }

    let mut files = Vec::<(PathBuf, String)>::new();
    collect_packable_files(plugin_root, plugin_root, &mut files)?;

    let mut selected = Vec::<(PathBuf, String)>::new();
    let mut seen = HashSet::<String>::new();
    for (path, relative) in files {
        let included = include_patterns
            .iter()
            .any(|pattern| pack_pattern_matches(pattern, &relative));
        if !included {
            continue;
        }
        let excluded = exclude_patterns
            .iter()
            .any(|pattern| pack_pattern_matches(pattern, &relative));
        if excluded || !seen.insert(relative.clone()) {
            continue;
        }
        selected.push((path, relative));
    }

    selected.sort_by(|left, right| left.1.cmp(&right.1));

    for required in REQUIRED_PACK_FILES {
        if !selected.iter().any(|(_, relative)| relative == required) {
            return Err(HostError::not_found(format!(
                "打包失败，缺少必需文件: {}",
                plugin_root.join(required).display()
            )));
        }
    }

    if let Some(entry) = manifest_entry {
        if !selected.iter().any(|(_, relative)| relative == &entry) {
            return Err(HostError::not_found(format!(
                "entry target not found for pack: {}",
                plugin_root.join(&entry).display()
            )));
        }
    }

    Ok(selected)
}

pub fn write_zip_pack(entries: &[(PathBuf, String)], target: &Path) -> Result<(), HostError> {
    if let Some(parent) = target.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    let file = fs::File::create(target).map_err(HostError::io)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (path, relative) in entries {
        zip.start_file(relative, options)
            .map_err(|error| HostError::task_execution_failed(error.to_string()))?;
        let mut file = fs::File::open(path).map_err(HostError::io)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(HostError::io)?;
        zip.write_all(&buffer).map_err(HostError::io)?;
    }
    zip.finish()
        .map(|_| ())
        .map_err(|error| HostError::task_execution_failed(error.to_string()))
}

fn normalize_manifest_entry(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("./")
        .trim_start_matches('/')
        .replace('\\', "/")
}

fn normalize_pack_pattern(raw: &str) -> Result<String, HostError> {
    let replaced = raw.trim().replace('\\', "/");
    let mut parts = Vec::<String>::new();
    for part in replaced.split('/') {
        let segment = part.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(HostError::invalid_input(format!(
                "pack 配置不能包含 .. 路径段: {raw}"
            )));
        }
        parts.push(segment.to_string());
    }
    Ok(parts.join("/"))
}

fn pack_pattern_has_wildcards(pattern: &str) -> bool {
    pattern.contains('*') || pattern.contains('?')
}

fn expand_pack_pattern(
    plugin_root: &Path,
    raw: &str,
    explicit: bool,
) -> Result<Vec<String>, HostError> {
    let pattern = normalize_pack_pattern(raw)?;
    if pattern.is_empty() {
        return Ok(Vec::new());
    }
    if pack_pattern_has_wildcards(&pattern) {
        return Ok(vec![pattern]);
    }

    let candidate = plugin_root.join(&pattern);
    if candidate.is_dir() {
        return Ok(vec![format!("{pattern}/**")]);
    }
    if candidate.is_file() {
        return Ok(vec![pattern]);
    }
    if explicit {
        return Err(HostError::not_found(format!(
            "pack.includes 路径不存在: {}",
            candidate.display()
        )));
    }
    Ok(Vec::new())
}

fn collect_packable_files(
    plugin_root: &Path,
    current_dir: &Path,
    output: &mut Vec<(PathBuf, String)>,
) -> Result<(), HostError> {
    let entries = fs::read_dir(current_dir).map_err(HostError::io)?;
    for entry in entries {
        let entry = entry.map_err(HostError::io)?;
        let path = entry.path();
        if path.is_dir() {
            collect_packable_files(plugin_root, &path, output)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let relative = path
            .strip_prefix(plugin_root)
            .map_err(|error| HostError::invalid_input(error.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        output.push((path, relative));
    }
    Ok(())
}

fn pack_pattern_matches(pattern: &str, text: &str) -> bool {
    fn inner(pattern: &[u8], text: &[u8]) -> bool {
        if pattern.is_empty() {
            return text.is_empty();
        }

        if pattern.len() >= 2 && pattern[0] == b'*' && pattern[1] == b'*' {
            let mut rest = &pattern[2..];
            if rest.first() == Some(&b'/') {
                rest = &rest[1..];
            }
            if inner(rest, text) {
                return true;
            }
            for index in 0..text.len() {
                if inner(rest, &text[index + 1..]) {
                    return true;
                }
            }
            return false;
        }

        match pattern[0] {
            b'*' => {
                let rest = &pattern[1..];
                if inner(rest, text) {
                    return true;
                }
                let mut index = 0;
                while index < text.len() && text[index] != b'/' {
                    index += 1;
                    if inner(rest, &text[index..]) {
                        return true;
                    }
                }
                false
            }
            b'?' => {
                if text.is_empty() || text[0] == b'/' {
                    return false;
                }
                inner(&pattern[1..], &text[1..])
            }
            byte => {
                if text.first() != Some(&byte) {
                    return false;
                }
                inner(&pattern[1..], &text[1..])
            }
        }
    }

    inner(pattern.as_bytes(), text.as_bytes())
}

fn should_validate_relative_manifest_entry(entry: &str) -> bool {
    !entry.is_empty() && !entry.contains("://") && !entry.starts_with("data:")
}

fn manifest_relative_entry_for_pack(manifest: &RepoPluginManifest) -> Option<String> {
    let entry = normalize_manifest_entry(&manifest.entry);
    if should_validate_relative_manifest_entry(&entry) {
        Some(entry)
    } else {
        None
    }
}

fn pnpm_program_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "pnpm.cmd"
    } else {
        "pnpm"
    }
}

fn trim_process_log(output: &[u8]) -> String {
    String::from_utf8_lossy(output).trim().to_string()
}

fn resolve_bound_plugin_root(directory_path: &str) -> Result<PathBuf, HostError> {
    catalog::resolve_plugin_adapter_root(Path::new(directory_path.trim())).ok_or_else(|| {
        HostError::not_found(format!("无法解析插件根目录: {}", directory_path.trim()))
    })
}

fn run_plugin_pnpm_command(
    plugin_root: &Path,
    args: &[&str],
    label: &str,
) -> Result<(), HostError> {
    let output = Command::new(pnpm_program_name())
        .args(args)
        .current_dir(plugin_root)
        .output()
        .map_err(HostError::io)?;

    if output.status.success() {
        return Ok(());
    }

    let stdout = trim_process_log(&output.stdout);
    let stderr = trim_process_log(&output.stderr);
    let mut details = String::new();
    if !stdout.is_empty() {
        details.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !details.is_empty() {
            details.push('\n');
        }
        details.push_str(&stderr);
    }
    if details.is_empty() {
        details = "未输出详细日志".to_string();
    }

    Err(HostError::task_execution_failed(format!("{label} 失败:\n{details}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use otools_plugin_dev_state::{write_binding_state, write_meta_state};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-package-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn write_file(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, content).expect("write test file");
    }

    #[test]
    fn rejects_parent_segments_in_pack_patterns() {
        let error = normalize_pack_pattern("../secret").expect_err("reject parent segment");
        assert!(error.message.contains(".."));
    }

    #[test]
    fn matches_recursive_pack_patterns() {
        assert!(pack_pattern_matches("dist/**", "dist/index.html"));
        assert!(pack_pattern_matches("dist/**", "dist/assets/app.js"));
        assert!(pack_pattern_matches("lib/*.dll", "lib/plugin.dll"));
        assert!(!pack_pattern_matches("lib/*.dll", "lib/nested/plugin.dll"));
    }

    #[test]
    fn builds_pack_entries_from_manifest_config() {
        let root = temp_test_dir("entries");
        write_file(
            &root.join("plugin.json"),
            r#"{
                "uuid": "sample",
                "packid": "sample",
                "displayName": "Sample",
                "entry": "dist/index.html",
                "pack": {
                    "includes": ["README.md"],
                    "excludes": ["dist/ignored.js"]
                }
            }"#,
        );
        write_file(&root.join("dist/index.html"), "<main></main>");
        write_file(&root.join("dist/ignored.js"), "ignored");
        write_file(&root.join("README.md"), "readme");
        write_file(&root.join("src/dev-only.ts"), "dev only");

        let entries = build_pack_file_entries(&root, &root.join("plugin.json"))
            .expect("build pack entries")
            .into_iter()
            .map(|(_, relative)| relative)
            .collect::<Vec<_>>();

        assert_eq!(entries, vec!["README.md", "dist/index.html", "plugin.json"]);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn packs_bound_plugin_and_updates_local_catalog() {
        let root = temp_test_dir("bound");
        let plugin_root = root.join("plugin");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        let packs_dir = root.join("packs");
        let catalog_path = root.join("local_catalog.json");

        write_file(
            &plugin_root.join("plugin.json"),
            r#"{
                "uuid": "sample-uuid",
                "packid": "sample.plugin",
                "displayName": "Sample",
                "entry": "dist/index.html",
                "pack": {}
            }"#,
        );
        write_file(&plugin_root.join("dist/index.html"), "<main></main>");

        let meta = otools_plugin_dev_state::DevPluginMetaRecord {
            uuid: "sample-uuid".to_string(),
            packid: "sample.plugin".to_string(),
            display_name: "Sample".to_string(),
            developer_name: "Developer".to_string(),
            version: "1.2.3".to_string(),
            icon: "🧩".to_string(),
            ..Default::default()
        };
        let binding = otools_plugin_dev_state::DevPluginBindingRecord {
            uuid: "sample-uuid".to_string(),
            directory_path: plugin_root.to_string_lossy().to_string(),
            plugin_manifest_path: String::new(),
            ..Default::default()
        };
        write_meta_state(&meta_path, &[meta]).expect("write meta state");
        write_binding_state(&binding_path, &[binding]).expect("write binding state");

        let result = pack_bound_plugin_for_uuid_with_catalog_path(
            &meta_path,
            &binding_path,
            &packs_dir,
            "sample-uuid",
            Some(&catalog_path),
        )
        .expect("pack bound plugin");

        assert_eq!(result.uuid, "sample-uuid");
        assert!(result.pack_path.exists());
        assert!(result.pack_path.starts_with(&packs_dir));

        let catalog = catalog::read_json_file::<Value>(&catalog_path).expect("read catalog");
        let items = catalog
            .get("items")
            .and_then(Value::as_array)
            .expect("catalog items");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].get("uuid").and_then(Value::as_str), Some("sample-uuid"));

        fs::remove_dir_all(root).ok();
    }
}

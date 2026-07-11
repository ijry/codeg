use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use otools_core::catalog::{self, ToolPluginAutostart, ToolPluginShutdownHook};
use otools_core::{HostError, HostErrorCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PluginPackageManifest {
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
    pub min_otools_version: Option<String>,
    pub icon: String,
    pub key: Vec<String>,
    pub entry: Option<String>,
    pub open_in_browser: Option<bool>,
    pub autostart: Option<ToolPluginAutostart>,
    pub shutdown_hooks: Option<Vec<ToolPluginShutdownHook>>,
    pub permissions: Vec<String>,
}

pub fn extract_zip_archive(zip_path: &Path, target_dir: &Path) -> Result<(), HostError> {
    let file = fs::File::open(zip_path).map_err(HostError::io)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| package_error(error.to_string()))?;
    let strip_root = detect_archive_wrapper_dir(&mut archive)?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| package_error(error.to_string()))?;
        let Some(relative) = sanitize_zip_entry(Path::new(file.name())) else {
            continue;
        };
        if is_macos_metadata_entry(&relative) {
            continue;
        }
        let relative = strip_archive_wrapper_dir(&relative, strip_root.as_deref());
        if relative.as_os_str().is_empty() {
            continue;
        }
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

pub fn detect_effective_plugin_root(install_root: &Path) -> PathBuf {
    if let Some(plugin_root) = catalog::resolve_plugin_adapter_root(install_root) {
        return plugin_root;
    }
    if install_root.join("index.html").is_file() {
        return install_root.to_path_buf();
    }

    let subdirs = match fs::read_dir(install_root) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect::<Vec<PathBuf>>(),
        Err(_) => Vec::new(),
    };
    if subdirs.len() == 1 {
        let nested = subdirs[0].clone();
        if let Some(plugin_root) = catalog::resolve_plugin_adapter_root(&nested) {
            return plugin_root;
        }
        if nested.join("index.html").is_file() {
            return nested;
        }
    }

    install_root.to_path_buf()
}

pub fn move_or_replace_dir(from: &Path, to: &Path) -> Result<(), HostError> {
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

pub fn read_package_manifest(
    plugin_root: &Path,
) -> Result<Option<PluginPackageManifest>, HostError> {
    let Some(manifest_path) = catalog::resolve_plugin_manifest_path(plugin_root) else {
        return Ok(None);
    };
    let value = catalog::read_json_file::<Value>(&manifest_path)?;
    serde_json::from_value::<PluginPackageManifest>(value)
        .map(Some)
        .map_err(|error| {
            HostError::configuration_invalid("Invalid plugin package manifest")
                .with_detail(format!("{}: {error}", manifest_path.display()))
        })
}

fn package_error(message: impl Into<String>) -> HostError {
    HostError::new(HostErrorCode::TaskExecutionFailed, message)
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

fn zip_entry_parts(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect()
}

fn is_macos_metadata_entry(path: &Path) -> bool {
    zip_entry_parts(path)
        .first()
        .map(|part| part == "__MACOSX")
        .unwrap_or(false)
}

fn detect_archive_wrapper_dir(
    archive: &mut zip::ZipArchive<fs::File>,
) -> Result<Option<String>, HostError> {
    let mut common_root: Option<String> = None;
    let mut has_nested_file = false;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| package_error(error.to_string()))?;
        let Some(enclosed) = sanitize_zip_entry(Path::new(entry.name())) else {
            continue;
        };
        if is_macos_metadata_entry(&enclosed) {
            continue;
        }
        let parts = zip_entry_parts(&enclosed);
        if parts.is_empty() {
            continue;
        }

        let first = parts[0].clone();
        match common_root.as_deref() {
            Some(existing) if existing != first => return Ok(None),
            None => common_root = Some(first),
            _ => {}
        }

        if !entry.is_dir() {
            if parts.len() < 2 {
                return Ok(None);
            }
            has_nested_file = true;
        }
    }

    if has_nested_file {
        Ok(common_root)
    } else {
        Ok(None)
    }
}

fn strip_archive_wrapper_dir(path: &Path, wrapper: Option<&str>) -> PathBuf {
    let Some(wrapper_name) = wrapper else {
        return path.to_path_buf();
    };

    let mut output = PathBuf::new();
    let mut components = path.components();
    match components.next() {
        Some(Component::Normal(name)) if name.to_string_lossy() == wrapper_name => {}
        _ => return path.to_path_buf(),
    }
    for component in components {
        if let Component::Normal(name) = component {
            output.push(name);
        }
    }
    output
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-package-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn create_zip(path: &Path, entries: &[(&str, &str)]) {
        let file = fs::File::create(path).expect("create zip");
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, content) in entries {
            zip.start_file(name, options).expect("start zip file");
            zip.write_all(content.as_bytes()).expect("write zip file");
        }
        zip.finish().expect("finish zip");
    }

    #[test]
    fn extract_zip_archive_strips_common_wrapper_and_macos_metadata() {
        let root = temp_test_dir("extract-wrapper");
        let zip_path = root.join("plugin.oplg");
        let out_dir = root.join("out");
        create_zip(
            &zip_path,
            &[
                (
                    "plugin-wrapper/otools/plugin.json",
                    r#"{"uuid":"sample","packid":"sample","displayName":"Sample"}"#,
                ),
                (
                    "plugin-wrapper/otools/dist/index.html",
                    "<main>Sample</main>",
                ),
                ("__MACOSX/plugin-wrapper/._plugin.json", "metadata"),
            ],
        );

        extract_zip_archive(&zip_path, &out_dir).expect("extract zip");

        assert!(out_dir.join("otools/plugin.json").is_file());
        assert!(out_dir.join("otools/dist/index.html").is_file());
        assert!(!out_dir.join("plugin-wrapper").exists());
        assert!(!out_dir.join("__MACOSX").exists());

        let _ = fs::remove_dir_all(root);
    }
}

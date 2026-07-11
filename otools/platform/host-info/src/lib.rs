use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use otools_core::catalog;
use otools_core::HostError;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostInfo {
    pub app_name: String,
    pub app_version: String,
    pub data_dir: String,
    pub is_dev: bool,
    pub native_id: String,
    pub plugin_roots: Vec<String>,
    pub plugin_count: usize,
    pub platform: String,
    pub paths: BTreeMap<String, String>,
}

pub async fn otools_host_info() -> Result<OtoolsHostInfo, HostError> {
    Ok(OtoolsHostInfo {
        app_name: "codeg-plus".to_string(),
        app_version: String::new(),
        data_dir: otools_core::default_data_dir()
            .to_string_lossy()
            .to_string(),
        is_dev: cfg!(debug_assertions),
        native_id: get_or_create_otools_native_id()?,
        plugin_roots: otools_plugin_registry::plugin_roots()
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        plugin_count: otools_plugin_registry::list_plugins().await?.len(),
        platform: std::env::consts::OS.to_string(),
        paths: build_host_paths(),
    })
}

fn build_host_paths() -> BTreeMap<String, String> {
    let mut paths = BTreeMap::new();
    let data_root = otools_core::default_data_dir();

    insert_path(&mut paths, "home", dirs::home_dir());
    insert_path(&mut paths, "desktop", dirs::desktop_dir());
    insert_path(&mut paths, "documents", dirs::document_dir());
    insert_path(&mut paths, "downloads", dirs::download_dir());
    insert_path(&mut paths, "music", dirs::audio_dir());
    insert_path(&mut paths, "pictures", dirs::picture_dir());
    insert_path(&mut paths, "videos", dirs::video_dir());
    insert_path(&mut paths, "cache", dirs::cache_dir());
    insert_path(&mut paths, "config", dirs::config_dir());
    insert_path(&mut paths, "data", dirs::data_dir());
    insert_path(&mut paths, "localData", dirs::data_local_dir());
    insert_path(&mut paths, "public", dirs::public_dir());
    insert_path(&mut paths, "appData", dirs::data_dir());
    insert_path(&mut paths, "userData", Some(data_root.clone()));
    insert_path(&mut paths, "appConfig", Some(data_root.join("config")));
    insert_path(&mut paths, "appCache", Some(data_root.join("cache")));
    insert_path(&mut paths, "temp", Some(std::env::temp_dir()));
    insert_path(
        &mut paths,
        "resource",
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.to_path_buf())),
    );
    insert_path(&mut paths, "executable", dirs::executable_dir());
    insert_path(&mut paths, "font", dirs::font_dir());
    insert_path(&mut paths, "runtime", dirs::runtime_dir());
    insert_path(&mut paths, "template", dirs::template_dir());
    insert_path(
        &mut paths,
        "logs",
        Some(otools_core::default_data_dir().join("logs")),
    );

    paths
}

fn insert_path(paths: &mut BTreeMap<String, String>, key: &str, value: Option<PathBuf>) {
    let Some(path) = value else {
        return;
    };
    paths.insert(key.to_string(), path.to_string_lossy().to_string());
}

fn get_or_create_otools_native_id() -> Result<String, HostError> {
    let path = catalog::otools_root_dir().join("native-id.txt");

    if let Ok(value) = fs::read_to_string(&path) {
        let native_id = value.trim();
        if !native_id.is_empty() {
            return Ok(native_id.to_string());
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }

    let native_id = uuid::Uuid::new_v4().to_string();
    fs::write(&path, &native_id).map_err(HostError::io)?;
    Ok(native_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_paths_include_codeg_data_paths() {
        let paths = build_host_paths();

        assert!(paths.contains_key("userData"));
        assert!(paths.contains_key("appConfig"));
        assert!(paths.contains_key("appCache"));
        assert!(paths.contains_key("logs"));
    }
}

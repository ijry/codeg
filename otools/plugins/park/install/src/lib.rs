use std::fs;
use std::path::PathBuf;

use chrono::Local;
use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_package::{extract_zip_archive, move_or_replace_dir};
use otools_plugin_park_catalog::{
    normalize_remote_package_url, validate_min_otools_version, ParkCatalogItem,
};
use otools_plugin_park_download::{download_easy_mode_logo, download_or_copy_package};
use otools_plugin_park_install_record::{
    build_easy_mode_package_manifest, build_plugin_record_from_install,
};
use otools_plugin_support::sanitize_plugin_packid_or;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ParkInstallContext {
    pub current_otools_version: String,
    pub downloads_dir: PathBuf,
    pub plugins_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkInstallResult {
    pub uuid: String,
    pub packid: String,
    pub display_name: String,
    #[serde(rename = "displayNameCN", skip_serializing_if = "Option::is_none")]
    pub display_name_cn: Option<String>,
    pub download_path: String,
    pub install_path: String,
    pub all_plugins_count: usize,
    pub message: String,
}

pub async fn install_catalog_item(
    item: &ParkCatalogItem,
    context: &ParkInstallContext,
) -> Result<ParkInstallResult, HostError> {
    if item.easy_mode > 0 {
        return install_easy_mode_catalog_item(item, context).await;
    }
    let requested_packid = item.packid.trim().to_string();
    if requested_packid.is_empty() {
        return Err(HostError::invalid_input("插件 packID 不能为空"));
    }
    let package_url = normalize_remote_package_url(&item.package_url);
    if package_url.is_empty() {
        return Err(HostError::invalid_input(format!(
            "插件 {requested_packid} 缺少下载地址"
        )));
    }
    validate_min_otools_version(
        &item.display_name,
        &item.min_otools_version,
        &context.current_otools_version,
    )?;
    catalog::ensure_dir_exists(&context.downloads_dir)?;
    catalog::ensure_dir_exists(&context.plugins_dir)?;
    let timestamp = Local::now().format("%Y%m%d%H%M%S").to_string();
    let download_path = context
        .downloads_dir
        .join(format!("{requested_packid}-{timestamp}.oplg"));
    download_or_copy_package(&package_url, &download_path).await?;
    let staging_dir = context
        .plugins_dir
        .join(format!(".__installing__{requested_packid}-{timestamp}"));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(HostError::io)?;
    }
    catalog::ensure_dir_exists(&staging_dir)?;
    extract_zip_archive(&download_path, &staging_dir)?;
    let first_record = build_plugin_record_from_install(item, &staging_dir)?;
    validate_min_otools_version(
        &first_record.display_name,
        first_record
            .min_otools_version
            .as_deref()
            .unwrap_or(&item.min_otools_version),
        &context.current_otools_version,
    )?;
    let final_dir_name = sanitize_plugin_packid(if first_record.uuid.trim().is_empty() {
        &first_record.packid
    } else {
        &first_record.uuid
    });
    if final_dir_name.is_empty() {
        return Err(HostError::invalid_input(
            "安装插件失败: 解析到的插件 UUID 为空",
        ));
    }
    let final_install_dir = context.plugins_dir.join(final_dir_name);
    move_or_replace_dir(&staging_dir, &final_install_dir)?;
    let plugin_record = build_plugin_record_from_install(item, &final_install_dir)?;
    let all_plugins = catalog::upsert_external_plugin(plugin_record.clone())?;
    Ok(ParkInstallResult {
        uuid: plugin_record.uuid,
        packid: plugin_record.packid,
        display_name: plugin_record.display_name.clone(),
        display_name_cn: plugin_record.display_name_cn,
        download_path: download_path.to_string_lossy().to_string(),
        install_path: final_install_dir.to_string_lossy().to_string(),
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {} 安装成功", plugin_record.display_name),
    })
}

async fn install_easy_mode_catalog_item(
    item: &ParkCatalogItem,
    context: &ParkInstallContext,
) -> Result<ParkInstallResult, HostError> {
    let requested_packid = item.packid.trim().to_string();
    if requested_packid.is_empty() {
        return Err(HostError::invalid_input("插件 packID 不能为空"));
    }
    if item.entry.trim().is_empty() {
        return Err(HostError::invalid_input(format!(
            "插件 {requested_packid} 缺少 entry"
        )));
    }
    validate_min_otools_version(
        &item.display_name,
        &item.min_otools_version,
        &context.current_otools_version,
    )?;
    catalog::ensure_dir_exists(&context.plugins_dir)?;
    let uuid = if item.uuid.trim().is_empty() {
        requested_packid.clone()
    } else {
        item.uuid.trim().to_string()
    };
    let dir_name = sanitize_plugin_packid(&uuid);
    let install_dir = context.plugins_dir.join(&dir_name);
    if install_dir.exists() {
        fs::remove_dir_all(&install_dir).map_err(HostError::io)?;
    }
    catalog::ensure_dir_exists(&install_dir)?;
    let logo_path = install_dir.join("logo.png");
    download_easy_mode_logo(&item.icon, &logo_path).await?;
    let manifest = build_easy_mode_package_manifest(item, &uuid, &requested_packid);
    catalog::write_json_file(&install_dir.join("plugin.json"), &manifest)?;
    let plugin_record = build_plugin_record_from_install(item, &install_dir)?;
    let all_plugins = catalog::upsert_external_plugin(plugin_record.clone())?;
    Ok(ParkInstallResult {
        uuid: plugin_record.uuid,
        packid: plugin_record.packid,
        display_name: plugin_record.display_name.clone(),
        display_name_cn: plugin_record.display_name_cn,
        download_path: String::new(),
        install_path: install_dir.to_string_lossy().to_string(),
        all_plugins_count: all_plugins.len(),
        message: format!("插件 {} 安装成功", plugin_record.display_name),
    })
}

fn sanitize_plugin_packid(raw: &str) -> String {
    sanitize_plugin_packid_or(raw, "offline-plugin")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_context_is_cloneable_for_host_boundaries() {
        let context = ParkInstallContext {
            current_otools_version: "1.0.0".to_string(),
            downloads_dir: PathBuf::from("downloads"),
            plugins_dir: PathBuf::from("plugins"),
        };

        let cloned = context.clone();

        assert_eq!(cloned.current_otools_version, "1.0.0");
        assert_eq!(cloned.downloads_dir, PathBuf::from("downloads"));
        assert_eq!(cloned.plugins_dir, PathBuf::from("plugins"));
    }
}

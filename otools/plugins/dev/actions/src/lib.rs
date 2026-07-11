use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_api::{
    DevBindDirectoryInput, DevNativeBuildJobSnapshot, DevNativeBuildJobStart, DevNativeConfig,
    DevPluginActionResult, DevPluginRecord, DevWorkspace,
};
use otools_plugin_dev_debug::{
    disable_debug_plugin_for_uuid, enable_debug_plugin_for_uuid,
    refresh_debug_plugin_after_meta_update,
};
use otools_plugin_dev_manifest::{
    native_plugin_install_manifest_path, read_native_config_for_uuid, set_native_enabled_for_uuid,
    sync_bound_manifest_basic_fields,
};
use otools_plugin_dev_model::{DevPluginInput, DevPluginUpdateInput, DevPublishVersionInput};
use otools_plugin_dev_native_build::{
    build_native_artifact_for_target, build_native_artifact_for_target_with_job_log,
    get_native_build_job as get_native_build_job_snapshot, resolve_native_build_target,
    resolve_native_build_target_for_uuid, start_native_build_job,
};
use otools_plugin_dev_package::pack_bound_plugin_for_uuid;
use otools_plugin_dev_repo_sync::ensure_dev_workspace as ensure_dev_workspace_state;
use otools_plugin_dev_scaffold::{
    initialize_native_project_for_uuid, initialize_vue_project_for_uuid,
};
use otools_plugin_dev_state::{
    create_plugin_meta_record, publish_version_record_to_state, read_binding_state,
    update_plugin_meta_record, upsert_binding_record,
};
use otools_plugin_dev_workspace::{
    build_dev_workspace, find_dev_workspace_item, validate_bound_directory,
};

pub const DEV_DOCS_URL: &str = "https://otools.lingyun.net/guide/overview";

#[derive(Debug, Clone)]
pub struct DevActionPaths {
    meta_state_path: PathBuf,
    binding_state_path: PathBuf,
    packs_dir: PathBuf,
    docs_url: String,
}

impl DevActionPaths {
    pub fn new(
        meta_state_path: impl Into<PathBuf>,
        binding_state_path: impl Into<PathBuf>,
        packs_dir: impl Into<PathBuf>,
        docs_url: impl Into<String>,
    ) -> Self {
        Self {
            meta_state_path: meta_state_path.into(),
            binding_state_path: binding_state_path.into(),
            packs_dir: packs_dir.into(),
            docs_url: docs_url.into(),
        }
    }

    pub fn from_catalog() -> Self {
        let local_root = catalog::dev_local_root_dir();
        Self::new(
            catalog::plugin_sync_state_path("dev"),
            local_root.join("state.json"),
            local_root.join("packs"),
            DEV_DOCS_URL,
        )
    }

    pub fn meta_state_path(&self) -> &Path {
        &self.meta_state_path
    }

    pub fn binding_state_path(&self) -> &Path {
        &self.binding_state_path
    }

    pub fn packs_dir(&self) -> &Path {
        &self.packs_dir
    }

    pub fn docs_url(&self) -> &str {
        &self.docs_url
    }
}

impl Default for DevActionPaths {
    fn default() -> Self {
        Self::from_catalog()
    }
}

pub fn ensure_dev_workspace(paths: &DevActionPaths) -> Result<(), HostError> {
    ensure_dev_workspace_state(
        paths.meta_state_path(),
        paths.binding_state_path(),
        paths.packs_dir(),
    )
}

fn find_workspace_item(paths: &DevActionPaths, uuid: &str) -> Result<DevPluginRecord, HostError> {
    find_dev_workspace_item(
        paths.meta_state_path(),
        paths.binding_state_path(),
        paths.packs_dir(),
        uuid,
        catalog::is_debug_registered,
    )
}

pub fn get_workspace(paths: &DevActionPaths) -> Result<DevWorkspace, HostError> {
    ensure_dev_workspace(paths)?;
    build_dev_workspace(
        paths.meta_state_path(),
        paths.binding_state_path(),
        paths.packs_dir(),
        paths.docs_url(),
        catalog::is_debug_registered,
    )
}

pub fn create_plugin(
    paths: &DevActionPaths,
    input: DevPluginInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace(paths)?;
    let record = create_plugin_meta_record(paths.meta_state_path(), input)?;
    Ok(DevPluginActionResult {
        message: format!("开发插件 {} 已创建", record.display_name),
        item: find_workspace_item(paths, &record.uuid)?,
    })
}

pub fn update_plugin(
    paths: &DevActionPaths,
    input: DevPluginUpdateInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace(paths)?;
    let update = update_plugin_meta_record(paths.meta_state_path(), input, |_, next| {
        let bindings = read_binding_state(paths.binding_state_path())?;
        sync_bound_manifest_basic_fields(&bindings, &next.uuid, next)
    })?;
    refresh_debug_plugin_after_meta_update(
        paths.binding_state_path(),
        &update.previous,
        &update.next,
    )?;
    Ok(DevPluginActionResult {
        message: format!("插件 {} 基础信息已保存", update.next.display_name),
        item: find_workspace_item(paths, &update.next.uuid)?,
    })
}

pub fn bind_plugin_directory(
    paths: &DevActionPaths,
    input: DevBindDirectoryInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace(paths)?;
    let uuid = input.uuid.trim().to_string();
    if uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    let (directory_path, manifest_path) = validate_bound_directory(&input.directory_path)?;
    upsert_binding_record(
        paths.meta_state_path(),
        paths.binding_state_path(),
        &uuid,
        &directory_path,
        &manifest_path,
    )?;
    Ok(DevPluginActionResult {
        message: format!("已绑定开发目录: {directory_path}"),
        item: find_workspace_item(paths, &uuid)?,
    })
}

pub fn enable_debug(paths: &DevActionPaths, uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace(paths)?;
    let meta =
        enable_debug_plugin_for_uuid(paths.meta_state_path(), paths.binding_state_path(), &uuid)?;
    Ok(format!(
        "已开启调试，可在 OTools 首页直接打开 {}",
        meta.display_name
    ))
}

pub fn disable_debug(paths: &DevActionPaths, uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace(paths)?;
    let meta = disable_debug_plugin_for_uuid(paths.meta_state_path(), &uuid)?;
    Ok(format!("已取消调试: {}", meta.display_name))
}

pub fn initialize_vue_project(paths: &DevActionPaths, uuid: String) -> Result<String, HostError> {
    ensure_dev_workspace(paths)?;
    initialize_vue_project_for_uuid(paths.meta_state_path(), paths.binding_state_path(), &uuid)
}

pub fn initialize_native_project(
    paths: &DevActionPaths,
    uuid: String,
) -> Result<String, HostError> {
    ensure_dev_workspace(paths)?;
    initialize_native_project_for_uuid(paths.meta_state_path(), paths.binding_state_path(), &uuid)
}

pub fn build_native_plugin(paths: &DevActionPaths, uuid: String) -> Result<String, HostError> {
    let target = resolve_native_build_target_for_uuid(
        &uuid,
        paths.meta_state_path(),
        paths.binding_state_path(),
    )?;
    build_native_artifact_for_target(
        &target.plugin_root,
        &target.native_dir,
        &target.packid,
        Some(&target.plugin_uuid),
    )
}

pub fn build_native_artifact(paths: &DevActionPaths, uuid: String) -> Result<String, HostError> {
    let target = resolve_native_build_target_for_uuid(
        &uuid,
        paths.meta_state_path(),
        paths.binding_state_path(),
    )?;
    build_native_artifact_for_target(
        &target.plugin_root,
        &target.native_dir,
        &target.packid,
        None,
    )
}

pub fn build_native_artifact_from_dir(directory_path: String) -> Result<String, HostError> {
    let (plugin_root, native_dir, packid) = resolve_native_build_target(&directory_path)?;
    build_native_artifact_for_target(&plugin_root, &native_dir, &packid, None)
}

pub fn start_native_plugin_build(
    paths: &DevActionPaths,
    uuid: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    let target = resolve_native_build_target_for_uuid(
        &uuid,
        paths.meta_state_path(),
        paths.binding_state_path(),
    )?;
    start_native_build_job("开始构建原生库", move |job| {
        build_native_artifact_for_target_with_job_log(
            &target.plugin_root,
            &target.native_dir,
            &target.packid,
            Some(&target.plugin_uuid),
            Some(job),
        )
    })
}

pub fn start_native_artifact_build_from_dir(
    directory_path: String,
) -> Result<DevNativeBuildJobStart, HostError> {
    let (plugin_root, native_dir, packid) = resolve_native_build_target(&directory_path)?;
    start_native_build_job("开始独立构建原生库", move |job| {
        build_native_artifact_for_target_with_job_log(
            &plugin_root,
            &native_dir,
            &packid,
            None,
            Some(job),
        )
    })
}

pub fn get_native_build_job(job_id: String) -> Result<DevNativeBuildJobSnapshot, HostError> {
    get_native_build_job_snapshot(&job_id)
}

pub fn get_native_config(
    paths: &DevActionPaths,
    uuid: String,
) -> Result<DevNativeConfig, HostError> {
    read_native_config_for_uuid(paths.binding_state_path(), &uuid)
}

pub fn set_native_enabled(
    paths: &DevActionPaths,
    uuid: String,
    enabled: bool,
) -> Result<String, HostError> {
    let install_manifest_path = native_plugin_install_manifest_path(&uuid);
    set_native_enabled_for_uuid(
        paths.meta_state_path(),
        paths.binding_state_path(),
        &uuid,
        enabled,
        install_manifest_path.as_deref(),
    )?;
    Ok(if enabled {
        "已启用原生插件能力".to_string()
    } else {
        "已关闭原生插件能力".to_string()
    })
}

pub fn pack_plugin(
    paths: &DevActionPaths,
    uuid: String,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace(paths)?;
    let pack_result = pack_bound_plugin_for_uuid(
        paths.meta_state_path(),
        paths.binding_state_path(),
        paths.packs_dir(),
        &uuid,
    )?;
    Ok(DevPluginActionResult {
        message: format!("已生成插件包: {}", pack_result.pack_path.display()),
        item: find_workspace_item(paths, &pack_result.uuid)?,
    })
}

pub fn publish_version(
    paths: &DevActionPaths,
    input: DevPublishVersionInput,
) -> Result<DevPluginActionResult, HostError> {
    ensure_dev_workspace(paths)?;
    let version = input.version.trim().to_string();
    let uuid_for_result = publish_version_record_to_state(paths.meta_state_path(), input)?;
    Ok(DevPluginActionResult {
        message: format!("版本 {} 已加入远程版本列表模拟数据", version),
        item: find_workspace_item(paths, &uuid_for_result)?,
    })
}

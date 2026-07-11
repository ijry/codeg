use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_api::{DevNativeBuildJobSnapshot, DevNativeBuildJobStart};
use otools_plugin_dev_state::{read_binding_state, read_meta_state};
use otools_plugin_support::{package_name_from_pack_id, sanitize_plugin_packid};
pub use otools_platform_native_contract::{native_build_artifact_path, native_platform_lib_name};
use serde_json::Value;
use uuid::Uuid;

pub type NativeBuildLogSink = Arc<dyn Fn(&str) + Send + Sync + 'static>;

#[derive(Debug, Default)]
pub struct NativeBuildJobState {
    running: bool,
    success: Option<bool>,
    log: String,
    message: String,
    error: String,
}

pub type NativeBuildJobHandle = Arc<Mutex<NativeBuildJobState>>;
type NativeBuildJobs = Arc<Mutex<HashMap<String, NativeBuildJobHandle>>>;

static NATIVE_BUILD_JOBS: OnceLock<NativeBuildJobs> = OnceLock::new();

fn native_build_jobs() -> &'static NativeBuildJobs {
    NATIVE_BUILD_JOBS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[derive(Debug, Clone)]
pub struct NativeBuildRequest {
    pub plugin_root: PathBuf,
    pub native_dir: PathBuf,
    pub packid: String,
    pub sync_runtime: bool,
    pub sync_lib_dir: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct NativeBuildTarget {
    pub plugin_root: PathBuf,
    pub native_dir: PathBuf,
    pub packid: String,
    pub plugin_uuid: String,
}

pub fn extract_cargo_package_name(native_dir: &Path) -> Option<String> {
    let cargo_path = native_dir.join("Cargo.toml");
    let content = fs::read_to_string(&cargo_path).ok()?;
    let mut in_package = false;
    for line in content.lines() {
        let raw = line.trim();
        if raw.starts_with('[') && raw.ends_with(']') {
            in_package = raw.eq_ignore_ascii_case("[package]");
            continue;
        }
        if !in_package || !raw.starts_with("name") {
            continue;
        }
        let mut parts = raw.splitn(2, '=');
        let key = parts.next()?.trim();
        if key != "name" {
            continue;
        }
        let value = parts.next()?.trim();
        let trimmed = value.trim_matches(|ch| ch == '"' || ch == '\'').trim();
        if trimmed.is_empty() {
            return None;
        }
        return Some(trimmed.to_string());
    }
    None
}

pub fn native_lib_basename_from_packid(packid: &str, native_dir: &Path) -> String {
    let fallback = if packid.trim().is_empty() {
        "native-plugin".to_string()
    } else {
        format!(
            "{}-native",
            package_name_from_pack_id(packid, "native-plugin")
        )
    };
    let crate_name = extract_cargo_package_name(native_dir).unwrap_or(fallback);
    crate_name.replace('-', "_")
}

pub fn native_plugin_install_lib_dir(uuid: &str) -> Option<PathBuf> {
    let normalized = sanitize_plugin_packid(uuid);
    if normalized.is_empty() {
        return None;
    }
    Some(catalog::installed_plugins_dir().join(normalized).join("lib"))
}

pub fn resolve_native_build_target_for_uuid(
    uuid: &str,
    meta_path: &Path,
    binding_path: &Path,
) -> Result<NativeBuildTarget, HostError> {
    let normalized_uuid = uuid.trim();
    let meta = read_meta_state(meta_path)?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))?;
    let bindings = read_binding_state(binding_path)?;
    let binding = bindings
        .into_iter()
        .find(|item| item.uuid == meta.uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))?;
    let plugin_root = resolve_bound_plugin_root(&binding.directory_path)?;
    let native_dir = plugin_root.join("native");
    Ok(NativeBuildTarget {
        plugin_root,
        native_dir,
        packid: meta.packid,
        plugin_uuid: meta.uuid,
    })
}

fn resolve_bound_plugin_root(directory_path: &str) -> Result<PathBuf, HostError> {
    catalog::resolve_plugin_adapter_root(Path::new(directory_path.trim())).ok_or_else(|| {
        HostError::not_found(format!("无法解析插件根目录: {}", directory_path.trim()))
    })
}

pub fn resolve_native_build_target(
    directory_path: &str,
) -> Result<(PathBuf, PathBuf, String), HostError> {
    let input = PathBuf::from(directory_path.trim());
    if !input.exists() || !input.is_dir() {
        return Err(HostError::not_found(format!(
            "原生构建目录不存在: {}",
            input.display()
        )));
    }

    let (plugin_root, native_dir) =
        if let Some(plugin_root) = catalog::resolve_plugin_adapter_root(&input) {
            let native_dir = plugin_root.join("native");
            (plugin_root, native_dir)
        } else if input.join("native").join("Cargo.toml").is_file() {
            let native_dir = input.join("native");
            (input, native_dir)
        } else if input.join("Cargo.toml").is_file() {
            let native_dir = input;
            let plugin_root = native_dir
                .parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| HostError::not_found("无法定位插件根目录"))?;
            (plugin_root, native_dir)
        } else {
            return Err(HostError::not_found(format!(
                "未找到插件根目录、otools/plugin.json 或 native/Cargo.toml: {}",
                input.display()
            )));
        };

    if !native_dir.join("Cargo.toml").is_file() {
        return Err(HostError::not_found(format!(
            "未找到 native 工程: {}",
            native_dir.join("Cargo.toml").display()
        )));
    }

    let packid = catalog::resolve_plugin_manifest_path(&plugin_root)
        .filter(|manifest_path| manifest_path.exists())
        .and_then(|manifest_path| read_packid_from_manifest(&manifest_path))
        .unwrap_or_default();
    Ok((plugin_root, native_dir, packid))
}

pub fn build_native_artifact_with_log(
    request: &NativeBuildRequest,
    log_sink: Option<NativeBuildLogSink>,
) -> Result<String, HostError> {
    if !request.native_dir.join("Cargo.toml").is_file() {
        return Err(HostError::not_found(format!(
            "原生工程不存在: {}",
            request.native_dir.display()
        )));
    }
    let log = run_native_cargo_build_with_log(&request.native_dir, log_sink.clone())?;
    let lib_basename = native_lib_basename_from_packid(&request.packid, &request.native_dir);
    let artifact = native_build_artifact_path(&request.native_dir, &lib_basename);
    if !artifact.exists() {
        return Err(HostError::not_found(format!(
            "构建完成但未找到产物: {}",
            artifact.display()
        )));
    }
    let lib_dir = request.plugin_root.join("lib");
    catalog::ensure_dir_exists(&lib_dir)?;
    let local_lib_path = lib_dir.join(native_platform_lib_name());
    fs::copy(&artifact, &local_lib_path).map_err(HostError::io)?;
    emit_log(
        &log_sink,
        &format!("已复制动态库: {}", local_lib_path.display()),
    );

    let mut sync_message = String::new();
    if let Some(install_lib_dir) = &request.sync_lib_dir {
        if let Err(error) = catalog::ensure_dir_exists(install_lib_dir) {
            sync_message = format!("\n同步到运行目录失败: {}", error.message);
            emit_log(&log_sink, sync_message.trim());
        } else {
            let install_lib_path = install_lib_dir.join(native_platform_lib_name());
            if let Err(error) = fs::copy(&local_lib_path, &install_lib_path) {
                sync_message = format!("\n同步到运行目录失败: {error}");
                emit_log(&log_sink, sync_message.trim());
            } else {
                sync_message = format!("\n已同步到运行目录: {}", install_lib_path.display());
                emit_log(&log_sink, sync_message.trim());
            }
        }
    }

    let prefix = if request.sync_runtime {
        "原生能力构建完成"
    } else {
        "独立构建完成"
    };
    if log.trim().is_empty() {
        Ok(format!(
            "{prefix}，动态库已复制到 {}{}",
            local_lib_path.display(),
            sync_message
        ))
    } else {
        Ok(format!(
            "{prefix}，动态库已复制到 {}\n{}{}",
            local_lib_path.display(),
            log,
            sync_message
        ))
    }
}

pub fn build_native_artifact(request: &NativeBuildRequest) -> Result<String, HostError> {
    build_native_artifact_with_log(request, None)
}

pub fn native_build_request(
    plugin_root: &Path,
    native_dir: &Path,
    packid: &str,
    sync_plugin_uuid: Option<&str>,
) -> NativeBuildRequest {
    NativeBuildRequest {
        plugin_root: plugin_root.to_path_buf(),
        native_dir: native_dir.to_path_buf(),
        packid: packid.to_string(),
        sync_runtime: sync_plugin_uuid.is_some(),
        sync_lib_dir: sync_plugin_uuid.and_then(native_plugin_install_lib_dir),
    }
}

pub fn build_native_artifact_for_target(
    plugin_root: &Path,
    native_dir: &Path,
    packid: &str,
    sync_plugin_uuid: Option<&str>,
) -> Result<String, HostError> {
    let request = native_build_request(plugin_root, native_dir, packid, sync_plugin_uuid);
    build_native_artifact(&request)
}

pub fn build_native_artifact_with_job_log(
    request: &NativeBuildRequest,
    job: Option<NativeBuildJobHandle>,
) -> Result<String, HostError> {
    let log_sink = job.map(native_build_log_sink);
    build_native_artifact_with_log(request, log_sink)
}

pub fn build_native_artifact_for_target_with_job_log(
    plugin_root: &Path,
    native_dir: &Path,
    packid: &str,
    sync_plugin_uuid: Option<&str>,
    job: Option<NativeBuildJobHandle>,
) -> Result<String, HostError> {
    let request = native_build_request(plugin_root, native_dir, packid, sync_plugin_uuid);
    build_native_artifact_with_job_log(&request, job)
}

pub fn start_native_build_job<F>(
    initial_log_line: &'static str,
    runner: F,
) -> Result<DevNativeBuildJobStart, HostError>
where
    F: FnOnce(NativeBuildJobHandle) -> Result<String, HostError> + Send + 'static,
{
    let job_id = Uuid::new_v4().to_string();
    let state = Arc::new(Mutex::new(NativeBuildJobState {
        running: true,
        message: "构建中".to_string(),
        ..NativeBuildJobState::default()
    }));
    native_build_jobs()
        .lock()
        .map_err(|_| HostError::task_execution_failed("Native build job lock poisoned"))?
        .insert(job_id.clone(), state.clone());
    thread::spawn(move || {
        append_native_build_log(&state, initial_log_line);
        let result = runner(Arc::clone(&state));
        if let Ok(mut guard) = state.lock() {
            guard.running = false;
            match result {
                Ok(message) => {
                    guard.success = Some(true);
                    guard.message = message.clone();
                    guard.log.push_str(&message);
                    guard.log.push('\n');
                }
                Err(error) => {
                    guard.success = Some(false);
                    guard.error = error.message.clone();
                    guard.log.push_str(&error.message);
                    guard.log.push('\n');
                }
            }
        }
    });
    Ok(DevNativeBuildJobStart { job_id })
}

pub fn get_native_build_job(job_id: &str) -> Result<DevNativeBuildJobSnapshot, HostError> {
    let normalized_job_id = job_id.trim().to_string();
    let state = native_build_jobs()
        .lock()
        .map_err(|_| HostError::task_execution_failed("Native build job lock poisoned"))?
        .get(&normalized_job_id)
        .cloned()
        .ok_or_else(|| HostError::not_found("未找到构建任务"))?;
    let guard = state
        .lock()
        .map_err(|_| HostError::task_execution_failed("Native build job state lock poisoned"))?;
    Ok(DevNativeBuildJobSnapshot {
        job_id: normalized_job_id,
        running: guard.running,
        success: guard.success,
        log: guard.log.clone(),
        message: guard.message.clone(),
        error: guard.error.clone(),
    })
}

pub fn remove_native_build_job(job_id: &str) {
    if let Ok(mut jobs) = native_build_jobs().lock() {
        let _ = jobs.remove(job_id.trim());
    }
}

pub fn append_native_build_log(job: &NativeBuildJobHandle, line: &str) {
    if let Ok(mut state) = job.lock() {
        state.log.push_str(line);
        state.log.push('\n');
    }
}

pub fn native_build_log_sink(job: NativeBuildJobHandle) -> NativeBuildLogSink {
    Arc::new(move |line| append_native_build_log(&job, line))
}

fn emit_log(log_sink: &Option<NativeBuildLogSink>, line: &str) {
    if let Some(log_sink) = log_sink {
        log_sink(line);
    }
}

fn run_native_cargo_build_with_log(
    native_dir: &Path,
    log_sink: Option<NativeBuildLogSink>,
) -> Result<String, HostError> {
    let cargo_path = native_dir.join("Cargo.toml");
    if !cargo_path.is_file() {
        return Err(HostError::not_found(format!(
            "未找到 Cargo.toml: {}",
            cargo_path.display()
        )));
    }

    emit_log(
        &log_sink,
        &format!(
            "$ cargo build --release --target-dir target ({})",
            native_dir.display()
        ),
    );

    let mut child = Command::new("cargo")
        .args(["build", "--release", "--target-dir", "target"])
        .current_dir(native_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(HostError::io)?;

    let output_log = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();

    if let Some(stdout) = child.stdout.take() {
        let log_sink = log_sink.clone();
        let output_log = Arc::clone(&output_log);
        readers.push(thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(mut log) = output_log.lock() {
                    log.push_str(&line);
                    log.push('\n');
                }
                emit_log(&log_sink, &line);
            }
        }));
    }

    if let Some(stderr) = child.stderr.take() {
        let log_sink = log_sink.clone();
        let output_log = Arc::clone(&output_log);
        readers.push(thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(mut log) = output_log.lock() {
                    log.push_str(&line);
                    log.push('\n');
                }
                emit_log(&log_sink, &line);
            }
        }));
    }

    let status = child.wait().map_err(HostError::io)?;
    for reader in readers {
        let _ = reader.join();
    }

    let output = output_log
        .lock()
        .map(|log| log.trim().to_string())
        .unwrap_or_default();

    if !status.success() {
        if output.is_empty() {
            return Err(HostError::task_execution_failed(
                "构建失败，未输出错误信息",
            ));
        }
        return Err(HostError::task_execution_failed(format!(
            "构建失败: {output}"
        )));
    }

    if output.is_empty() {
        Ok("构建完成".to_string())
    } else {
        Ok(output)
    }
}

fn read_packid_from_manifest(manifest_path: &Path) -> Option<String> {
    catalog::read_json_file::<Value>(manifest_path)
        .ok()?
        .get("packid")
        .and_then(Value::as_str)
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use otools_plugin_dev_state::{
        write_binding_state, write_meta_state, DevPluginBindingRecord, DevPluginMetaRecord,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-native-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    fn write_file(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(path, content).expect("write test file");
    }

    #[test]
    fn native_artifact_path_uses_exact_cargo_package_name() {
        let root = temp_test_dir("native-artifact-path");
        let native_dir = root.join("native");
        write_file(
            &native_dir,
            "Cargo.toml",
            "[package]\nname = \"sample-tool-native\"\nversion = \"0.1.0\"\n",
        );

        let basename = native_lib_basename_from_packid("sample-tool", &native_dir);
        let artifact = native_build_artifact_path(&native_dir, &basename);

        assert_eq!(basename, "sample_tool_native");
        let file_name = artifact
            .file_name()
            .and_then(|value| value.to_str())
            .expect("artifact file name");
        if cfg!(target_os = "windows") {
            assert_eq!(file_name, "sample_tool_native.dll");
        } else if cfg!(target_os = "macos") {
            assert_eq!(file_name, "libsample_tool_native.dylib");
        } else {
            assert_eq!(file_name, "libsample_tool_native.so");
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn native_install_lib_dir_uses_sanitized_plugin_uuid() {
        let lib_dir = native_plugin_install_lib_dir(" Sample.Plugin ")
            .expect("native install lib dir");

        assert!(lib_dir.ends_with(PathBuf::from("sample-plugin").join("lib")));
        assert!(native_plugin_install_lib_dir("   ").is_none());
    }

    #[test]
    fn resolves_native_build_target_for_uuid_from_state() {
        let root = temp_test_dir("target-for-uuid");
        write_file(
            &root,
            "plugin.json",
            r#"{"uuid":"dev-uuid","packid":"otools-demo","displayName":"Demo"}"#,
        );
        write_file(
            &root,
            "native/Cargo.toml",
            "[package]\nname = \"otools-demo-native\"\nversion = \"0.1.0\"\n",
        );
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        write_meta_state(
            &meta_path,
            &[DevPluginMetaRecord {
                uuid: "dev-uuid".to_string(),
                packid: "otools-demo".to_string(),
                ..DevPluginMetaRecord::default()
            }],
        )
        .expect("write meta");
        write_binding_state(
            &binding_path,
            &[DevPluginBindingRecord {
                uuid: "dev-uuid".to_string(),
                directory_path: root.to_string_lossy().to_string(),
                plugin_manifest_path: root.join("plugin.json").to_string_lossy().to_string(),
                ..DevPluginBindingRecord::default()
            }],
        )
        .expect("write binding");

        let target =
            resolve_native_build_target_for_uuid(" dev-uuid ", &meta_path, &binding_path)
                .expect("resolve native target for uuid");

        assert_eq!(target.plugin_root, root);
        assert_eq!(target.native_dir, target.plugin_root.join("native"));
        assert_eq!(target.packid, "otools-demo");
        assert_eq!(target.plugin_uuid, "dev-uuid");
        let _ = fs::remove_dir_all(target.plugin_root);
    }

    #[test]
    fn resolve_native_build_target_accepts_nested_otools_manifest() {
        let root = temp_test_dir("nested-native-target");
        write_file(
            &root,
            "otools/plugin.json",
            r#"{"uuid":"demo","packid":"otools-demo","displayName":"Demo","entry":"dist/index.html"}"#,
        );
        write_file(
            &root,
            "otools/native/Cargo.toml",
            "[package]\nname = \"otools-demo-native\"\nversion = \"0.1.0\"\n",
        );

        let (plugin_root, native_dir, packid) =
            resolve_native_build_target(root.to_str().expect("temp path utf8"))
                .expect("resolve native target");

        assert_eq!(plugin_root, root.join("otools"));
        assert_eq!(native_dir, root.join("otools/native"));
        assert_eq!(packid, "otools-demo");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn start_native_job_appends_incremental_log_and_final_message() {
        let start = start_native_build_job("开始测试构建", |job| {
            append_native_build_log(&job, "cargo output line");
            Ok("构建完成".to_string())
        })
        .expect("start native job");

        for _ in 0..50 {
            let snapshot = get_native_build_job(&start.job_id).expect("job snapshot");
            if !snapshot.running {
                assert_eq!(snapshot.success, Some(true));
                assert!(snapshot.log.contains("开始测试构建\n"));
                assert!(snapshot.log.contains("cargo output line\n"));
                assert!(snapshot.log.contains("构建完成\n"));
                remove_native_build_job(&start.job_id);
                return;
            }
            thread::sleep(std::time::Duration::from_millis(10));
        }

        panic!("native job did not finish");
    }
}

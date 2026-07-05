use std::any::Any;
use std::collections::HashMap;
use std::fs;
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use libloading::Library;
use otools_core::catalog;
use serde::Deserialize;
use serde_json::{json, Value};

type InvokeFn = unsafe extern "C" fn(*const u8, usize, *mut usize) -> *mut u8;
type FreeFn = unsafe extern "C" fn(*mut u8, usize);
type NativePluginBindHostFn = unsafe extern "C" fn(*const OtoolsNativeHostApiV1);
type NativeHostDispatchFn = unsafe extern "C" fn(
    capability_ptr: *const u8,
    capability_len: usize,
    request_ptr: *const u8,
    request_len: usize,
    output_len: *mut usize,
) -> *mut u8;

struct NativePluginHandle {
    _lib: Library,
    invoke: InvokeFn,
    free: FreeFn,
    source_path: PathBuf,
    cache_path: PathBuf,
    source_modified: Option<SystemTime>,
    auto_reload: bool,
}

struct NativePluginEntry {
    config: NativePluginResolvedConfig,
    manifest_modified: Option<SystemTime>,
    handle: Option<NativePluginHandle>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct NativePluginConfig {
    enabled: Option<bool>,
    lib_dir: Option<String>,
    lib_name: Option<String>,
    lib_path: Option<String>,
    auto_reload: Option<bool>,
}

#[derive(Debug, Clone)]
struct NativePluginResolvedConfig {
    _root_dir: PathBuf,
    manifest_path: Option<PathBuf>,
    enabled: bool,
    auto_reload: bool,
    lib_dir: Option<String>,
    lib_name: Option<String>,
    lib_path: Option<String>,
    source_path: PathBuf,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevPluginBindingRecord {
    uuid: String,
    directory_path: String,
    plugin_manifest_path: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct DevBindingStateFile {
    items: Vec<DevPluginBindingRecord>,
}

#[repr(C)]
pub struct OtoolsNativeHostApiV1 {
    pub version: u32,
    pub invoke: Option<unsafe extern "C" fn(*const u8, usize, *mut usize) -> *mut u8>,
    pub free: Option<FreeFn>,
    pub host_dispatch: Option<NativeHostDispatchFn>,
}

static NATIVE_PLUGIN_REGISTRY: OnceLock<Mutex<HashMap<String, NativePluginEntry>>> =
    OnceLock::new();

static OTOOLS_NATIVE_HOST_API_V1: OtoolsNativeHostApiV1 = OtoolsNativeHostApiV1 {
    version: 2,
    invoke: None,
    free: Some(otools_native_host_free),
    host_dispatch: Some(otools_native_host_dispatch),
};

pub fn native_plugin_invoke(uuid: String, method: String, payload: Value) -> Result<Value, String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }

    let request = json!({
        "method": method,
        "payload": payload,
    });
    let input =
        serde_json::to_vec(&request).map_err(|error| format!("序列化请求失败: {error}"))?;

    let registry = native_plugin_registry();
    let mut registry = registry
        .lock()
        .map_err(|_| "Native plugin registry 已锁死".to_string())?;

    catch_native_panic("native_plugin_invoke", || {
        let config = resolve_native_plugin_config_cached(&normalized, &mut registry)?;
        if !config.enabled {
            return Err("插件 native 配置未启用".to_string());
        }

        {
            let entry = registry
                .entry(normalized.clone())
                .or_insert_with(|| NativePluginEntry {
                    config: config.clone(),
                    manifest_modified: None,
                    handle: None,
                });
            entry.config = config.clone();

            if let Some(handle) = entry.handle.as_ref() {
                if should_reload_handle(handle, &config) {
                    entry.handle = None;
                }
            }
            if entry.handle.is_none() {
                entry.handle = Some(load_native_plugin(&normalized, &config)?);
            }
        }

        let handle = registry
            .get(&normalized)
            .and_then(|entry| entry.handle.as_ref())
            .ok_or_else(|| "插件加载失败".to_string())?;

        let mut output_len: usize = 0;
        let output_ptr = unsafe { (handle.invoke)(input.as_ptr(), input.len(), &mut output_len) };
        if output_ptr.is_null() {
            return Err("插件返回空响应".to_string());
        }
        let output = unsafe { std::slice::from_raw_parts(output_ptr, output_len).to_vec() };
        unsafe {
            (handle.free)(output_ptr, output_len);
        }

        let value: Value = serde_json::from_slice(&output)
            .map_err(|error| format!("插件返回 JSON 解析失败: {error}"))?;
        if value.get("ok").and_then(Value::as_bool) == Some(false) {
            return Err(value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("插件调用失败")
                .to_string());
        }
        Ok(value)
    })
}

pub fn native_plugin_reload(uuid: String) -> Result<String, String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }
    let registry = native_plugin_registry();
    let mut registry = registry
        .lock()
        .map_err(|_| "Native plugin registry 已锁死".to_string())?;
    catch_native_panic("native_plugin_reload", || {
        registry.remove(&normalized);
        Ok("插件已卸载，可重新调用加载".to_string())
    })
}

pub fn native_plugin_probe(uuid: String) -> Result<Value, String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }
    let registry = native_plugin_registry();
    let mut registry = registry
        .lock()
        .map_err(|_| "Native plugin registry 已锁死".to_string())?;
    catch_native_panic("native_plugin_probe", || {
        let config = resolve_native_plugin_config_cached(&normalized, &mut registry)?;
        let path = config.source_path.clone();
        let (loaded, cache_path) = registry
            .get(&normalized)
            .and_then(|entry| entry.handle.as_ref())
            .map(|handle| {
                (
                    true,
                    Some(handle.cache_path.to_string_lossy().to_string()),
                )
            })
            .unwrap_or((false, None));

        Ok(json!({
            "uuid": normalized,
            "path": path.to_string_lossy().to_string(),
            "exists": path.exists(),
            "platform": platform_lib_name(),
            "enabled": config.enabled,
            "autoReload": config.auto_reload,
            "libDir": config.lib_dir,
            "libName": config.lib_name,
            "libPath": config.lib_path,
            "manifestPath": config.manifest_path.map(|value| value.to_string_lossy().to_string()),
            "cacheDir": native_cache_dir(&normalized).to_string_lossy().to_string(),
            "cachePath": cache_path,
            "loaded": loaded,
        }))
    })
}

pub fn native_plugin_poll_events(uuid: String) -> Result<Vec<Value>, String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }

    catch_native_panic("native_plugin_poll_events", || {
        let response =
            native_plugin_invoke(normalized.clone(), "poll_events".to_string(), json!({}))?;
        Ok(parse_poll_events(response, &normalized))
    })
}

pub fn normalize_plugin_id(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch.to_ascii_lowercase());
        } else if matches!(ch, '-' | '_' | '.') {
            normalized.push('-');
        }
    }
    normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
}

fn parse_poll_events(response: Value, plugin_uuid: &str) -> Vec<Value> {
    let data = response.get("data").cloned().unwrap_or(Value::Null);
    let events_value = if let Some(items) = data.get("events") {
        items.clone()
    } else if data.is_array() {
        data
    } else {
        Value::Null
    };

    events_value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let object = item.as_object()?;
            let topic = object
                .get("topic")
                .or_else(|| object.get("event"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            Some(json!({
                "pluginUuid": plugin_uuid,
                "topic": topic,
                "payload": object.get("payload").cloned().unwrap_or(Value::Null),
                "seq": object.get("seq").cloned().unwrap_or(Value::Null),
                "timestamp": object.get("timestamp").cloned().unwrap_or(Value::Null),
            }))
        })
        .collect()
}

fn native_plugin_registry() -> &'static Mutex<HashMap<String, NativePluginEntry>> {
    NATIVE_PLUGIN_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn platform_lib_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS.dylib"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows.dll"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux.so"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "native.so"
    }
}

fn plugin_root_bases() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(value) = std::env::var("CODEG_OTOOLS_PLUGIN_DIR") {
        roots.push(PathBuf::from(value));
    }
    roots.push(catalog::installed_plugins_dir());
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("plugins"),
    );
    roots.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("MenuGit")
            .join("plugins"),
    );
    roots
}

fn resolve_dev_binding_root(uuid: &str) -> Option<PathBuf> {
    let path = catalog::dev_local_root_dir().join("state.json");
    let value = catalog::read_json_file::<Value>(&path).ok()?;
    let bindings = match value {
        Value::Object(_) => serde_json::from_value::<DevBindingStateFile>(value)
            .ok()
            .map(|state| state.items)
            .unwrap_or_default(),
        Value::Array(items) => items
            .into_iter()
            .filter_map(|item| serde_json::from_value::<DevPluginBindingRecord>(item).ok())
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    let target = normalize_plugin_id(uuid);
    let binding = bindings.into_iter().find(|item| normalize_plugin_id(&item.uuid) == target)?;
    let path = if binding.plugin_manifest_path.trim().is_empty() {
        PathBuf::from(binding.directory_path.trim())
    } else {
        PathBuf::from(binding.plugin_manifest_path.trim())
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(binding.directory_path.trim()))
    };
    catalog::resolve_plugin_adapter_root(&path)
        .or_else(|| catalog::resolve_plugin_adapter_root(Path::new(binding.directory_path.trim())))
}

fn resolve_plugin_root_candidates(uuid: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let normalized = normalize_plugin_id(uuid);

    if let Some(root) = resolve_dev_binding_root(uuid) {
        out.push(root);
    }

    for base in plugin_root_bases() {
        for key in [uuid.trim(), normalized.as_str()] {
            if key.is_empty() {
                continue;
            }
            let candidate = base.join(key);
            if let Some(root) = catalog::resolve_plugin_adapter_root(&candidate) {
                if !out.iter().any(|item| item == &root) {
                    out.push(root);
                }
            }
        }

        let Ok(entries) = fs::read_dir(&base) else {
            continue;
        };
        for entry in entries.flatten() {
            let candidate = entry.path();
            let Some(root) = catalog::resolve_plugin_adapter_root(&candidate) else {
                continue;
            };
            let Some(manifest_path) = catalog::resolve_plugin_manifest_path(&root) else {
                continue;
            };
            let Ok(value) = catalog::read_json_file::<Value>(&manifest_path) else {
                continue;
            };
            let Value::Object(map) = value else {
                continue;
            };
            let manifest_uuid = map
                .get("uuid")
                .and_then(Value::as_str)
                .map(normalize_plugin_id)
                .unwrap_or_default();
            let manifest_packid = map
                .get("packid")
                .and_then(Value::as_str)
                .map(normalize_plugin_id)
                .unwrap_or_default();
            if manifest_uuid == normalized || manifest_packid == normalized {
                if !out.iter().any(|item| item == &root) {
                    out.push(root);
                }
            }
        }
    }

    out
}

fn resolve_primary_manifest_path(uuid: &str) -> Option<PathBuf> {
    resolve_plugin_root_candidates(uuid)
        .into_iter()
        .filter_map(|root| catalog::resolve_plugin_manifest_path(&root))
        .find(|path| path.exists())
}

fn native_cache_root_dir() -> PathBuf {
    catalog::otools_root_dir().join("native-cache")
}

fn native_cache_dir(uuid: &str) -> PathBuf {
    native_cache_root_dir().join(uuid)
}

fn read_source_modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|meta| meta.modified()).ok()
}

fn read_manifest_modified(path: &Path) -> Option<SystemTime> {
    read_source_modified(path)
}

fn sanitize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn ensure_safe_lib_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("插件动态库不存在: {}", path.display()));
    }
    Ok(())
}

fn resolve_native_lib_path(
    root_dir: &Path,
    lib_path: Option<&str>,
    lib_dir: Option<&str>,
    lib_name: Option<&str>,
) -> PathBuf {
    if let Some(raw) = lib_path {
        let text = raw.trim();
        if !text.is_empty() {
            let candidate = PathBuf::from(text);
            if candidate.is_absolute() {
                return candidate;
            }
            return root_dir.join(candidate);
        }
    }

    let dir = lib_dir.unwrap_or("lib");
    let name = lib_name.unwrap_or(platform_lib_name());
    root_dir.join(dir).join(name)
}

fn resolve_native_plugin_config(uuid: &str) -> Result<NativePluginResolvedConfig, String> {
    let candidates = resolve_plugin_root_candidates(uuid);
    let mut fallback_root: Option<PathBuf> = None;
    let mut last_error: Option<String> = None;

    for root_dir in candidates {
        let Some(manifest_path) = catalog::resolve_plugin_manifest_path(&root_dir) else {
            if fallback_root.is_none() {
                fallback_root = Some(root_dir);
            }
            continue;
        };
        if !manifest_path.exists() {
            if fallback_root.is_none() {
                fallback_root = Some(root_dir);
            }
            continue;
        }

        let mut enabled = false;
        let mut auto_reload = true;
        let mut lib_dir = None;
        let mut lib_name = None;
        let mut lib_path = None;

        let value = match catalog::read_json_file::<Value>(&manifest_path) {
            Ok(value) => value,
            Err(error) => {
                last_error = Some(format!(
                    "读取 plugin.json 失败({}): {}",
                    manifest_path.display(),
                    error
                ));
                continue;
            }
        };

        if let Some(native_value) = value.get("native") {
            match native_value {
                Value::Bool(flag) => {
                    enabled = *flag;
                }
                Value::Object(_) => {
                    let parsed = serde_json::from_value::<NativePluginConfig>(native_value.clone())
                        .map_err(|error| {
                            format!(
                                "解析 plugin.json native 配置失败({}): {}",
                                manifest_path.display(),
                                error
                            )
                        })?;
                    if let Some(flag) = parsed.enabled {
                        enabled = flag;
                    }
                    if let Some(flag) = parsed.auto_reload {
                        auto_reload = flag;
                    }
                    lib_dir = sanitize_optional_text(parsed.lib_dir);
                    lib_name = sanitize_optional_text(parsed.lib_name);
                    lib_path = sanitize_optional_text(parsed.lib_path);
                }
                _ => {}
            }
        }

        let source_path = resolve_native_lib_path(
            &root_dir,
            lib_path.as_deref(),
            lib_dir.as_deref(),
            lib_name.as_deref(),
        );

        return Ok(NativePluginResolvedConfig {
            _root_dir: root_dir,
            manifest_path: Some(manifest_path),
            enabled,
            auto_reload,
            lib_dir,
            lib_name,
            lib_path,
            source_path,
        });
    }

    if let Some(root_dir) = fallback_root {
        let source_path = resolve_native_lib_path(&root_dir, None, None, None);
        return Ok(NativePluginResolvedConfig {
            _root_dir: root_dir,
            manifest_path: None,
            enabled: false,
            auto_reload: true,
            lib_dir: None,
            lib_name: None,
            lib_path: None,
            source_path,
        });
    }

    Err(last_error.unwrap_or_else(|| "插件清单不存在".to_string()))
}

fn resolve_native_plugin_config_cached(
    uuid: &str,
    registry: &mut HashMap<String, NativePluginEntry>,
) -> Result<NativePluginResolvedConfig, String> {
    let manifest_path = registry
        .get(uuid)
        .and_then(|entry| entry.config.manifest_path.clone())
        .filter(|path| path.exists())
        .or_else(|| resolve_primary_manifest_path(uuid));
    let manifest_modified = manifest_path
        .as_ref()
        .and_then(|path| read_manifest_modified(path));

    let mut should_refresh = true;
    if let Some(entry) = registry.get(uuid) {
        let manifest_state_changed = entry.config.manifest_path != manifest_path;
        let modified_changed = entry.manifest_modified != manifest_modified;
        should_refresh = manifest_state_changed || modified_changed;
    }

    if should_refresh {
        let config = resolve_native_plugin_config(uuid)?;
        let entry = registry
            .entry(uuid.to_string())
            .or_insert_with(|| NativePluginEntry {
                config: config.clone(),
                manifest_modified,
                handle: None,
            });
        entry.config = config.clone();
        entry.manifest_modified = manifest_modified;
        return Ok(config);
    }

    registry
        .get(uuid)
        .map(|entry| entry.config.clone())
        .ok_or_else(|| "插件配置缓存缺失".to_string())
}

fn copy_native_lib_to_cache(uuid: &str, source_path: &Path) -> Result<PathBuf, String> {
    let cache_dir = native_cache_dir(uuid);
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("创建插件缓存目录失败({}): {}", cache_dir.display(), error))?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = match (
        source_path.file_stem().and_then(|item| item.to_str()),
        source_path.extension().and_then(|item| item.to_str()),
    ) {
        (Some(stem), Some(ext)) => format!("{stem}-{stamp}.{ext}"),
        (Some(stem), None) => format!("{stem}-{stamp}"),
        _ => format!("native-{stamp}"),
    };
    let cache_path = cache_dir.join(file_name);
    fs::copy(source_path, &cache_path)
        .map_err(|error| format!("拷贝插件动态库失败({}): {}", source_path.display(), error))?;
    Ok(cache_path)
}

fn load_native_plugin(
    uuid: &str,
    config: &NativePluginResolvedConfig,
) -> Result<NativePluginHandle, String> {
    let source_path = config.source_path.clone();
    ensure_safe_lib_path(&source_path)?;
    let cache_path = copy_native_lib_to_cache(uuid, &source_path)?;
    let lib = unsafe {
        Library::new(&cache_path)
            .map_err(|error| format!("加载插件动态库失败({}): {}", cache_path.display(), error))?
    };
    let invoke = unsafe {
        let symbol: libloading::Symbol<InvokeFn> = lib
            .get(b"otools_plugin_invoke")
            .map_err(|error| format!("找不到 otools_plugin_invoke: {error}"))?;
        *symbol
    };
    let free = unsafe {
        let symbol: libloading::Symbol<FreeFn> = lib
            .get(b"otools_plugin_free")
            .map_err(|error| format!("找不到 otools_plugin_free: {error}"))?;
        *symbol
    };
    unsafe {
        if let Ok(symbol) = lib.get::<NativePluginBindHostFn>(b"otools_plugin_bind_host") {
            let bind_host = *symbol;
            bind_host(&OTOOLS_NATIVE_HOST_API_V1 as *const OtoolsNativeHostApiV1);
        }
    }
    Ok(NativePluginHandle {
        _lib: lib,
        invoke,
        free,
        source_path,
        cache_path,
        source_modified: read_source_modified(&config.source_path),
        auto_reload: config.auto_reload,
    })
}

fn should_reload_handle(handle: &NativePluginHandle, config: &NativePluginResolvedConfig) -> bool {
    if handle.source_path != config.source_path {
        return true;
    }
    if handle.auto_reload != config.auto_reload {
        return true;
    }
    if !config.auto_reload {
        return false;
    }
    let Some(current) = read_source_modified(&config.source_path) else {
        return false;
    };
    match handle.source_modified {
        Some(previous) => current != previous,
        None => true,
    }
}

unsafe extern "C" fn otools_native_host_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, len, len);
    }
}

unsafe extern "C" fn otools_native_host_dispatch(
    capability_ptr: *const u8,
    capability_len: usize,
    request_ptr: *const u8,
    request_len: usize,
    output_len: *mut usize,
) -> *mut u8 {
    if output_len.is_null() {
        return std::ptr::null_mut();
    }

    let capability = if capability_ptr.is_null() {
        String::new()
    } else {
        String::from_utf8_lossy(unsafe {
            std::slice::from_raw_parts(capability_ptr, capability_len)
        })
        .into_owned()
    };

    let request_value: Value = if request_ptr.is_null() || request_len == 0 {
        Value::Null
    } else {
        let slice = unsafe { std::slice::from_raw_parts(request_ptr, request_len) };
        serde_json::from_slice(slice).unwrap_or(Value::Null)
    };

    let response = match catch_native_panic("otools_native_host_dispatch", || {
        dispatch_host_capability(capability.trim(), request_value)
    }) {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(error) => json!({ "ok": false, "error": error }),
    };

    encode_host_response(response, output_len)
}

fn encode_host_response(value: Value, output_len: *mut usize) -> *mut u8 {
    let mut output = serde_json::to_vec(&value)
        .unwrap_or_else(|_| br#"{"ok":false,"error":"serialize failed"}"#.to_vec());
    let len = output.len();
    unsafe {
        *output_len = len;
    }
    let ptr = output.as_mut_ptr();
    std::mem::forget(output);
    ptr
}

fn dispatch_host_capability(capability: &str, request: Value) -> Result<Value, String> {
    match capability {
        "http.send" => host_http_send(request),
        "http.writeBase64File" | "http.write_base64_file" => {
            let path = request
                .get("filePath")
                .or_else(|| request.get("file_path"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "filePath is required".to_string())?;
            let data_base64 = request
                .get("dataBase64")
                .or_else(|| request.get("data_base64"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let bytes = BASE64_STANDARD
                .decode(data_base64.trim())
                .map_err(|error| format!("Invalid base64 file payload: {error}"))?;
            let target = PathBuf::from(path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("create dir failed {}: {error}", parent.display()))?;
            }
            fs::write(&target, bytes)
                .map_err(|error| format!("write file failed {}: {error}", target.display()))?;
            Ok(Value::Null)
        }
        other => Err(format!("Unsupported host capability: {other}")),
    }
}

fn host_http_send(request: Value) -> Result<Value, String> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET")
        .trim()
        .to_ascii_uppercase();
    let url = request
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "url is required".to_string())?;

    let client = reqwest::blocking::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|error| format!("Invalid HTTP method: {error}"))?;
    let mut builder = client.request(method, url);

    if let Some(headers) = request.get("headers").and_then(Value::as_object) {
        for (key, value) in headers {
            if let Some(value) = value.as_str() {
                builder = builder.header(key, value);
            }
        }
    }
    if let Some(body) = request.get("body") {
        if let Some(text) = body.as_str() {
            builder = builder.body(text.to_string());
        } else {
            builder = builder.json(body);
        }
    }

    let response = builder
        .send()
        .map_err(|error| format!("OTools HTTP request failed: {error}"))?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(key, value)| {
            (
                key.as_str().to_string(),
                Value::String(value.to_str().unwrap_or_default().to_string()),
            )
        })
        .collect::<serde_json::Map<String, Value>>();
    let bytes = response
        .bytes()
        .map_err(|error| format!("Failed to read OTools HTTP response: {error}"))?;
    Ok(json!({
        "status": status,
        "headers": headers,
        "bodyBase64": BASE64_STANDARD.encode(&bytes),
        "body": String::from_utf8_lossy(&bytes),
    }))
}

fn catch_native_panic<T, F>(context: &str, action: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    match panic::catch_unwind(AssertUnwindSafe(action)) {
        Ok(result) => result,
        Err(payload) => Err(format!(
            "{context} 发生 panic: {}",
            format_panic_payload(payload)
        )),
    }
}

fn format_panic_payload(payload: Box<dyn Any + Send>) -> String {
    match payload.downcast::<String>() {
        Ok(message) => *message,
        Err(payload) => match payload.downcast::<&'static str>() {
            Ok(message) => (*message).to_string(),
            Err(_) => "unknown panic".to_string(),
        },
    }
}

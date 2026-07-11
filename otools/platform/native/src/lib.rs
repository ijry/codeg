use std::any::Any;
use std::collections::HashMap;
use std::fs;
use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use libloading::Library;
use otools_core::catalog;
use otools_platform_native_contract::native_platform_lib_name as platform_lib_name;
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

#[repr(C)]
pub struct OtoolsNativeHostApiV1 {
    pub version: u32,
    pub invoke: Option<unsafe extern "C" fn(*const u8, usize, *mut usize) -> *mut u8>,
    pub free: Option<FreeFn>,
    pub host_dispatch: Option<NativeHostDispatchFn>,
}

static NATIVE_PLUGIN_REGISTRY: OnceLock<Mutex<HashMap<String, NativePluginEntry>>> =
    OnceLock::new();
static NATIVE_LISTEN_STATE: OnceLock<Mutex<HashMap<String, NativeListenEntry>>> = OnceLock::new();

type NativeEventEmitter = Arc<dyn Fn(String, Value) + Send + Sync + 'static>;

struct NativeListenEntry {
    refs: u32,
    stop: Option<mpsc::Sender<()>>,
    task: Option<thread::JoinHandle<()>>,
}

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

pub fn native_plugin_listen_acquire(
    uuid: String,
    interval_ms: Option<u64>,
    emit: impl Fn(String, Value) + Send + Sync + 'static,
) -> Result<(), String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }

    let interval_ms = normalize_poll_interval_ms(interval_ms);
    let mut state = native_listen_state()
        .lock()
        .map_err(|_| "Native plugin listen state 已锁死".to_string())?;
    let emit = Arc::new(emit);
    match state.entry(normalized.clone()) {
        std::collections::hash_map::Entry::Occupied(mut occupied) => {
            let entry = occupied.get_mut();
            if entry.refs == 0 {
                let (stop, stop_rx) = mpsc::channel();
                let task = spawn_native_event_poller(normalized, interval_ms, stop_rx, emit)?;
                entry.refs = 1;
                entry.stop = Some(stop);
                entry.task = Some(task);
            } else {
                entry.refs = entry.refs.saturating_add(1);
            }
        }
        std::collections::hash_map::Entry::Vacant(vacant) => {
            let (stop, stop_rx) = mpsc::channel();
            let task = spawn_native_event_poller(normalized, interval_ms, stop_rx, emit)?;
            vacant.insert(NativeListenEntry {
                refs: 1,
                stop: Some(stop),
                task: Some(task),
            });
        }
    }

    Ok(())
}

pub fn native_plugin_listen_release(uuid: String) -> Result<(), String> {
    let normalized = normalize_plugin_id(&uuid);
    if normalized.is_empty() {
        return Err("插件 UUID 不能为空".to_string());
    }

    let mut state = native_listen_state()
        .lock()
        .map_err(|_| "Native plugin listen state 已锁死".to_string())?;
    let Some(entry) = state.get_mut(&normalized) else {
        return Ok(());
    };
    if entry.refs == 0 {
        return Ok(());
    }

    entry.refs -= 1;
    if entry.refs == 0 {
        if let Some(stop) = entry.stop.take() {
            let _ = stop.send(());
        }
        let _ = entry.task.take();
        state.remove(&normalized);
    }

    Ok(())
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

fn native_listen_state() -> &'static Mutex<HashMap<String, NativeListenEntry>> {
    NATIVE_LISTEN_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_poll_interval_ms(raw: Option<u64>) -> u64 {
    raw.unwrap_or(200).clamp(50, 10_000)
}

fn native_event_label(uuid: &str) -> String {
    format!("otools-native:{uuid}")
}

fn spawn_native_event_poller(
    plugin_uuid: String,
    interval_ms: u64,
    stop: mpsc::Receiver<()>,
    emit: NativeEventEmitter,
) -> Result<thread::JoinHandle<()>, String> {
    thread::Builder::new()
        .name(format!("otools-native-listen-{plugin_uuid}"))
        .spawn(move || {
            let delay = Duration::from_millis(interval_ms);
            loop {
                let Ok(events) = native_plugin_poll_events(plugin_uuid.clone()) else {
                    match stop.recv_timeout(delay) {
                        Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    }
                };
                if !events.is_empty() {
                    let label = native_event_label(&plugin_uuid);
                    for event in events {
                        let topic = event.get("topic").cloned().unwrap_or(Value::Null);
                        if topic.as_str().map(str::trim).unwrap_or_default().is_empty() {
                            continue;
                        }
                        let payload = event.get("payload").cloned().unwrap_or(Value::Null);
                        emit(
                            label.clone(),
                            json!({
                                "topic": topic,
                                "payload": payload,
                            }),
                        );
                    }
                }

                match stop.recv_timeout(delay) {
                    Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        continue;
                    }
                }
            }
        })
        .map_err(|error| format!("启动 native 插件事件监听失败: {error}"))
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
    let candidates = catalog::resolve_plugin_root_candidates(uuid);
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
        .or_else(|| catalog::resolve_primary_plugin_manifest_path(uuid));
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
    otools_platform_host_dispatch::dispatch_host_capability_blocking(capability, request)
        .map_err(otools_platform_host_dispatch::host_error_to_string)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_poll_interval_ms_uses_compatible_bounds() {
        assert_eq!(normalize_poll_interval_ms(None), 200);
        assert_eq!(normalize_poll_interval_ms(Some(1)), 50);
        assert_eq!(normalize_poll_interval_ms(Some(500)), 500);
        assert_eq!(normalize_poll_interval_ms(Some(60_000)), 10_000);
    }

    #[test]
    fn parse_poll_events_accepts_data_events_shape() {
        let events = parse_poll_events(
            json!({
                "data": {
                    "events": [
                        { "topic": "ready", "payload": { "ok": true }, "seq": 7 },
                        { "event": "changed", "payload": "value", "timestamp": 123 },
                        { "topic": " " }
                    ]
                }
            }),
            "plugin-one",
        );

        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["pluginUuid"], "plugin-one");
        assert_eq!(events[0]["topic"], "ready");
        assert_eq!(events[0]["payload"], json!({ "ok": true }));
        assert_eq!(events[0]["seq"], 7);
        assert_eq!(events[1]["topic"], "changed");
        assert_eq!(events[1]["payload"], "value");
        assert_eq!(events[1]["timestamp"], 123);
    }

    #[test]
    fn parse_poll_events_accepts_data_array_shape() {
        let events = parse_poll_events(
            json!({
                "data": [
                    { "topic": "message", "payload": 1 },
                    { "payload": "missing-topic" }
                ]
            }),
            "plugin-two",
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["pluginUuid"], "plugin-two");
        assert_eq!(events[0]["topic"], "message");
        assert_eq!(events[0]["payload"], 1);
    }
}

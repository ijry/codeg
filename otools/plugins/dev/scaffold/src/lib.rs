use std::fs;
use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::HostError;
use otools_plugin_dev_state::{read_binding_state, read_meta_state};
use url::Url;

#[derive(Debug, Clone)]
pub struct VueProjectScaffold {
    pub base_dir: PathBuf,
    pub packid: String,
    pub version: String,
    pub display_name: String,
    pub summary: String,
    pub dev_url: String,
}

#[derive(Debug, Clone)]
pub struct NativeProjectScaffold {
    pub plugin_root: PathBuf,
    pub packid: String,
    pub version: String,
    pub plugin_uuid: String,
}

pub fn initialize_vue_project(input: &VueProjectScaffold) -> Result<String, HostError> {
    let src_dir = input.base_dir.join("src");
    catalog::ensure_dir_exists(&src_dir)?;
    let package_name = package_name_from_pack_id(&input.packid);
    let (host, port) = parse_host_port_from_dev_url(&input.dev_url);
    let sdk_dependency = json_string_literal(&plugin_sdk_dependency_for(&input.base_dir));
    let vite_host = json_string_literal(&host);
    write_if_missing(
        &input.base_dir.join("package.json"),
        &format!(
            r#"{{
  "name": "{package_name}",
  "private": true,
  "version": "{version}",
  "type": "module",
  "scripts": {{
    "dev": "vite --host {host} --port {port}",
    "build": "vite build",
    "preview": "vite preview --host {host} --port 4173"
  }},
  "dependencies": {{
    "@tauri-apps/api": "^2.8.0",
    "@tauri-apps/plugin-dialog": "^2.4.0",
    "otools-plugin-sdk": {sdk_dependency},
    "vue": "^3.5.13"
  }},
  "devDependencies": {{
    "@vitejs/plugin-vue": "^5.2.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.0"
  }}
}}
"#,
            version = input.version
        ),
    )?;
    write_if_missing(
        &input.base_dir.join("vite.config.ts"),
        &format!(
            "import vue from '@vitejs/plugin-vue'\nimport {{ createOtoolsPluginSdkViteConfig }} from 'otools-plugin-sdk/vite'\n\nexport default createOtoolsPluginSdkViteConfig({{\n  host: {vite_host},\n  port: {port},\n  extraPlugins: [vue()],\n}})\n"
        ),
    )?;
    write_if_missing(
        &input.base_dir.join("tsconfig.json"),
        r#"{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "otools-plugin-sdk"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"]
}
"#,
    )?;
    write_if_missing(
        &input.base_dir.join("index.html"),
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" /><title>OTools Plugin</title></head><body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.ts\"></script></body></html>\n",
    )?;
    write_if_missing(
        &src_dir.join("main.ts"),
        "import { createApp } from 'vue'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n",
    )?;
    write_if_missing(
        &src_dir.join("App.vue"),
        &format!(
            "<template><main class=\"app\"><h1>{}</h1><p>{}</p></main></template><style scoped>.app{{min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#e2e8f0;background:#0f172a}}p{{max-width:720px;line-height:1.7}}</style>\n",
            input.display_name,
            if input.summary.trim().is_empty() {
                "Vue 工程骨架已初始化，可执行 pnpm install && pnpm dev 开始开发。"
            } else {
                input.summary.as_str()
            }
        ),
    )?;
    write_if_missing(
        &input.base_dir.join(".gitignore"),
        "node_modules\n.DS_Store\ndist\n.vscode\n",
    )?;
    Ok("Vue 工程骨架已初始化到绑定目录，后续可执行 pnpm install && pnpm dev".to_string())
}

pub fn initialize_vue_project_for_uuid(
    meta_path: &Path,
    binding_path: &Path,
    uuid: &str,
) -> Result<String, HostError> {
    let meta = find_meta_record(meta_path, uuid)?;
    let binding = find_binding_record(binding_path, &meta.uuid)?;
    let base_dir = resolve_bound_plugin_root(&binding.directory_path)?;
    initialize_vue_project(&VueProjectScaffold {
        base_dir,
        packid: meta.packid,
        version: meta.version,
        display_name: meta.display_name,
        summary: meta.summary,
        dev_url: meta.dev_url,
    })
}

pub fn initialize_native_project(input: &NativeProjectScaffold) -> Result<String, HostError> {
    let base_dir = input.plugin_root.join("native");
    let src_dir = base_dir.join("src");
    catalog::ensure_dir_exists(&src_dir)?;
    let crate_name = format!("{}-native", package_name_from_pack_id(&input.packid));
    write_if_missing(
        &base_dir.join("Cargo.toml"),
        &format!(
            "[package]\nname = \"{crate_name}\"\nversion = \"{}\"\nedition = \"2021\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n\n[dependencies]\nserde = {{ version = \"1\", features = [\"derive\"] }}\nserde_json = \"1\"\n",
            input.version
        ),
    )?;
    write_if_missing(
        &src_dir.join("lib.rs"),
        r#"use serde_json::{json, Value};

#[no_mangle]
pub extern "C" fn otools_plugin_invoke(input_ptr: *const u8, input_len: usize, output_len: *mut usize) -> *mut u8 {
    if input_ptr.is_null() || output_len.is_null() {
        return std::ptr::null_mut();
    }
    let input = unsafe { std::slice::from_raw_parts(input_ptr, input_len) };
    let parsed: Value = serde_json::from_slice(input).unwrap_or(Value::Null);
    let method = parsed.get("method").and_then(Value::as_str).unwrap_or_default();
    let payload = parsed.get("payload").cloned().unwrap_or(Value::Null);
    let response = match method {
        "ping" => json!({ "ok": true, "data": { "message": "pong" } }),
        "echo" => json!({ "ok": true, "data": payload }),
        _ => json!({ "ok": false, "error": format!("Unknown method: {}", method) }),
    };
    let mut output = serde_json::to_vec(&response).unwrap_or_else(|_| b"{\"ok\":false}".to_vec());
    unsafe { *output_len = output.len(); }
    let ptr = output.as_mut_ptr();
    std::mem::forget(output);
    ptr
}

#[no_mangle]
pub extern "C" fn otools_plugin_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, len, len);
    }
}
"#,
    )?;
    write_if_missing(
        &base_dir.join("README.md"),
        &format!(
            r#"# OTools Native Plugin

本目录用于开发 OTools 原生动态库插件（cdylib）。

## 构建方式

请在 OTools 开发者工具中点击“构建原生库”或“独立构建动态库”。

输出路径（插件根目录）：

```
<plugin_root>/lib/
  macOS.dylib
  Linux.so
  Windows.dll
```

OTools 调试模式会在构建后自动同步到：

```
$HOME/.otools/plugins/{plugin_uuid}/lib/
```

## plugin.json native 配置

在插件根目录的 `plugin.json` 中追加配置：

```json
{{
  "native": {{
    "enabled": true,
    "libDir": "lib",
    "autoReload": true
  }}
}}
```

默认动态库文件名为 `macOS.dylib` / `Windows.dll` / `Linux.so`，如有自定义可在 `native.libName` 中覆盖。

## 调用约定

对外导出两个 C ABI 函数：

- `otools_plugin_invoke(input_ptr, input_len, output_len) -> *mut u8`
- `otools_plugin_free(ptr, len)`

输入 JSON:

```json
{{ "method": "ping", "payload": {{}} }}
```

输出 JSON:

```json
{{ "ok": true, "data": {{ "message": "pong" }} }}
```

## 回调宿主主程序

如需在 native 动态库内直接复用 OTools 主程序能力，可额外导出可选函数：

- `otools_plugin_bind_host(host_api_ptr)`

当前宿主会传入 `version=1` 的 API 结构体，支持通过 `invoke/free` 回调主程序；统一 AI 接口方法名为：

- `ai.generateText`
"#,
            plugin_uuid = input.plugin_uuid
        ),
    )?;
    Ok("Rust 原生插件工程已初始化到 native 目录".to_string())
}

pub fn initialize_native_project_for_uuid(
    meta_path: &Path,
    binding_path: &Path,
    uuid: &str,
) -> Result<String, HostError> {
    let meta = find_meta_record(meta_path, uuid)?;
    let binding = find_binding_record(binding_path, &meta.uuid)?;
    let plugin_root = resolve_bound_plugin_root(&binding.directory_path)?;
    initialize_native_project(&NativeProjectScaffold {
        plugin_root,
        packid: meta.packid,
        version: meta.version,
        plugin_uuid: meta.uuid,
    })
}

fn package_name_from_pack_id(packid: &str) -> String {
    otools_plugin_support::package_name_from_pack_id(packid, "otools-dev-plugin")
}

fn path_to_package_json_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn local_plugin_sdk_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .ancestors()
        .map(|ancestor| ancestor.join("sdk").join("plugin-sdk"))
        .find(|candidate| candidate.join("package.json").is_file())
}

fn path_component_texts(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Prefix(prefix) => {
                Some(prefix.as_os_str().to_string_lossy().replace('\\', "/"))
            }
            std::path::Component::RootDir => Some("/".to_string()),
            std::path::Component::CurDir => None,
            std::path::Component::ParentDir => Some("..".to_string()),
            std::path::Component::Normal(part) => Some(part.to_string_lossy().to_string()),
        })
        .collect()
}

fn path_component_key(value: &str) -> String {
    #[cfg(windows)]
    {
        value.to_ascii_lowercase()
    }
    #[cfg(not(windows))]
    {
        value.to_string()
    }
}

fn relative_path_between(from_dir: &Path, target_dir: &Path) -> Option<PathBuf> {
    let from_parts = path_component_texts(from_dir);
    let target_parts = path_component_texts(target_dir);
    if from_parts.is_empty() || target_parts.is_empty() {
        return None;
    }

    let mut common_len = 0usize;
    while common_len < from_parts.len()
        && common_len < target_parts.len()
        && path_component_key(&from_parts[common_len])
            == path_component_key(&target_parts[common_len])
    {
        common_len += 1;
    }
    if common_len == 0 {
        return None;
    }

    let mut output = PathBuf::new();
    for _ in common_len..from_parts.len() {
        output.push("..");
    }
    for part in &target_parts[common_len..] {
        output.push(part);
    }
    if output.as_os_str().is_empty() {
        output.push(".");
    }
    Some(output)
}

fn plugin_sdk_dependency_for(plugin_root: &Path) -> String {
    let Some(sdk_dir) = local_plugin_sdk_dir() else {
        return "^0.1.0".to_string();
    };

    let plugin_root = fs::canonicalize(plugin_root).unwrap_or_else(|_| plugin_root.to_path_buf());
    let sdk_dir = fs::canonicalize(&sdk_dir).unwrap_or(sdk_dir);
    let dependency_path =
        relative_path_between(&plugin_root, &sdk_dir).unwrap_or_else(|| sdk_dir.to_path_buf());
    let mut dependency_path = path_to_package_json_path(&dependency_path);
    if !dependency_path.starts_with('.')
        && !dependency_path.starts_with('/')
        && !dependency_path.contains(':')
    {
        dependency_path = format!("./{dependency_path}");
    }
    format!("file:{dependency_path}")
}

fn json_string_literal(raw: &str) -> String {
    serde_json::to_string(raw).unwrap_or_else(|_| "\"\"".to_string())
}

fn normalize_dev_url(raw: &str) -> String {
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

fn parse_host_port_from_dev_url(dev_url: &str) -> (String, u16) {
    let url = normalize_dev_url(dev_url);
    if let Ok(parsed) = Url::parse(&url) {
        let host = parsed.host_str().unwrap_or("127.0.0.1").to_string();
        let port = parsed.port_or_known_default().unwrap_or(5173);
        return (host, port);
    }
    ("127.0.0.1".to_string(), 5173)
}

fn write_if_missing(path: &Path, content: &str) -> Result<(), HostError> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        catalog::ensure_dir_exists(parent)?;
    }
    fs::write(path, content).map_err(HostError::io)
}

fn find_meta_record(path: &Path, uuid: &str) -> Result<PluginMetaInfo, HostError> {
    let normalized_uuid = uuid.trim();
    if normalized_uuid.is_empty() {
        return Err(HostError::invalid_input("缺少插件 UUID"));
    }
    read_meta_state(path)?
        .into_iter()
        .find(|item| item.uuid == normalized_uuid)
        .ok_or_else(|| HostError::not_found("未找到对应的开发插件"))
}

fn find_binding_record(path: &Path, uuid: &str) -> Result<PluginBindingInfo, HostError> {
    read_binding_state(path)?
        .into_iter()
        .find(|item| item.uuid == uuid)
        .ok_or_else(|| HostError::not_found("请先绑定开发目录"))
}

fn resolve_bound_plugin_root(directory_path: &str) -> Result<PathBuf, HostError> {
    catalog::resolve_plugin_adapter_root(Path::new(directory_path.trim())).ok_or_else(|| {
        HostError::not_found(format!("无法解析插件根目录: {}", directory_path.trim()))
    })
}

type PluginMetaInfo = otools_plugin_dev_state::DevPluginMetaRecord;
type PluginBindingInfo = otools_plugin_dev_state::DevPluginBindingRecord;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("otools-dev-scaffold-{name}-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp test dir");
        dir
    }

    #[test]
    fn initializes_vue_project_without_overwriting_existing_files() {
        let root = temp_test_dir("vue");
        fs::write(root.join("package.json"), "existing").expect("write existing package");

        let message = initialize_vue_project(&VueProjectScaffold {
            base_dir: root.clone(),
            packid: "sample.plugin".to_string(),
            version: "1.0.0".to_string(),
            display_name: "Sample".to_string(),
            summary: String::new(),
            dev_url: "localhost:5180".to_string(),
        })
        .expect("initialize vue project");

        assert!(message.contains("Vue 工程骨架"));
        assert_eq!(
            fs::read_to_string(root.join("package.json")).expect("read package"),
            "existing"
        );
        assert!(
            fs::read_to_string(root.join("vite.config.ts"))
                .expect("read vite config")
                .contains("port: 5180")
        );
        assert!(root.join("src/App.vue").is_file());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn initializes_native_project_files() {
        let root = temp_test_dir("native");

        let message = initialize_native_project(&NativeProjectScaffold {
            plugin_root: root.clone(),
            packid: "sample.plugin".to_string(),
            version: "0.2.0".to_string(),
            plugin_uuid: "sample-uuid".to_string(),
        })
        .expect("initialize native project");

        assert!(message.contains("Rust 原生插件"));
        assert!(
            fs::read_to_string(root.join("native/Cargo.toml"))
                .expect("read cargo")
                .contains("name = \"sample-plugin-native\"")
        );
        assert!(
            fs::read_to_string(root.join("native/README.md"))
                .expect("read readme")
                .contains("$HOME/.otools/plugins/sample-uuid/lib/")
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn initializes_vue_project_for_uuid() {
        let root = temp_test_dir("vue-uuid");
        let plugin_root = root.join("plugin");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        fs::create_dir_all(&plugin_root).expect("create plugin root");
        fs::write(plugin_root.join("plugin.json"), "{}").expect("write manifest");
        otools_plugin_dev_state::write_meta_state(
            &meta_path,
            &[otools_plugin_dev_state::DevPluginMetaRecord {
                uuid: "sample-uuid".to_string(),
                packid: "sample.plugin".to_string(),
                display_name: "Sample".to_string(),
                version: "1.0.0".to_string(),
                dev_url: "localhost:5179".to_string(),
                ..Default::default()
            }],
        )
        .expect("write meta");
        otools_plugin_dev_state::write_binding_state(
            &binding_path,
            &[otools_plugin_dev_state::DevPluginBindingRecord {
                uuid: "sample-uuid".to_string(),
                directory_path: plugin_root.to_string_lossy().to_string(),
                plugin_manifest_path: String::new(),
                ..Default::default()
            }],
        )
        .expect("write binding");

        let message = initialize_vue_project_for_uuid(&meta_path, &binding_path, "sample-uuid")
            .expect("initialize vue project for uuid");

        assert!(message.contains("Vue 工程骨架"));
        assert!(plugin_root.join("src/App.vue").is_file());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn initializes_native_project_for_uuid() {
        let root = temp_test_dir("native-uuid");
        let plugin_root = root.join("plugin");
        let meta_path = root.join("meta.json");
        let binding_path = root.join("binding.json");
        fs::create_dir_all(&plugin_root).expect("create plugin root");
        fs::write(plugin_root.join("plugin.json"), "{}").expect("write manifest");
        otools_plugin_dev_state::write_meta_state(
            &meta_path,
            &[otools_plugin_dev_state::DevPluginMetaRecord {
                uuid: "sample-uuid".to_string(),
                packid: "sample.plugin".to_string(),
                display_name: "Sample".to_string(),
                version: "0.2.0".to_string(),
                dev_url: String::new(),
                ..Default::default()
            }],
        )
        .expect("write meta");
        otools_plugin_dev_state::write_binding_state(
            &binding_path,
            &[otools_plugin_dev_state::DevPluginBindingRecord {
                uuid: "sample-uuid".to_string(),
                directory_path: plugin_root.to_string_lossy().to_string(),
                plugin_manifest_path: String::new(),
                ..Default::default()
            }],
        )
        .expect("write binding");

        let message = initialize_native_project_for_uuid(&meta_path, &binding_path, "sample-uuid")
            .expect("initialize native project for uuid");

        assert!(message.contains("Rust 原生插件"));
        assert!(plugin_root.join("native/Cargo.toml").is_file());
        fs::remove_dir_all(root).ok();
    }
}

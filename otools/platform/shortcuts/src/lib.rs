use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use otools_core::catalog;
use otools_core::{HostError, HostErrorCode};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

const GLOBAL_SHORTCUTS_CONFIG_KEY: &str = "globalShortcuts";
const DEFAULT_CROP_PLUGIN_UUID: &str = "otools-crop";
const DEFAULT_CROP_SHORTCUT: &str = "CommandOrControl+Shift+A";
const OTOOLS_SHORTCUT_EVENT: &str = "otools-global-shortcut-triggered";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct OtoolsGlobalShortcutBinding {
    pub plugin_uuid: String,
    pub shortcut: String,
    pub enabled: bool,
}

#[derive(Default)]
pub struct OtoolsGlobalShortcutState {
    bindings: Mutex<Vec<OtoolsGlobalShortcutBinding>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsGlobalShortcutTriggeredPayload {
    pub plugin_uuid: String,
    pub shortcut: String,
    pub triggered_at_ms: u64,
}

pub fn build_global_shortcut_state() -> OtoolsGlobalShortcutState {
    let mut bindings = load_bindings_from_config().unwrap_or_else(|error| {
        eprintln!("[otools-shortcut] load config failed: {}", error.message);
        Vec::new()
    });

    if !bindings.iter().any(|item| {
        item.plugin_uuid
            .eq_ignore_ascii_case(DEFAULT_CROP_PLUGIN_UUID)
    }) {
        bindings.push(OtoolsGlobalShortcutBinding {
            plugin_uuid: DEFAULT_CROP_PLUGIN_UUID.to_string(),
            shortcut: canonicalize_shortcut(DEFAULT_CROP_SHORTCUT)
                .unwrap_or_else(|_| DEFAULT_CROP_SHORTCUT.to_string()),
            enabled: true,
        });
        bindings.sort_by(|a, b| a.plugin_uuid.cmp(&b.plugin_uuid));
        let _ = persist_bindings(&bindings);
    }

    OtoolsGlobalShortcutState {
        bindings: Mutex::new(bindings),
    }
}

pub fn init_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            handle_global_shortcut_event(app, shortcut, event);
        })
        .build()
}

pub fn initialize_global_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), HostError> {
    let bindings = app
        .try_state::<OtoolsGlobalShortcutState>()
        .and_then(|state| state.bindings.lock().ok().map(|items| items.clone()))
        .unwrap_or_default();

    for binding in bindings {
        if !binding.enabled || binding.shortcut.is_empty() {
            continue;
        }

        if let Err(error) = app.global_shortcut().register(binding.shortcut.as_str()) {
            eprintln!(
                "[otools-shortcut] register on startup failed plugin={} shortcut={} error={}",
                binding.plugin_uuid, binding.shortcut, error
            );
        }
    }

    Ok(())
}

pub fn handle_global_shortcut_event<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: &Shortcut,
    event: ShortcutEvent,
) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    let shortcut_text = shortcut.to_string();
    let binding = app
        .try_state::<OtoolsGlobalShortcutState>()
        .and_then(|state| {
            state.bindings.lock().ok().and_then(|items| {
                items
                    .iter()
                    .find(|item| {
                        item.enabled
                            && !item.shortcut.is_empty()
                            && item.shortcut.eq_ignore_ascii_case(&shortcut_text)
                    })
                    .cloned()
            })
        });

    let Some(binding) = binding else {
        return;
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let payload = OtoolsGlobalShortcutTriggeredPayload {
        plugin_uuid: binding.plugin_uuid,
        shortcut: binding.shortcut,
        triggered_at_ms: current_timestamp_ms(),
    };

    let _ = app.emit(OTOOLS_SHORTCUT_EVENT, payload);
}

pub fn otools_get_global_shortcut_bindings(
    state: &OtoolsGlobalShortcutState,
) -> Result<Vec<OtoolsGlobalShortcutBinding>, HostError> {
    state
        .bindings
        .lock()
        .map(|items| items.clone())
        .map_err(|error| {
            HostError::task_execution_failed("Failed to read OTools global shortcuts")
                .with_detail(error.to_string())
        })
}

pub fn otools_get_global_shortcut_binding(
    plugin_uuid: String,
    state: &OtoolsGlobalShortcutState,
) -> Result<Option<OtoolsGlobalShortcutBinding>, HostError> {
    let target = plugin_uuid.trim().to_lowercase();
    if target.is_empty() {
        return Ok(None);
    }

    state
        .bindings
        .lock()
        .map_err(|error| {
            HostError::task_execution_failed("Failed to read OTools global shortcuts")
                .with_detail(error.to_string())
        })
        .map(|items| {
            items
                .iter()
                .find(|item| item.plugin_uuid.to_lowercase() == target)
                .cloned()
        })
}

pub fn otools_upsert_global_shortcut_binding<R: Runtime>(
    app: AppHandle<R>,
    binding: OtoolsGlobalShortcutBinding,
    state: &OtoolsGlobalShortcutState,
) -> Result<OtoolsGlobalShortcutBinding, HostError> {
    let Some(next_binding) = normalize_binding(binding)? else {
        return Err(HostError::invalid_input("Shortcut is required"));
    };

    let mut bindings = state.bindings.lock().map_err(|error| {
        HostError::task_execution_failed("Failed to update OTools global shortcuts")
            .with_detail(error.to_string())
    })?;

    if bindings.iter().any(|item| {
        item.plugin_uuid != next_binding.plugin_uuid
            && item.enabled
            && item.shortcut.eq_ignore_ascii_case(&next_binding.shortcut)
    }) {
        return Err(HostError::new(
            HostErrorCode::AlreadyExists,
            "Shortcut is already used by another OTools plugin",
        )
        .with_detail(next_binding.shortcut.clone()));
    }

    let old_binding = bindings
        .iter()
        .find(|item| item.plugin_uuid == next_binding.plugin_uuid)
        .cloned();

    if let Some(old) = old_binding.as_ref() {
        if old.shortcut == next_binding.shortcut && old.enabled == next_binding.enabled {
            return Ok(old.clone());
        }
    }

    let should_remove_old = old_binding
        .as_ref()
        .map(|item| {
            item.enabled && !item.shortcut.is_empty() && item.shortcut != next_binding.shortcut
        })
        .unwrap_or(false);

    if should_remove_old {
        if let Some(old) = old_binding.as_ref() {
            let _ = app.global_shortcut().unregister(old.shortcut.as_str());
        }
    }

    if next_binding.enabled {
        if let Err(error) = app
            .global_shortcut()
            .register(next_binding.shortcut.as_str())
        {
            if should_remove_old {
                if let Some(old) = old_binding.as_ref() {
                    let _ = app.global_shortcut().register(old.shortcut.as_str());
                }
            }
            return Err(HostError::task_execution_failed(
                "Failed to register OTools global shortcut",
            )
            .with_detail(error.to_string()));
        }
    }

    if let Some(old) = old_binding.as_ref() {
        if old.enabled
            && !old.shortcut.is_empty()
            && old.shortcut == next_binding.shortcut
            && !next_binding.enabled
        {
            let _ = app.global_shortcut().unregister(old.shortcut.as_str());
        }
    }

    bindings.retain(|item| item.plugin_uuid != next_binding.plugin_uuid);
    bindings.push(next_binding.clone());
    bindings.sort_by(|a, b| a.plugin_uuid.cmp(&b.plugin_uuid));
    persist_bindings(&bindings)?;

    Ok(next_binding)
}

pub fn otools_remove_global_shortcut_binding<R: Runtime>(
    app: AppHandle<R>,
    plugin_uuid: String,
    state: &OtoolsGlobalShortcutState,
) -> Result<(), HostError> {
    let target = plugin_uuid.trim().to_lowercase();
    if target.is_empty() {
        return Ok(());
    }

    let mut bindings = state.bindings.lock().map_err(|error| {
        HostError::task_execution_failed("Failed to remove OTools global shortcut")
            .with_detail(error.to_string())
    })?;

    if let Some(existing) = bindings
        .iter()
        .find(|item| item.plugin_uuid.to_lowercase() == target)
        .cloned()
    {
        if existing.enabled && !existing.shortcut.is_empty() {
            let _ = app.global_shortcut().unregister(existing.shortcut.as_str());
        }
    }

    bindings.retain(|item| item.plugin_uuid.to_lowercase() != target);
    persist_bindings(&bindings)
}

fn canonicalize_shortcut(raw: &str) -> Result<String, HostError> {
    raw.trim()
        .parse::<Shortcut>()
        .map(|shortcut| shortcut.to_string())
        .map_err(|error| {
            HostError::invalid_input("Invalid OTools shortcut").with_detail(error.to_string())
        })
}

fn normalize_binding(
    binding: OtoolsGlobalShortcutBinding,
) -> Result<Option<OtoolsGlobalShortcutBinding>, HostError> {
    let plugin_uuid = binding.plugin_uuid.trim().to_string();
    if plugin_uuid.is_empty() {
        return Err(HostError::invalid_input("pluginUuid is required"));
    }

    let shortcut = binding.shortcut.trim();
    if shortcut.is_empty() {
        return Ok(None);
    }

    Ok(Some(OtoolsGlobalShortcutBinding {
        plugin_uuid,
        shortcut: canonicalize_shortcut(shortcut)?,
        enabled: binding.enabled,
    }))
}

fn load_bindings_from_config() -> Result<Vec<OtoolsGlobalShortcutBinding>, HostError> {
    let map = read_config_map()?;
    let items = match map.get(GLOBAL_SHORTCUTS_CONFIG_KEY) {
        Some(value) => serde_json::from_value::<Vec<OtoolsGlobalShortcutBinding>>(value.clone())
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools global shortcut config")
                    .with_detail(error.to_string())
            })?,
        None => Vec::new(),
    };

    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for binding in items {
        let Some(binding) = normalize_binding(binding)? else {
            continue;
        };

        let dedupe_key = binding.plugin_uuid.to_lowercase();
        if seen.insert(dedupe_key) {
            normalized.push(binding);
        }
    }

    Ok(normalized)
}

fn persist_bindings(bindings: &[OtoolsGlobalShortcutBinding]) -> Result<(), HostError> {
    let mut map = read_config_map()?;
    map.insert(
        GLOBAL_SHORTCUTS_CONFIG_KEY.to_string(),
        serde_json::to_value(bindings).map_err(|error| {
            HostError::invalid_input("Invalid OTools global shortcuts value")
                .with_detail(error.to_string())
        })?,
    );
    catalog::write_json_file(
        &otools_plugin_config::otools_config_path(),
        &Value::Object(map),
    )
}

fn read_config_map() -> Result<Map<String, Value>, HostError> {
    let path = otools_plugin_config::otools_config_path();
    if !path.exists() {
        return Ok(Map::new());
    }

    match catalog::read_json_file::<Value>(&path)? {
        Value::Object(map) => Ok(map),
        _ => Ok(Map::new()),
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

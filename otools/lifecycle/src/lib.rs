use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use otools_core::catalog::{ToolPlugin, ToolPluginAutostartTask, ToolPluginShutdownHook};
use otools_plugin_dispatcher::host_error_to_string;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

static AUTOSTART_EXECUTED_TASKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsLifecycleRunItem {
    pub plugin_id: String,
    pub entry_id: String,
    pub action: String,
    pub status: String,
    pub message: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsLifecycleRunReport {
    pub phase: String,
    pub total: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub skipped_count: usize,
    pub ignored_count: usize,
    pub items: Vec<OtoolsLifecycleRunItem>,
    pub message: String,
}

pub async fn run_otools_autostart_tasks() -> OtoolsLifecycleRunReport {
    let plugins = match load_lifecycle_plugins() {
        Ok(plugins) => plugins,
        Err(error) => return build_catalog_error_report("autostart", error),
    };

    let mut items = Vec::new();
    for plugin in plugins {
        let plugin_id = plugin_dispatch_id(&plugin);
        let Some(autostart) = plugin.autostart.as_ref() else {
            continue;
        };
        if autostart.enabled == Some(false) {
            continue;
        }

        let should_run_once = autostart.once != Some(false);
        for (index, task) in autostart.tasks.iter().enumerate() {
            let command = match validate_dispatch_token(&task.command, "autostart command") {
                Ok(command) => command,
                Err(error) => {
                    items.push(OtoolsLifecycleRunItem {
                        plugin_id: plugin_id.clone(),
                        entry_id: format!("{}.task-{}", plugin_id, index + 1),
                        action: task.command.trim().to_string(),
                        status: "failed".to_string(),
                        message: error,
                        elapsed_ms: 0,
                    });
                    continue;
                }
            };

            let payload = normalized_task_payload(task.args.clone());
            let task_key = build_autostart_task_key(&plugin_id, &command, &payload);
            if should_run_once && autostart_task_executed(&task_key) {
                items.push(OtoolsLifecycleRunItem {
                    plugin_id: plugin_id.clone(),
                    entry_id: task_key,
                    action: command,
                    status: "skipped".to_string(),
                    message: "autostart task already executed in this process".to_string(),
                    elapsed_ms: 0,
                });
                continue;
            }

            let started_at = Instant::now();
            match invoke_plugin_dispatch(&plugin_id, &command, payload.clone()).await {
                Ok(value) => {
                    if should_run_once {
                        mark_autostart_task_executed(task_key.clone());
                    }
                    items.push(OtoolsLifecycleRunItem {
                        plugin_id: plugin_id.clone(),
                        entry_id: task_key,
                        action: command,
                        status: "success".to_string(),
                        message: extract_dispatch_message(&value),
                        elapsed_ms: elapsed_ms(started_at),
                    });
                }
                Err(error) => {
                    let should_ignore = should_ignore_autostart_error(task, &error);
                    if should_ignore && should_run_once {
                        mark_autostart_task_executed(task_key.clone());
                    }
                    items.push(OtoolsLifecycleRunItem {
                        plugin_id: plugin_id.clone(),
                        entry_id: task_key,
                        action: command,
                        status: if should_ignore {
                            "ignored".to_string()
                        } else {
                            "failed".to_string()
                        },
                        message: error,
                        elapsed_ms: elapsed_ms(started_at),
                    });
                }
            }
        }
    }

    finalize_report("autostart", items)
}

pub async fn run_otools_shutdown_hooks() -> OtoolsLifecycleRunReport {
    let plugins = match load_lifecycle_plugins() {
        Ok(plugins) => plugins,
        Err(error) => return build_catalog_error_report("shutdownHooks", error),
    };

    let mut hook_entries = Vec::new();
    let mut items = Vec::new();

    for plugin in plugins {
        let plugin_id = plugin_dispatch_id(&plugin);
        let Some(hooks) = plugin.shutdown_hooks.as_ref() else {
            continue;
        };

        for (index, hook) in hooks.iter().enumerate() {
            let action_id = match validate_dispatch_token(&hook.action_id, "shutdown actionId") {
                Ok(action_id) => action_id,
                Err(error) => {
                    items.push(OtoolsLifecycleRunItem {
                        plugin_id: plugin_id.clone(),
                        entry_id: hook_entry_id(&plugin_id, hook, index),
                        action: hook.action_id.trim().to_string(),
                        status: "failed".to_string(),
                        message: error,
                        elapsed_ms: 0,
                    });
                    continue;
                }
            };

            hook_entries.push(ShutdownHookEntry {
                plugin_id: plugin_id.clone(),
                entry_id: hook_entry_id(&plugin_id, hook, index),
                action_id,
                timeout_ms: hook.timeout_ms.unwrap_or(12_000),
                enabled: hook.enabled != Some(false),
                order: hook.order.unwrap_or(100 + index as i32),
            });
        }
    }

    hook_entries.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| left.entry_id.cmp(&right.entry_id))
    });

    for hook in hook_entries {
        if !hook.enabled {
            items.push(OtoolsLifecycleRunItem {
                plugin_id: hook.plugin_id,
                entry_id: hook.entry_id,
                action: hook.action_id,
                status: "skipped".to_string(),
                message: "shutdown hook disabled".to_string(),
                elapsed_ms: 0,
            });
            continue;
        }

        let started_at = Instant::now();
        let result =
            tokio::time::timeout(std::time::Duration::from_millis(hook.timeout_ms), async {
                if let Ok(runner) =
                    otools_platform_lifecycle_registry::resolve_shutdown_action_runner(
                        &hook.action_id,
                    )
                {
                    return runner().await.map(Value::String);
                }
                invoke_plugin_dispatch(&hook.plugin_id, &hook.action_id, json!({})).await
            })
            .await;

        match result {
            Ok(Ok(value)) => items.push(OtoolsLifecycleRunItem {
                plugin_id: hook.plugin_id,
                entry_id: hook.entry_id,
                action: hook.action_id,
                status: "success".to_string(),
                message: extract_dispatch_message(&value),
                elapsed_ms: elapsed_ms(started_at),
            }),
            Ok(Err(error)) => items.push(OtoolsLifecycleRunItem {
                plugin_id: hook.plugin_id,
                entry_id: hook.entry_id,
                action: hook.action_id,
                status: "failed".to_string(),
                message: error,
                elapsed_ms: elapsed_ms(started_at),
            }),
            Err(_) => items.push(OtoolsLifecycleRunItem {
                plugin_id: hook.plugin_id,
                entry_id: hook.entry_id,
                action: hook.action_id,
                status: "failed".to_string(),
                message: format!("shutdown hook timed out after {}ms", hook.timeout_ms),
                elapsed_ms: elapsed_ms(started_at),
            }),
        }
    }

    finalize_report("shutdownHooks", items)
}

#[derive(Debug, Clone)]
struct ShutdownHookEntry {
    plugin_id: String,
    entry_id: String,
    action_id: String,
    timeout_ms: u64,
    enabled: bool,
    order: i32,
}

fn executed_autostart_tasks() -> &'static Mutex<HashSet<String>> {
    AUTOSTART_EXECUTED_TASKS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn autostart_task_executed(task_key: &str) -> bool {
    executed_autostart_tasks()
        .lock()
        .map(|guard| guard.contains(task_key))
        .unwrap_or(false)
}

fn mark_autostart_task_executed(task_key: String) {
    if let Ok(mut guard) = executed_autostart_tasks().lock() {
        guard.insert(task_key);
    }
}

fn build_autostart_task_key(plugin_id: &str, command: &str, payload: &Value) -> String {
    let serialized = serde_json::to_string(&canonicalize_value(payload))
        .unwrap_or_else(|_| "[unserializable-payload]".to_string());
    format!("{plugin_id}::{command}::{serialized}")
}

fn canonicalize_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries = map
                .iter()
                .map(|(key, value)| (key.clone(), canonicalize_value(value)))
                .collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut normalized = Map::new();
            for (key, value) in entries {
                normalized.insert(key, value);
            }
            Value::Object(normalized)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_value).collect()),
        _ => value.clone(),
    }
}

fn normalized_task_payload(payload: Option<Value>) -> Value {
    match payload {
        Some(Value::Object(map)) => Value::Object(map),
        Some(Value::Null) | None => Value::Object(Map::new()),
        Some(value) => value,
    }
}

fn should_ignore_autostart_error(task: &ToolPluginAutostartTask, error: &str) -> bool {
    let lowered = error.to_ascii_lowercase();
    task.ignore_error_includes.iter().any(|hint| {
        let normalized = hint.trim().to_ascii_lowercase();
        !normalized.is_empty() && lowered.contains(&normalized)
    })
}

async fn invoke_plugin_dispatch(
    plugin_id: &str,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    otools_plugin_dispatcher::invoke_lifecycle_command(plugin_id, action, payload).await
}

fn extract_dispatch_message(value: &Value) -> String {
    value
        .get("data")
        .and_then(extract_data_message)
        .or_else(|| extract_data_message(value))
        .unwrap_or_else(|| "ok".to_string())
}

fn extract_data_message(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Object(map) => ["message", "msg", "detail", "statusText"]
            .iter()
            .find_map(|key| map.get(*key).and_then(Value::as_str))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        _ => None,
    }
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis().min(u64::MAX as u128) as u64
}

fn finalize_report(phase: &str, items: Vec<OtoolsLifecycleRunItem>) -> OtoolsLifecycleRunReport {
    let total = items.len();
    let success_count = items.iter().filter(|item| item.status == "success").count();
    let failed_count = items.iter().filter(|item| item.status == "failed").count();
    let skipped_count = items.iter().filter(|item| item.status == "skipped").count();
    let ignored_count = items.iter().filter(|item| item.status == "ignored").count();
    let message = if total == 0 {
        format!("{phase} has no runnable items")
    } else if failed_count == 0 {
        format!(
            "{phase} completed: success={}, skipped={}, ignored={}",
            success_count, skipped_count, ignored_count
        )
    } else {
        format!(
            "{phase} completed with failures: success={}, failed={}, skipped={}, ignored={}",
            success_count, failed_count, skipped_count, ignored_count
        )
    };

    OtoolsLifecycleRunReport {
        phase: phase.to_string(),
        total,
        success_count,
        failed_count,
        skipped_count,
        ignored_count,
        items,
        message,
    }
}

fn build_catalog_error_report(phase: &str, error: String) -> OtoolsLifecycleRunReport {
    finalize_report(
        phase,
        vec![OtoolsLifecycleRunItem {
            plugin_id: "catalog".to_string(),
            entry_id: "catalog.load".to_string(),
            action: phase.to_string(),
            status: "failed".to_string(),
            message: error,
            elapsed_ms: 0,
        }],
    )
}

fn load_lifecycle_plugins() -> Result<Vec<ToolPlugin>, String> {
    otools_plugin_registry::list_lifecycle_plugins().map_err(host_error_to_string)
}

fn plugin_dispatch_id(plugin: &otools_core::catalog::ToolPlugin) -> String {
    otools_plugin_registry::tool_plugin_dispatch_id(plugin)
}

fn hook_entry_id(plugin_id: &str, hook: &ToolPluginShutdownHook, index: usize) -> String {
    hook.hook_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{plugin_id}.hook-{}", index + 1))
}

fn validate_dispatch_token(value: &str, label: &str) -> Result<String, String> {
    otools_plugin_dispatcher::validate_dispatch_token(value, label).map_err(host_error_to_string)
}

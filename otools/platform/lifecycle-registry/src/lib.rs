use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, OnceLock, RwLock};

type ShutdownHookFuture = Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'static>>;
pub type ShutdownHookRunner = Arc<dyn Fn() -> ShutdownHookFuture + Send + Sync + 'static>;

static SHUTDOWN_ACTION_REGISTRY: OnceLock<RwLock<HashMap<String, ShutdownHookRunner>>> =
    OnceLock::new();

fn action_registry() -> &'static RwLock<HashMap<String, ShutdownHookRunner>> {
    SHUTDOWN_ACTION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

fn normalize_action_id(value: &str) -> Result<String, String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err("shutdown actionId 不能为空".to_string());
    }
    Ok(normalized.to_string())
}

pub fn register_shutdown_action<F, Fut>(action_id: &str, runner: F) -> Result<(), String>
where
    F: Fn() -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<String, String>> + Send + 'static,
{
    let wrapped: ShutdownHookRunner = Arc::new(move || Box::pin(runner()));
    let key = normalize_action_id(action_id)?;
    let mut guard = action_registry()
        .write()
        .map_err(|_| "shutdown action 注册表写入失败".to_string())?;
    guard.insert(key, wrapped);
    Ok(())
}

pub fn resolve_shutdown_action_runner(action_id: &str) -> Result<ShutdownHookRunner, String> {
    let normalized = normalize_action_id(action_id)?;
    let guard = action_registry()
        .read()
        .map_err(|_| "shutdown action 注册表读取失败".to_string())?;
    guard
        .get(&normalized)
        .cloned()
        .ok_or_else(|| format!("未注册的 shutdown action: {}", normalized))
}

pub fn has_shutdown_action(action_id: &str) -> bool {
    let Ok(normalized) = normalize_action_id(action_id) else {
        return false;
    };
    action_registry()
        .read()
        .map(|guard| guard.contains_key(&normalized))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_and_resolves_shutdown_action() {
        register_shutdown_action("test.shutdown", || async { Ok("done".to_string()) }).unwrap();

        assert!(has_shutdown_action(" test.shutdown "));
        assert!(resolve_shutdown_action_runner("test.shutdown").is_ok());
    }

    #[test]
    fn rejects_empty_action_id() {
        assert_eq!(
            register_shutdown_action(" ", || async { Ok(String::new()) }).unwrap_err(),
            "shutdown actionId 不能为空"
        );
    }
}

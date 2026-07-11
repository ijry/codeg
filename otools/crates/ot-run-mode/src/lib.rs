use std::sync::OnceLock;

static RUN_MODE: OnceLock<RunMode> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunMode {
    Desktop,
    Cli,
}

impl RunMode {
    pub fn from_env_args<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let values = args.into_iter().map(Into::into).collect::<Vec<String>>();
        let mut index = 0usize;
        while index < values.len() {
            let value = values[index].trim().to_string();
            if let Some(mode_value) = value.strip_prefix("--mode=") {
                return Self::from_cli_value(mode_value);
            }
            if value == "--mode" {
                if let Some(next) = values.get(index + 1) {
                    return Self::from_cli_value(next);
                }
                return Self::Desktop;
            }
            index += 1;
        }
        Self::Desktop
    }

    fn from_cli_value(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "cli" => Self::Cli,
            _ => Self::Desktop,
        }
    }

    pub fn is_cli(self) -> bool {
        matches!(self, Self::Cli)
    }
}

pub fn set_run_mode(run_mode: RunMode) {
    let _ = RUN_MODE.set(run_mode);
}

pub fn current_run_mode() -> RunMode {
    RUN_MODE.get().copied().unwrap_or(RunMode::Desktop)
}

pub fn is_cli_mode() -> bool {
    matches!(current_run_mode(), RunMode::Cli)
}

#[cfg(target_os = "linux")]
pub fn has_graphical_display() -> bool {
    std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some()
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn has_graphical_display() -> bool {
    true
}

pub fn validate_startup_environment(run_mode: RunMode) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    let _ = run_mode;

    #[cfg(target_os = "linux")]
    {
        if matches!(run_mode, RunMode::Desktop) && !has_graphical_display() {
            return Err(
                "当前 Linux 环境未检测到 DISPLAY 或 WAYLAND_DISPLAY，无法以 desktop 模式启动。请改用 `--mode cli`。"
                    .to_string(),
            );
        }
    }

    Ok(())
}

pub fn log_startup_mode(run_mode: RunMode, remote_service_port: u16) {
    match run_mode {
        RunMode::Desktop => {
            eprintln!("[startup] run mode=desktop");
        }
        RunMode::Cli => {
            eprintln!("[startup] run mode=cli");
            eprintln!(
                "[startup] remote-service target=http://127.0.0.1:{}",
                remote_service_port
            );
            #[cfg(target_os = "linux")]
            if !has_graphical_display() {
                eprintln!(
                    "[startup] Linux 未检测到图形会话，当前进入 cli 模式。注意：若底层 Tauri/Wry 运行时仍依赖图形栈，则后续仍可能受系统环境限制。"
                );
            }
        }
    }
}

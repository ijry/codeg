use std::path::{Path, PathBuf};
use std::process::Command;

use otools_core::HostError;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScriptInfo {
    pub name: String,
    pub command: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScriptsResponse {
    pub has_package_json: bool,
    pub package_manager: String,
    pub command_prefix: String,
    pub scripts: Vec<ProjectScriptInfo>,
}

pub async fn project_runner_read_scripts(
    working_dir: Option<String>,
) -> Result<ProjectScriptsResponse, HostError> {
    let Some(raw_working_dir) = working_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(empty_project_scripts_response());
    };

    let working_dir = PathBuf::from(&raw_working_dir);
    let package_json_path = working_dir.join("package.json");
    if !package_json_path.is_file() {
        return Ok(empty_project_scripts_response());
    }

    let content = std::fs::read_to_string(&package_json_path).map_err(HostError::io)?;
    let package_json: Value = serde_json::from_str(&content).map_err(|error| {
        HostError::configuration_invalid("Invalid package.json")
            .with_detail(format!("{}: {error}", package_json_path.display()))
    })?;

    let scripts = parse_package_scripts(&package_json);
    let (package_manager, command_prefix) =
        detect_project_package_manager(&working_dir, &package_json);

    Ok(ProjectScriptsResponse {
        has_package_json: true,
        package_manager: package_manager.to_string(),
        command_prefix: command_prefix.to_string(),
        scripts,
    })
}

pub async fn project_editor_open(path: String, editor_id: String) -> Result<(), HostError> {
    let normalized_path = require_non_empty(path, "path")?;
    let normalized_editor_id = require_non_empty(editor_id, "editorId")?.to_lowercase();

    match normalized_editor_id.as_str() {
        "vscode" => open_in_vscode(&normalized_path),
        "idea" => open_in_idea(&normalized_path),
        _ => Err(HostError::invalid_input(format!(
            "unsupported project editor: {normalized_editor_id}"
        ))),
    }
}

pub async fn project_runner_open_in_terminal(
    working_dir: Option<String>,
) -> Result<(), HostError> {
    let path = require_non_empty(working_dir.unwrap_or_default(), "workingDir")?;
    open_in_terminal(&path)
}

fn require_non_empty(value: String, name: &str) -> Result<String, HostError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input(format!("{name} is required")));
    }
    Ok(trimmed.to_string())
}

fn resolve_terminal_working_dir(path: &str) -> Result<PathBuf, HostError> {
    let candidate = PathBuf::from(path);
    let directory = if candidate.is_file() {
        candidate.parent().map(Path::to_path_buf).ok_or_else(|| {
            HostError::task_execution_failed("Failed to resolve parent directory")
        })?
    } else {
        candidate
    };

    if !directory.is_dir() {
        return Err(
            HostError::task_execution_failed("Directory does not exist or is not a folder")
                .with_detail(directory.to_string_lossy().to_string()),
        );
    }

    Ok(directory)
}

#[cfg(target_os = "windows")]
fn normalize_windows_path(raw_path: &str) -> String {
    raw_path.trim().trim_matches('"').replace('/', "\\")
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn external_command_error(message: &'static str, detail: impl Into<String>) -> HostError {
    HostError::task_execution_failed(message).with_detail(detail)
}

fn run_command_status(command: &mut Command, message: &'static str) -> Result<(), HostError> {
    let status = command
        .status()
        .map_err(|error| external_command_error(message, error.to_string()))?;

    if status.success() {
        Ok(())
    } else {
        Err(external_command_error(message, format!("exit status: {status}")))
    }
}

fn open_in_vscode(path: &str) -> Result<(), HostError> {
    #[cfg(target_os = "macos")]
    {
        return run_command_status(
            Command::new("open").args(["-a", "Visual Studio Code", path]),
            "Failed to open VSCode",
        );
    }

    #[cfg(not(target_os = "macos"))]
    {
        run_command_status(
            otools_platform_process::new_background_command("code")
                .arg("-r")
                .arg(path),
            "Failed to open VSCode",
        )
    }
}

fn open_in_idea(path: &str) -> Result<(), HostError> {
    #[cfg(target_os = "macos")]
    {
        return run_command_status(
            Command::new("open").args(["-a", "IntelliJ IDEA", path]),
            "Failed to open IntelliJ IDEA",
        );
    }

    #[cfg(not(target_os = "macos"))]
    {
        run_command_status(
            otools_platform_process::new_background_command("idea").arg(path),
            "Failed to open IntelliJ IDEA",
        )
    }
}

fn open_in_terminal(path: &str) -> Result<(), HostError> {
    #[cfg(target_os = "windows")]
    {
        let normalized_path = normalize_windows_path(path);
        if normalized_path.is_empty() {
            return Err(HostError::invalid_input("Path is empty"));
        }
        let working_dir = resolve_terminal_working_dir(&normalized_path)?;
        otools_platform_process::new_background_command("cmd")
            .current_dir(&working_dir)
            .args(["/C", "start", "", "cmd", "/K"])
            .spawn()
            .map_err(|error| external_command_error("Failed to open terminal", error.to_string()))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let working_dir = resolve_terminal_working_dir(path)?;
        let working_dir_text = working_dir.to_string_lossy();
        let shell_cmd = format!("cd {} && exec \"$SHELL\"", shell_single_quote(&working_dir_text));
        let escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("tell application \"Terminal\" to do script \"{escaped}\"");

        Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn()
            .map_err(|error| external_command_error("Failed to open terminal", error.to_string()))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let working_dir = resolve_terminal_working_dir(path)?;
        let working_dir_text = working_dir.to_string_lossy();
        let shell_cmd = format!("cd {} && exec bash", shell_single_quote(&working_dir_text));
        let terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
        for terminal in terminals {
            let result = match terminal {
                "gnome-terminal" => Command::new(terminal)
                    .args(["--", "sh", "-c", &shell_cmd])
                    .spawn(),
                _ => Command::new(terminal)
                    .args(["-e", "sh", "-c", &shell_cmd])
                    .spawn(),
            };

            if result.is_ok() {
                return Ok(());
            }
        }

        return Err(external_command_error(
            "Failed to open terminal",
            "No suitable terminal emulator found",
        ));
    }

    #[allow(unreachable_code)]
    Err(HostError::task_execution_failed(
        "Unsupported platform for terminal launch",
    ))
}

fn empty_project_scripts_response() -> ProjectScriptsResponse {
    ProjectScriptsResponse {
        has_package_json: false,
        package_manager: "npm".to_string(),
        command_prefix: "npm run ".to_string(),
        scripts: Vec::new(),
    }
}

fn detect_project_package_manager(
    working_dir: &Path,
    package_json: &Value,
) -> (&'static str, &'static str) {
    if let Some(package_manager) = package_json
        .get("packageManager")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if package_manager.starts_with("pnpm@") {
            return ("pnpm", "pnpm run ");
        }
        if package_manager.starts_with("yarn@") {
            return ("yarn", "yarn ");
        }
        if package_manager.starts_with("bun@") {
            return ("bun", "bun run ");
        }
        if package_manager.starts_with("npm@") {
            return ("npm", "npm run ");
        }
    }

    if working_dir.join("pnpm-lock.yaml").is_file() {
        return ("pnpm", "pnpm run ");
    }
    if working_dir.join("yarn.lock").is_file() {
        return ("yarn", "yarn ");
    }
    if working_dir.join("package-lock.json").is_file() {
        return ("npm", "npm run ");
    }
    if working_dir.join("bun.lockb").is_file() || working_dir.join("bun.lock").is_file() {
        return ("bun", "bun run ");
    }

    ("npm", "npm run ")
}

fn parse_package_scripts(package_json: &Value) -> Vec<ProjectScriptInfo> {
    let Some(object) = package_json.get("scripts").and_then(Value::as_object) else {
        return Vec::new();
    };

    let sorted: std::collections::BTreeMap<String, String> = object
        .iter()
        .filter_map(|(name, value)| {
            value
                .as_str()
                .map(|command| (name.to_string(), command.to_string()))
        })
        .collect();

    sorted
        .into_iter()
        .map(|(name, command)| ProjectScriptInfo { name, command })
        .collect()
}

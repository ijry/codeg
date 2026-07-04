use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
#[cfg(target_os = "linux")]
use std::io::Write;
use std::path::{Path, PathBuf};
#[cfg(target_os = "linux")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "linux")]
use std::time::{Duration, Instant};
#[cfg(target_os = "windows")]
use std::fs;

#[cfg(target_os = "windows")]
use encoding_rs::{BIG5, EUC_KR, GBK, SHIFT_JIS, UTF_8, WINDOWS_1252};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Globalization::GetOEMCP;

#[cfg(target_os = "linux")]
const HOST_LINUX_SUDO_PASSWORD_REQUIRED: &str = "SERVRUN_LINUX_SUDO_PASSWORD_REQUIRED";
#[cfg(target_os = "linux")]
const HOST_LINUX_SUDO_PASSWORD_INVALID: &str = "SERVRUN_LINUX_SUDO_PASSWORD_INVALID";
#[cfg(target_os = "linux")]
const HOST_LINUX_PRIVILEGE_CACHE_TTL_SECS: u64 = 15 * 60;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPackageActionResult {
    pub package_manager: String,
    pub package_name: String,
    pub action: String,
    pub success: bool,
    pub message: String,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPackageStatusResult {
    pub package_manager: String,
    pub package_name: String,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub available_version: Option<String>,
    pub upgradable: bool,
    pub message: String,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostWingetInstallOptions {
    pub source: Option<String>,
    pub scope: Option<String>,
    pub exact: Option<bool>,
    pub accept_package_agreements: Option<bool>,
    pub accept_source_agreements: Option<bool>,
    pub disable_interactivity: Option<bool>,
}

#[derive(Debug, Clone)]
struct HostCommandResult {
    success: bool,
    message: String,
    command: String,
    stdout: String,
    stderr: String,
}

fn new_background_command(program: &str) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

#[cfg(target_os = "linux")]
#[derive(Clone)]
struct LinuxPrivilegeCacheEntry {
    encrypted_password: Vec<u8>,
    expires_at: Instant,
}

#[cfg(target_os = "linux")]
static HOST_LINUX_PRIVILEGE_CACHE: OnceLock<Mutex<Option<LinuxPrivilegeCacheEntry>>> =
    OnceLock::new();
#[cfg(target_os = "linux")]
static HOST_LINUX_PRIVILEGE_KEY: OnceLock<Vec<u8>> = OnceLock::new();

fn quote_shell_arg(value: &str) -> String {
    if value.contains(' ') {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn stringify_command(program: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(program.to_string());
    for arg in args {
        parts.push(quote_shell_arg(arg));
    }
    parts.join(" ")
}

#[cfg(target_os = "windows")]
fn windows_shell_output_encoding() -> &'static encoding_rs::Encoding {
    match unsafe { GetOEMCP() } {
        65001 => UTF_8,
        936 => GBK,
        950 => BIG5,
        932 => SHIFT_JIS,
        949 => EUC_KR,
        1252 => WINDOWS_1252,
        _ => UTF_8,
    }
}

fn normalize_shell_output(bytes: &[u8]) -> String {
    #[cfg(target_os = "windows")]
    {
        let encoding = windows_shell_output_encoding();
        let (decoded, _, had_errors) = encoding.decode(bytes);
        if !had_errors {
            return decoded.trim().to_string();
        }
    }

    String::from_utf8_lossy(bytes).trim().to_string()
}

fn resolve_binary_path(binary: &str) -> Option<PathBuf> {
    let trimmed = binary.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.components().count() > 1 || candidate.is_absolute() {
        return candidate.is_file().then_some(candidate);
    }

    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        #[cfg(target_os = "windows")]
        {
            let has_extension = Path::new(trimmed).extension().is_some();
            if has_extension {
                let direct = dir.join(trimmed);
                if direct.is_file() {
                    return Some(direct);
                }
            } else {
                let pathext = env::var_os("PATHEXT")
                    .map(|value| {
                        value
                            .to_string_lossy()
                            .split(';')
                            .map(|item| item.trim().to_string())
                            .filter(|item| !item.is_empty())
                            .collect::<Vec<_>>()
                    })
                    .filter(|items| !items.is_empty())
                    .unwrap_or_else(|| {
                        vec![
                            ".COM".to_string(),
                            ".EXE".to_string(),
                            ".BAT".to_string(),
                            ".CMD".to_string(),
                        ]
                    });

                for ext in pathext {
                    let candidate = dir.join(format!("{trimmed}{ext}"));
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let direct = dir.join(trimmed);
            if direct.is_file() {
                return Some(direct);
            }
        }
    }

    None
}

fn command_exists(command: &str) -> bool {
    resolve_binary_path(command).is_some()
}

fn execute(program: &str, args: &[String]) -> Result<HostCommandResult, String> {
    let resolved_program = resolve_binary_path(program)
        .unwrap_or_else(|| PathBuf::from(program))
        .to_string_lossy()
        .to_string();

    let output = new_background_command(&resolved_program)
        .args(args)
        .output()
        .map_err(|err| {
            format!(
                "执行命令失败: {} ({})",
                stringify_command(&resolved_program, args),
                err
            )
        })?;

    let stdout = normalize_shell_output(&output.stdout);
    let stderr = normalize_shell_output(&output.stderr);
    let success = output.status.success();
    let message = if success {
        "命令执行成功".to_string()
    } else if !stderr.is_empty() {
        stderr.clone()
    } else if !stdout.is_empty() {
        stdout.clone()
    } else {
        "命令执行失败".to_string()
    };

    Ok(HostCommandResult {
        success,
        message,
        command: stringify_command(&resolved_program, args),
        stdout,
        stderr,
    })
}

#[cfg(target_os = "linux")]
fn execute_with_stdin(
    program: &str,
    args: &[String],
    stdin_payload: Option<&str>,
) -> Result<HostCommandResult, String> {
    let resolved_program = resolve_binary_path(program)
        .unwrap_or_else(|| PathBuf::from(program))
        .to_string_lossy()
        .to_string();

    let mut command = new_background_command(&resolved_program);
    command.args(args);
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    if stdin_payload.is_some() {
        command.stdin(std::process::Stdio::piped());
    }

    let mut child = command.spawn().map_err(|err| {
        format!(
            "执行命令失败: {} ({})",
            stringify_command(&resolved_program, args),
            err
        )
    })?;

    if let Some(payload) = stdin_payload {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload.as_bytes())
                .and_then(|_| stdin.flush())
                .map_err(|err| format!("写入命令输入失败: {}", err))?;
        }
    }

    let output = child.wait_with_output().map_err(|err| {
        format!(
            "执行命令失败: {} ({})",
            stringify_command(&resolved_program, args),
            err
        )
    })?;

    let stdout = normalize_shell_output(&output.stdout);
    let stderr = normalize_shell_output(&output.stderr);
    let success = output.status.success();
    let message = if success {
        "命令执行成功".to_string()
    } else if !stderr.is_empty() {
        stderr.clone()
    } else if !stdout.is_empty() {
        stdout.clone()
    } else {
        "命令执行失败".to_string()
    };

    Ok(HostCommandResult {
        success,
        message,
        command: stringify_command(&resolved_program, args),
        stdout,
        stderr,
    })
}

#[cfg(target_os = "linux")]
fn linux_is_root_user() -> bool {
    unsafe { libc::geteuid() == 0 }
}

#[cfg(target_os = "linux")]
fn linux_privilege_cache_ttl() -> Duration {
    Duration::from_secs(HOST_LINUX_PRIVILEGE_CACHE_TTL_SECS)
}

#[cfg(target_os = "linux")]
fn linux_privilege_key() -> &'static [u8] {
    HOST_LINUX_PRIVILEGE_KEY.get_or_init(|| {
        let first = uuid::Uuid::new_v4();
        let second = uuid::Uuid::new_v4();
        let mut bytes = Vec::with_capacity(32);
        bytes.extend_from_slice(first.as_bytes());
        bytes.extend_from_slice(second.as_bytes());
        bytes
    })
}

#[cfg(target_os = "linux")]
fn xor_crypt_bytes(input: &[u8]) -> Vec<u8> {
    let key = linux_privilege_key();
    input
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ key[index % key.len()])
        .collect()
}

#[cfg(target_os = "linux")]
fn cache_linux_privilege_password(password: &str) -> Result<(), String> {
    let cache = HOST_LINUX_PRIVILEGE_CACHE.get_or_init(|| Mutex::new(None));
    let encrypted_password = xor_crypt_bytes(password.as_bytes());
    let expires_at = Instant::now() + linux_privilege_cache_ttl();
    let mut guard = cache
        .lock()
        .map_err(|_| "Linux sudo 缓存锁定失败".to_string())?;
    *guard = Some(LinuxPrivilegeCacheEntry {
        encrypted_password,
        expires_at,
    });
    Ok(())
}

#[cfg(target_os = "linux")]
fn read_linux_privilege_password() -> Result<String, String> {
    if linux_is_root_user() {
        return Ok(String::new());
    }

    let cache = HOST_LINUX_PRIVILEGE_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache
        .lock()
        .map_err(|_| "Linux sudo 缓存锁定失败".to_string())?;
    let Some(entry) = guard.as_ref() else {
        return Err(HOST_LINUX_SUDO_PASSWORD_REQUIRED.to_string());
    };
    if Instant::now() > entry.expires_at {
        *guard = None;
        return Err(HOST_LINUX_SUDO_PASSWORD_REQUIRED.to_string());
    }

    let decrypted = xor_crypt_bytes(&entry.encrypted_password);
    String::from_utf8(decrypted).map_err(|_| HOST_LINUX_SUDO_PASSWORD_REQUIRED.to_string())
}

#[cfg(target_os = "linux")]
fn clear_linux_privilege_password() {
    if let Some(cache) = HOST_LINUX_PRIVILEGE_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            *guard = None;
        }
    }
}

#[cfg(target_os = "linux")]
fn validate_linux_sudo_password(password: &str) -> Result<(), String> {
    if linux_is_root_user() {
        return Ok(());
    }

    let normalized = password.trim_end_matches(['\r', '\n']);
    if normalized.is_empty() {
        return Err(HOST_LINUX_SUDO_PASSWORD_INVALID.to_string());
    }

    let args = vec![
        "-S".to_string(),
        "-p".to_string(),
        "".to_string(),
        "-v".to_string(),
    ];
    let result = execute_with_stdin("sudo", &args, Some(&format!("{}\n", normalized)))?;
    if result.success {
        return Ok(());
    }
    clear_linux_privilege_password();
    Err(HOST_LINUX_SUDO_PASSWORD_INVALID.to_string())
}

fn validate_package_target(target: &str) -> Result<String, String> {
    let normalized = target.trim();
    if normalized.is_empty() {
        return Err("包名不能为空".to_string());
    }
    if !normalized.chars().all(|ch| {
        ch.is_ascii_alphanumeric() || matches!(ch, '.' | '+' | '-' | '_' | ':' | '@' | '~')
    }) {
        return Err("包名包含不受支持的字符".to_string());
    }
    Ok(normalized.to_string())
}

fn validate_option_token(label: &str, target: &str) -> Result<String, String> {
    let normalized = target.trim();
    if normalized.is_empty() {
        return Err(format!("{label} 不能为空"));
    }
    if !normalized.chars().all(|ch| {
        ch.is_ascii_alphanumeric() || matches!(ch, '.' | '+' | '-' | '_' | ':' | '@' | '~')
    }) {
        return Err(format!("{label} 包含不受支持的字符"));
    }
    Ok(normalized.to_string())
}

fn normalize_package_action(action: &str) -> Result<String, String> {
    let normalized = action.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "install" => Ok("install".to_string()),
        "uninstall" | "remove" => Ok("uninstall".to_string()),
        "upgrade" | "update" => Ok("upgrade".to_string()),
        _ => Err("仅支持 install/uninstall/upgrade 操作".to_string()),
    }
}

fn default_package_manager() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        return command_exists("brew").then(|| "brew".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        return command_exists("winget").then(|| "winget".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        for manager in ["apt-get", "dnf", "yum", "pacman", "zypper", "brew"] {
            if command_exists(manager) {
                return Some(manager.to_string());
            }
        }
        return None;
    }

    #[allow(unreachable_code)]
    None
}

fn normalize_package_manager(manager: Option<&str>) -> Result<String, String> {
    let normalized = manager
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .or_else(default_package_manager)
        .ok_or_else(|| "未检测到支持的包管理器".to_string())?;

    match normalized.as_str() {
        "apt" | "apt-get" => Ok("apt-get".to_string()),
        "dnf" => Ok("dnf".to_string()),
        "yum" => Ok("yum".to_string()),
        "pacman" => Ok("pacman".to_string()),
        "zypper" => Ok("zypper".to_string()),
        "brew" => Ok("brew".to_string()),
        "winget" => Ok("winget".to_string()),
        _ => Err(format!("不支持的包管理器: {}", normalized)),
    }
}

#[cfg(target_os = "linux")]
fn build_linux_package_manager_args(
    manager: &str,
    package_name: &str,
    action: &str,
) -> Result<Vec<String>, String> {
    let args = match manager {
        "apt-get" => match action {
            "install" => vec![
                "install".to_string(),
                "-y".to_string(),
                package_name.to_string(),
            ],
            "uninstall" => vec![
                "remove".to_string(),
                "-y".to_string(),
                package_name.to_string(),
            ],
            _ => return Err("仅支持 install/uninstall 操作".to_string()),
        },
        "dnf" | "yum" => match action {
            "install" => vec![
                "install".to_string(),
                "-y".to_string(),
                package_name.to_string(),
            ],
            "uninstall" => vec![
                "remove".to_string(),
                "-y".to_string(),
                package_name.to_string(),
            ],
            _ => return Err("仅支持 install/uninstall 操作".to_string()),
        },
        "pacman" => match action {
            "install" => vec![
                "-S".to_string(),
                "--noconfirm".to_string(),
                package_name.to_string(),
            ],
            "uninstall" => {
                vec![
                    "-R".to_string(),
                    "--noconfirm".to_string(),
                    package_name.to_string(),
                ]
            }
            _ => return Err("仅支持 install/uninstall 操作".to_string()),
        },
        "zypper" => match action {
            "install" => vec![
                "--non-interactive".to_string(),
                "install".to_string(),
                package_name.to_string(),
            ],
            "uninstall" => vec![
                "--non-interactive".to_string(),
                "remove".to_string(),
                package_name.to_string(),
            ],
            _ => return Err("仅支持 install/uninstall 操作".to_string()),
        },
        _ => return Err(format!("Linux 不支持的包管理器: {}", manager)),
    };

    Ok(args)
}

#[cfg(target_os = "linux")]
fn execute_linux_package_manager_command(
    manager: &str,
    args: &[String],
) -> Result<HostCommandResult, String> {
    if linux_is_root_user() {
        return execute(manager, args);
    }

    let password = read_linux_privilege_password()?;
    let mut sudo_args = vec![
        "-S".to_string(),
        "-p".to_string(),
        "".to_string(),
        manager.to_string(),
    ];
    sudo_args.extend_from_slice(args);
    let result = execute_with_stdin("sudo", &sudo_args, Some(&format!("{}\n", password)))?;
    if result.success {
        return Ok(result);
    }

    let stderr_lower = result.stderr.to_ascii_lowercase();
    let stdout_lower = result.stdout.to_ascii_lowercase();
    if stderr_lower.contains("incorrect password")
        || stderr_lower.contains("try again")
        || stderr_lower.contains("a password is required")
        || stdout_lower.contains("incorrect password")
        || stdout_lower.contains("try again")
    {
        clear_linux_privilege_password();
        return Err(HOST_LINUX_SUDO_PASSWORD_REQUIRED.to_string());
    }

    Ok(result)
}

#[cfg(target_os = "linux")]
fn run_linux_package_action_internal(
    manager: &str,
    package_name: &str,
    action: &str,
) -> Result<HostCommandResult, String> {
    let args = build_linux_package_manager_args(manager, package_name, action)?;
    let mut result = execute_linux_package_manager_command(manager, &args)?;
    result.command = if linux_is_root_user() {
        stringify_command(manager, &args)
    } else {
        stringify_command("sudo", &{
            let mut all = vec![
                "-S".to_string(),
                "-p".to_string(),
                "".to_string(),
                manager.to_string(),
            ];
            all.extend(args.clone());
            all
        })
    };
    Ok(result)
}

fn run_brew_package_action_internal(
    package_name: &str,
    action: &str,
) -> Result<HostCommandResult, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if !command_exists("brew") {
            return Err("未检测到 brew".to_string());
        }

        let args = match action {
            "install" => vec!["install".to_string(), package_name.to_string()],
            "uninstall" => vec!["uninstall".to_string(), package_name.to_string()],
            "upgrade" => vec!["upgrade".to_string(), package_name.to_string()],
            _ => return Err("仅支持 install/uninstall/upgrade 操作".to_string()),
        };

        return execute("brew", &args);
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = package_name;
        let _ = action;
        Err("当前系统不支持 brew 包管理".to_string())
    }
}

#[cfg(target_os = "windows")]
fn winget_requires_windows_elevation(result: &HostCommandResult) -> bool {
    let text =
        format!("{}\n{}\n{}", result.message, result.stdout, result.stderr).to_ascii_lowercase();
    text.contains("administrator")
        || text.contains("admin privileges")
        || text.contains("elevation")
        || text.contains("0x8a150042")
}

#[cfg(target_os = "windows")]
fn powershell_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn run_windows_elevated_winget(args: &[String]) -> Result<HostCommandResult, String> {
    let temp_root = std::env::temp_dir().join("otools-host-winget");
    fs::create_dir_all(&temp_root).map_err(|err| {
        format!(
            "创建临时目录失败: {} ({})",
            temp_root.to_string_lossy(),
            err
        )
    })?;

    let token = uuid::Uuid::new_v4().to_string();
    let script_path = temp_root.join(format!("{token}.ps1"));
    let stdout_path = temp_root.join(format!("{token}.stdout.txt"));
    let stderr_path = temp_root.join(format!("{token}.stderr.txt"));
    let exit_path = temp_root.join(format!("{token}.exit.txt"));

    let winget_args_literal = args
        .iter()
        .map(|value| format!("'{}'", powershell_single_quote(value)))
        .collect::<Vec<_>>()
        .join(", ");

    let script = format!(
        r#"$ErrorActionPreference = 'Continue'
$stdoutPath = '{stdout_path}'
$stderrPath = '{stderr_path}'
$exitPath = '{exit_path}'
$argsList = @({args_list})
$output = & winget @argsList 2>&1
$lines = @($output | ForEach-Object {{ $_.ToString() }})
$exitCode = if ($LASTEXITCODE -eq $null) {{ 0 }} else {{ [int]$LASTEXITCODE }}
Set-Content -Path $stdoutPath -Value ($lines -join [Environment]::NewLine) -Encoding UTF8
Set-Content -Path $stderrPath -Value '' -Encoding UTF8
Set-Content -Path $exitPath -Value ([string]$exitCode) -Encoding UTF8
exit $exitCode
"#,
        stdout_path = powershell_single_quote(stdout_path.to_string_lossy().as_ref()),
        stderr_path = powershell_single_quote(stderr_path.to_string_lossy().as_ref()),
        exit_path = powershell_single_quote(exit_path.to_string_lossy().as_ref()),
        args_list = winget_args_literal
    );

    fs::write(&script_path, script).map_err(|err| {
        format!(
            "写入 winget 提权脚本失败: {} ({})",
            script_path.to_string_lossy(),
            err
        )
    })?;

    let launcher_script = format!(
        "Start-Process -FilePath 'powershell' -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','{}')",
        powershell_single_quote(script_path.to_string_lossy().as_ref())
    );
    let launcher_args = vec![
        "-NoProfile".to_string(),
        "-Command".to_string(),
        launcher_script,
    ];
    let launcher_result = execute("powershell", &launcher_args)?;
    if !launcher_result.success && !exit_path.exists() {
        return Ok(HostCommandResult {
            success: false,
            message: if !launcher_result.stderr.is_empty() {
                launcher_result.stderr.clone()
            } else if !launcher_result.stdout.is_empty() {
                launcher_result.stdout.clone()
            } else {
                "Windows 管理员提权已取消或执行失败".to_string()
            },
            command: format!("{} [UAC]", stringify_command("winget", args)),
            stdout: launcher_result.stdout,
            stderr: launcher_result.stderr,
        });
    }

    let stdout = fs::read_to_string(&stdout_path)
        .unwrap_or_default()
        .trim()
        .to_string();
    let stderr = fs::read_to_string(&stderr_path)
        .unwrap_or_default()
        .trim()
        .to_string();
    let exit_code = fs::read_to_string(&exit_path)
        .ok()
        .and_then(|value| value.trim().parse::<i32>().ok())
        .unwrap_or(if launcher_result.success { 0 } else { 1 });
    let success = exit_code == 0;
    let message = if success {
        "命令执行成功".to_string()
    } else if !stderr.is_empty() {
        stderr.clone()
    } else if !stdout.is_empty() {
        stdout.clone()
    } else if !launcher_result.stderr.is_empty() {
        launcher_result.stderr.clone()
    } else {
        "Windows 管理员提权执行失败".to_string()
    };

    let _ = fs::remove_file(&script_path);
    let _ = fs::remove_file(&stdout_path);
    let _ = fs::remove_file(&stderr_path);
    let _ = fs::remove_file(&exit_path);

    Ok(HostCommandResult {
        success,
        message,
        command: format!("{} [UAC]", stringify_command("winget", args)),
        stdout,
        stderr,
    })
}

#[cfg(target_os = "windows")]
fn build_winget_package_action_args(
    package_name: &str,
    action: &str,
    version: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut args = match action {
        "install" => vec![
            "install".to_string(),
            "--id".to_string(),
            package_name.to_string(),
            "-e".to_string(),
            "--accept-package-agreements".to_string(),
            "--accept-source-agreements".to_string(),
            "--disable-interactivity".to_string(),
        ],
        "uninstall" => vec![
            "uninstall".to_string(),
            "--id".to_string(),
            package_name.to_string(),
            "-e".to_string(),
            "--disable-interactivity".to_string(),
        ],
        "upgrade" => vec![
            "upgrade".to_string(),
            "--id".to_string(),
            package_name.to_string(),
            "-e".to_string(),
            "--accept-package-agreements".to_string(),
            "--accept-source-agreements".to_string(),
            "--disable-interactivity".to_string(),
        ],
        _ => return Err("仅支持 install/uninstall/upgrade 操作".to_string()),
    };

    if let Some(version) = version.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--version".to_string());
        args.push(version.to_string());
    }

    Ok(args)
}

fn split_columns(line: &str) -> Vec<String> {
    let mut columns: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut spaces = 0usize;
    for ch in line.chars() {
        if ch == ' ' {
            spaces += 1;
            if spaces >= 2 {
                if !current.trim().is_empty() {
                    columns.push(current.trim().to_string());
                    current.clear();
                }
                continue;
            }
        } else {
            if spaces == 1 {
                current.push(' ');
            }
            spaces = 0;
            current.push(ch);
        }
    }
    if !current.trim().is_empty() {
        columns.push(current.trim().to_string());
    }
    columns
}

fn parse_winget_table_rows(output: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut after_separator = false;
    for raw_line in output.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().all(|ch| ch == '-' || ch == ' ') {
            after_separator = true;
            continue;
        }
        if !after_separator {
            continue;
        }
        if trimmed.starts_with("No installed package")
            || trimmed.starts_with("No installed package found")
            || trimmed.starts_with("No applicable upgrade found")
            || trimmed.starts_with("No available upgrade found")
        {
            continue;
        }
        let columns = split_columns(trimmed);
        if columns.len() >= 3 {
            rows.push(columns);
        }
    }
    rows
}

#[cfg(target_os = "windows")]
fn run_windows_winget_package_status_internal(
    package_name: &str,
) -> Result<HostPackageStatusResult, String> {
    if !command_exists("winget") {
        return Err("未检测到 winget，请先安装 App Installer".to_string());
    }

    let list_args = vec![
        "list".to_string(),
        "--id".to_string(),
        package_name.to_string(),
        "-e".to_string(),
        "--accept-source-agreements".to_string(),
        "--disable-interactivity".to_string(),
    ];
    let list_result = execute("winget", &list_args)?;
    let list_rows = parse_winget_table_rows(&list_result.stdout);
    let installed_row = list_rows.iter().find(|row| {
        row.get(1)
            .map(|value| value.eq_ignore_ascii_case(package_name))
            .unwrap_or(false)
    });
    let installed = installed_row.is_some();
    let installed_version = installed_row.and_then(|row| row.get(2).cloned());
    let mut available_version = installed_row.and_then(|row| row.get(3).cloned());

    let upgrade_args = vec![
        "list".to_string(),
        "--id".to_string(),
        package_name.to_string(),
        "-e".to_string(),
        "--upgrade-available".to_string(),
        "--accept-source-agreements".to_string(),
        "--disable-interactivity".to_string(),
    ];
    let upgrade_result = execute("winget", &upgrade_args)?;
    let upgrade_rows = parse_winget_table_rows(&upgrade_result.stdout);
    let upgrade_row = upgrade_rows.iter().find(|row| {
        row.get(1)
            .map(|value| value.eq_ignore_ascii_case(package_name))
            .unwrap_or(false)
    });
    if available_version.is_none() {
        available_version = upgrade_row.and_then(|row| row.get(3).cloned());
    }
    let upgradable = upgrade_row.is_some();

    let (message, command, stdout, stderr) = if upgradable {
        let mut combined_stdout = String::new();
        if !list_result.stdout.is_empty() {
            combined_stdout.push_str(&list_result.stdout);
        }
        if !upgrade_result.stdout.is_empty() {
            if !combined_stdout.is_empty() {
                combined_stdout.push_str("\n\n");
            }
            combined_stdout.push_str(&upgrade_result.stdout);
        }
        (
            "查询成功".to_string(),
            format!("{} && {}", list_result.command, upgrade_result.command),
            combined_stdout,
            [list_result.stderr, upgrade_result.stderr]
                .into_iter()
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n"),
        )
    } else {
        (
            list_result.message.clone(),
            list_result.command.clone(),
            list_result.stdout.clone(),
            list_result.stderr.clone(),
        )
    };

    Ok(HostPackageStatusResult {
        package_manager: "winget".to_string(),
        package_name: package_name.to_string(),
        installed,
        installed_version,
        available_version,
        upgradable,
        message,
        command,
        stdout,
        stderr,
    })
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_brew_versions_line(output: &str, package_name: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let name = parts.next()?;
        if !name.eq_ignore_ascii_case(package_name) {
            continue;
        }
        let version = parts.collect::<Vec<_>>().join(" ");
        if version.is_empty() {
            return None;
        }
        return Some(version);
    }
    None
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_brew_outdated_line(output: &str, package_name: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !trimmed
            .to_ascii_lowercase()
            .starts_with(&package_name.to_ascii_lowercase())
        {
            continue;
        }
        if let Some((_, right)) = trimmed.split_once('<') {
            let value = right.trim().trim_matches(',');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
        return Some(String::new());
    }
    None
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_brew_versions_map(output: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let Some(name) = parts.next() else {
            continue;
        };
        let version = parts.collect::<Vec<_>>().join(" ");
        if version.is_empty() {
            continue;
        }
        out.insert(name.to_ascii_lowercase(), version);
    }
    out
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn parse_brew_outdated_map(output: &str) -> HashMap<String, Option<String>> {
    let mut out = HashMap::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Some(name) = trimmed.split_whitespace().next() else {
            continue;
        };
        let available = trimmed
            .split_once('<')
            .map(|(_, right)| right.trim().trim_matches(','))
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        out.insert(name.to_ascii_lowercase(), available);
    }
    out
}

fn run_brew_package_status_internal(
    package_name: &str,
    cask: bool,
) -> Result<HostPackageStatusResult, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if !command_exists("brew") {
            return Err("未检测到 brew".to_string());
        }

        let mut list_args = vec!["list".to_string()];
        if cask {
            list_args.push("--cask".to_string());
        }
        list_args.push("--versions".to_string());
        list_args.push(package_name.to_string());
        let list_result = execute("brew", &list_args)?;

        let installed_version = parse_brew_versions_line(&list_result.stdout, package_name);
        let installed = installed_version.is_some();

        let mut outdated_args = vec!["outdated".to_string()];
        if cask {
            outdated_args.push("--cask".to_string());
        }
        outdated_args.push("--verbose".to_string());
        outdated_args.push(package_name.to_string());
        let outdated_result = execute("brew", &outdated_args)?;

        let available_version = parse_brew_outdated_line(&outdated_result.stdout, package_name)
            .and_then(|value| if value.is_empty() { None } else { Some(value) });
        let upgradable = parse_brew_outdated_line(&outdated_result.stdout, package_name).is_some();

        Ok(HostPackageStatusResult {
            package_manager: "brew".to_string(),
            package_name: package_name.to_string(),
            installed,
            installed_version,
            available_version,
            upgradable,
            message: "查询成功".to_string(),
            command: format!("{} && {}", list_result.command, outdated_result.command),
            stdout: [list_result.stdout, outdated_result.stdout]
                .into_iter()
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n"),
            stderr: [list_result.stderr, outdated_result.stderr]
                .into_iter()
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n"),
        })
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = package_name;
        let _ = cask;
        Err("当前系统不支持 brew 包管理".to_string())
    }
}

#[cfg(target_os = "windows")]
fn run_windows_winget_packages_status_internal(
    package_names: &[String],
) -> Result<Vec<HostPackageStatusResult>, String> {
    if !command_exists("winget") {
        return Err("未检测到 winget，请先安装 App Installer".to_string());
    }

    let list_args = vec![
        "list".to_string(),
        "--accept-source-agreements".to_string(),
        "--disable-interactivity".to_string(),
    ];
    let list_result = execute("winget", &list_args)?;
    let list_rows = parse_winget_table_rows(&list_result.stdout);
    let mut installed_map: HashMap<String, Option<String>> = HashMap::new();
    for row in list_rows {
        if row.len() < 3 {
            continue;
        }
        let key = row[1].to_ascii_lowercase();
        installed_map.insert(key, row.get(2).cloned());
    }

    let upgradable_args = vec![
        "list".to_string(),
        "--upgrade-available".to_string(),
        "--accept-source-agreements".to_string(),
        "--disable-interactivity".to_string(),
    ];
    let upgradable_result = execute("winget", &upgradable_args)?;
    let upgradable_rows = parse_winget_table_rows(&upgradable_result.stdout);
    let mut upgradable_map: HashMap<String, Option<String>> = HashMap::new();
    for row in upgradable_rows {
        if row.len() < 4 {
            continue;
        }
        let key = row[1].to_ascii_lowercase();
        upgradable_map.insert(key, row.get(3).cloned());
    }

    let command = format!("{} && {}", list_result.command, upgradable_result.command);
    let stdout = [list_result.stdout, upgradable_result.stdout]
        .into_iter()
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let stderr = [list_result.stderr, upgradable_result.stderr]
        .into_iter()
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(package_names
        .iter()
        .map(|package_name| {
            let key = package_name.to_ascii_lowercase();
            let installed_version = installed_map.get(&key).cloned().unwrap_or(None);
            let available_version = upgradable_map.get(&key).cloned().unwrap_or(None);
            HostPackageStatusResult {
                package_manager: "winget".to_string(),
                package_name: package_name.clone(),
                installed: installed_version.is_some(),
                installed_version,
                available_version,
                upgradable: upgradable_map.contains_key(&key),
                message: "批量查询成功".to_string(),
                command: command.clone(),
                stdout: stdout.clone(),
                stderr: stderr.clone(),
            }
        })
        .collect())
}

fn run_brew_packages_status_internal(
    package_names: &[String],
    cask: bool,
) -> Result<Vec<HostPackageStatusResult>, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if !command_exists("brew") {
            return Err("未检测到 brew".to_string());
        }

        let mut list_args = vec!["list".to_string()];
        if cask {
            list_args.push("--cask".to_string());
        }
        list_args.push("--versions".to_string());
        let list_result = execute("brew", &list_args)?;
        let installed_map = parse_brew_versions_map(&list_result.stdout);

        let mut outdated_args = vec!["outdated".to_string()];
        if cask {
            outdated_args.push("--cask".to_string());
        }
        outdated_args.push("--verbose".to_string());
        let outdated_result = execute("brew", &outdated_args)?;
        let outdated_map = parse_brew_outdated_map(&outdated_result.stdout);

        let command = format!("{} && {}", list_result.command, outdated_result.command);
        let stdout = [list_result.stdout, outdated_result.stdout]
            .into_iter()
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
        let stderr = [list_result.stderr, outdated_result.stderr]
            .into_iter()
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");

        Ok(package_names
            .iter()
            .map(|package_name| {
                let key = package_name.to_ascii_lowercase();
                let installed_version = installed_map.get(&key).cloned();
                let available_version = outdated_map.get(&key).cloned().unwrap_or(None);
                HostPackageStatusResult {
                    package_manager: "brew".to_string(),
                    package_name: package_name.clone(),
                    installed: installed_version.is_some(),
                    installed_version,
                    available_version,
                    upgradable: outdated_map.contains_key(&key),
                    message: "批量查询成功".to_string(),
                    command: command.clone(),
                    stdout: stdout.clone(),
                    stderr: stderr.clone(),
                }
            })
            .collect())
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = package_names;
        let _ = cask;
        Err("当前系统不支持 brew 包管理".to_string())
    }
}

#[cfg(target_os = "windows")]
fn build_winget_install_args_with_options(
    package_name: &str,
    options: &HostWingetInstallOptions,
) -> Result<Vec<String>, String> {
    let mut args = vec![
        "install".to_string(),
        "--id".to_string(),
        package_name.to_string(),
    ];

    if options.exact.unwrap_or(true) {
        args.push("-e".to_string());
    }

    if options.accept_package_agreements.unwrap_or(true) {
        args.push("--accept-package-agreements".to_string());
    }

    if options.accept_source_agreements.unwrap_or(true) {
        args.push("--accept-source-agreements".to_string());
    }

    if options.disable_interactivity.unwrap_or(true) {
        args.push("--disable-interactivity".to_string());
    }

    if let Some(source) = options
        .source
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        args.push("--source".to_string());
        args.push(validate_option_token("winget source", source)?);
    }

    if let Some(scope) = options
        .scope
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let normalized_scope = scope.trim().to_ascii_lowercase();
        if normalized_scope != "user" && normalized_scope != "machine" {
            return Err("winget scope 仅支持 user 或 machine".to_string());
        }
        args.push("--scope".to_string());
        args.push(normalized_scope);
    }

    Ok(args)
}

#[cfg(target_os = "windows")]
fn run_windows_winget_package_action_internal(
    package_name: &str,
    action: &str,
    version: Option<&str>,
) -> Result<HostCommandResult, String> {
    if !command_exists("winget") {
        return Err("未检测到 winget，请先安装 App Installer".to_string());
    }

    let args = build_winget_package_action_args(package_name, action, version)?;
    let result = execute("winget", &args)?;
    if result.success || !winget_requires_windows_elevation(&result) {
        return Ok(result);
    }

    run_windows_elevated_winget(&args)
}

#[cfg(target_os = "windows")]
fn run_windows_winget_install_with_options_internal(
    package_name: &str,
    options: &HostWingetInstallOptions,
) -> Result<HostCommandResult, String> {
    if !command_exists("winget") {
        return Err("未检测到 winget，请先安装 App Installer".to_string());
    }

    let args = build_winget_install_args_with_options(package_name, options)?;
    let result = execute("winget", &args)?;
    if result.success || !winget_requires_windows_elevation(&result) {
        return Ok(result);
    }

    run_windows_elevated_winget(&args)
}

fn wrap_host_package_action_result(
    package_manager: String,
    package_name: String,
    action: String,
    result: HostCommandResult,
) -> HostPackageActionResult {
    HostPackageActionResult {
        package_manager,
        package_name,
        action,
        success: result.success,
        message: result.message,
        command: result.command,
        stdout: result.stdout,
        stderr: result.stderr,
    }
}

pub fn otools_host_set_linux_privilege_password_sync(password: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        validate_linux_sudo_password(&password)?;
        cache_linux_privilege_password(password.trim_end_matches(['\r', '\n']))?;
        return Ok("cached".to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = password;
        Err("仅 Linux 支持该操作".to_string())
    }
}

pub async fn otools_host_set_linux_privilege_password(password: String) -> Result<String, String> {
    otools_host_set_linux_privilege_password_sync(password)
}

pub fn otools_host_run_package_action_sync(
    manager: Option<String>,
    package_name: String,
    action: String,
    version: Option<String>,
) -> Result<HostPackageActionResult, String> {
    let package_manager = normalize_package_manager(manager.as_deref())?;
    let package_name = validate_package_target(&package_name)?;
    let action = normalize_package_action(&action)?;

    match package_manager.as_str() {
        #[cfg(target_os = "linux")]
        "apt-get" | "dnf" | "yum" | "pacman" | "zypper" => {
            let action_result =
                run_linux_package_action_internal(&package_manager, &package_name, &action)?;
            Ok(wrap_host_package_action_result(
                package_manager,
                package_name.clone(),
                action.clone(),
                action_result,
            ))
        }
        #[cfg(not(target_os = "linux"))]
        "apt-get" | "dnf" | "yum" | "pacman" | "zypper" => {
            let _ = version;
            Err("仅 Linux 支持该包管理器".to_string())
        }
        "brew" => {
            let _ = version;
            Ok(wrap_host_package_action_result(
                package_manager,
                package_name.clone(),
                action.clone(),
                run_brew_package_action_internal(&package_name, &action)?,
            ))
        }
        #[cfg(target_os = "windows")]
        "winget" => Ok(wrap_host_package_action_result(
            package_manager,
            package_name.clone(),
            action.clone(),
            run_windows_winget_package_action_internal(&package_name, &action, version.as_deref())?,
        )),
        #[cfg(not(target_os = "windows"))]
        "winget" => Err("仅 Windows 支持 winget 包管理".to_string()),
        _ => Err(format!("不支持的包管理器: {}", package_manager)),
    }
}

pub async fn otools_host_run_package_action(
    manager: Option<String>,
    package_name: String,
    action: String,
    version: Option<String>,
) -> Result<HostPackageActionResult, String> {
    otools_host_run_package_action_sync(manager, package_name, action, version)
}

pub fn otools_host_run_winget_install_sync(
    package_name: String,
    options: HostWingetInstallOptions,
) -> Result<HostPackageActionResult, String> {
    #[cfg(target_os = "windows")]
    {
        let package_name = validate_package_target(&package_name)?;
        let result = run_windows_winget_install_with_options_internal(&package_name, &options)?;
        return Ok(wrap_host_package_action_result(
            "winget".to_string(),
            package_name,
            "install".to_string(),
            result,
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = package_name;
        let _ = options;
        Err("仅 Windows 支持 winget 安装".to_string())
    }
}

pub async fn otools_host_run_winget_install(
    package_name: String,
    options: HostWingetInstallOptions,
) -> Result<HostPackageActionResult, String> {
    otools_host_run_winget_install_sync(package_name, options)
}

pub fn otools_host_get_package_status_sync(
    manager: Option<String>,
    package_name: String,
    cask: Option<bool>,
) -> Result<HostPackageStatusResult, String> {
    let package_manager = normalize_package_manager(manager.as_deref())?;
    let package_name = validate_package_target(&package_name)?;
    match package_manager.as_str() {
        "brew" => run_brew_package_status_internal(&package_name, cask.unwrap_or(false)),
        #[cfg(target_os = "windows")]
        "winget" => run_windows_winget_package_status_internal(&package_name),
        #[cfg(not(target_os = "windows"))]
        "winget" => Err("仅 Windows 支持 winget 包管理".to_string()),
        _ => Err(format!("当前不支持 {} 的安装状态查询", package_manager)),
    }
}

pub async fn otools_host_get_package_status(
    manager: Option<String>,
    package_name: String,
    cask: Option<bool>,
) -> Result<HostPackageStatusResult, String> {
    otools_host_get_package_status_sync(manager, package_name, cask)
}

pub fn otools_host_get_packages_status_sync(
    manager: Option<String>,
    package_names: Vec<String>,
    cask: Option<bool>,
) -> Result<Vec<HostPackageStatusResult>, String> {
    let package_manager = normalize_package_manager(manager.as_deref())?;
    let mut normalized_names: Vec<String> = Vec::new();
    for raw_name in package_names {
        let name = validate_package_target(&raw_name)?;
        if !normalized_names
            .iter()
            .any(|item| item.eq_ignore_ascii_case(&name))
        {
            normalized_names.push(name);
        }
    }
    if normalized_names.is_empty() {
        return Ok(Vec::new());
    }

    match package_manager.as_str() {
        "brew" => run_brew_packages_status_internal(&normalized_names, cask.unwrap_or(false)),
        #[cfg(target_os = "windows")]
        "winget" => run_windows_winget_packages_status_internal(&normalized_names),
        #[cfg(not(target_os = "windows"))]
        "winget" => Err("仅 Windows 支持 winget 包管理".to_string()),
        _ => Err(format!("当前不支持 {} 的批量安装状态查询", package_manager)),
    }
}

pub async fn otools_host_get_packages_status(
    manager: Option<String>,
    package_names: Vec<String>,
    cask: Option<bool>,
) -> Result<Vec<HostPackageStatusResult>, String> {
    otools_host_get_packages_status_sync(manager, package_names, cask)
}


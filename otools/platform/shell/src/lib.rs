use std::io::Write;
use std::path::Path;

pub fn otools_shell_open_path(path: String) -> Result<(), String> {
    let target = require_non_empty(&path, "路径不能为空")?;

    #[cfg(target_os = "windows")]
    {
        spawn_background("explorer", &[target])?;
    }

    #[cfg(target_os = "macos")]
    {
        spawn_background("open", &[target])?;
    }

    #[cfg(target_os = "linux")]
    {
        spawn_background("xdg-open", &[target])?;
    }

    Ok(())
}

pub fn otools_shell_show_item_in_folder(path: String) -> Result<(), String> {
    let target = require_non_empty(&path, "路径不能为空")?;

    #[cfg(target_os = "windows")]
    {
        spawn_background("explorer", &["/select,", target])?;
    }

    #[cfg(target_os = "macos")]
    {
        spawn_background("open", &["-R", target])?;
    }

    #[cfg(target_os = "linux")]
    {
        let path = Path::new(target);
        let folder = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        let folder = folder.to_string_lossy().to_string();
        spawn_background("xdg-open", &[&folder])?;
    }

    Ok(())
}

pub fn otools_shell_trash_item(path: String) -> Result<(), String> {
    let target = require_non_empty(&path, "路径不能为空")?;
    trash::delete(Path::new(target)).map_err(|error| format!("移入废纸篓失败: {error}"))
}

pub fn otools_shell_open_external(url: String) -> Result<(), String> {
    let target = require_non_empty(&url, "URL 不能为空")?;

    #[cfg(target_os = "windows")]
    {
        spawn_background("rundll32", &["url.dll,FileProtocolHandler", target])?;
    }

    #[cfg(target_os = "macos")]
    {
        spawn_background("open", &[target])?;
    }

    #[cfg(target_os = "linux")]
    {
        spawn_background("xdg-open", &[target])?;
    }

    Ok(())
}

pub fn otools_shell_beep() -> Result<(), String> {
    let _ = std::io::stdout().write_all(b"\x07");
    let _ = std::io::stdout().flush();
    Ok(())
}

fn require_non_empty<'a>(value: &'a str, message: &str) -> Result<&'a str, String> {
    let target = value.trim();
    if target.is_empty() {
        Err(message.to_string())
    } else {
        Ok(target)
    }
}

fn spawn_background(program: &str, args: &[&str]) -> Result<(), String> {
    let mut command = otools_platform_process::new_background_command(program);
    command.args(args);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("执行命令失败: {program} ({error})"))
}

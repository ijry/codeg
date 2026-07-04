use tauri::{plugin::TauriPlugin, AppHandle, Runtime};

pub fn init_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None)
}

pub fn otools_request_app_exit(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

pub async fn otools_get_launch_at_startup(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_autostart::ManagerExt;

        app.autolaunch()
            .is_enabled()
            .map_err(|error| format!("读取开机启动状态失败: {error}"))
    })
    .await
    .map_err(|error| format!("读取开机启动状态失败: {error}"))?
}

pub async fn otools_set_launch_at_startup(
    app: AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_autostart::ManagerExt;

        let autolaunch = app.autolaunch();
        if enabled {
            autolaunch
                .enable()
                .map_err(|error| format!("开启开机启动失败: {error}"))?;
        } else {
            autolaunch
                .disable()
                .map_err(|error| format!("关闭开机启动失败: {error}"))?;
        }

        autolaunch
            .is_enabled()
            .map_err(|error| format!("读取开机启动状态失败: {error}"))
    })
    .await
    .map_err(|error| format!("设置开机启动状态失败: {error}"))?
}

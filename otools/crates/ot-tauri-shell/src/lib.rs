//! Minimize/hide/show primary shell window for capture flows and tray.

use ot_run_mode::is_cli_mode;
use tauri::{AppHandle, Emitter, Manager};

fn hide_tools_tab_windows(app_handle: &AppHandle) {
    for (label, window) in app_handle.webview_windows() {
        if label.starts_with("tools-tab-") {
            let _ = window.hide();
        }
    }
}

fn emit_shell_event(app_handle: &AppHandle, label: &str, event: &str, payload: &str) {
    if !label.is_empty() {
        let _ = app_handle.emit_to(label, event, payload);
    }
}

pub fn hide_window(app_handle: &AppHandle) {
    if is_cli_mode() {
        eprintln!("[ot-tauri-shell] skip hide_window in cli mode");
        return;
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        let label = window.label().to_string();
        let _ = window.minimize();
        let _ = window.hide();
        hide_tools_tab_windows(app_handle);
        emit_shell_event(
            app_handle,
            &label,
            "tools-shell-hide-requested",
            "tray-hide",
        );
        return;
    }

    for (label, window) in app_handle.webview_windows() {
        if label.starts_with("tools-tab-") {
            continue;
        }
        let _ = window.minimize();
        let _ = window.hide();
        hide_tools_tab_windows(app_handle);
        emit_shell_event(
            app_handle,
            &label,
            "tools-shell-hide-requested",
            "tray-hide",
        );
        return;
    }

    println!("[ot-tauri-shell] main shell window is None in hide_window");
}

pub fn show_window(app_handle: &AppHandle) {
    if is_cli_mode() {
        eprintln!("[ot-tauri-shell] skip show_window in cli mode");
        return;
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        let label = window.label().to_string();
        #[cfg(target_os = "macos")]
        {
            use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
            use cocoa::base::id;
            if let Ok(ns_window_ptr) = window.ns_window() {
                let ns_window = ns_window_ptr as id;
                unsafe {
                    let behaviors = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
                    ns_window.setCollectionBehavior_(behaviors);
                }
            } else {
            println!("[ot-tauri-shell] ns_window() is None in show_window");
            }
        }

        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
        emit_shell_event(
            app_handle,
            &label,
            "tools-shell-sync-requested",
            "tray-show",
        );
        return;
    }

    for (label, window) in app_handle.webview_windows() {
        if label.starts_with("tools-tab-") {
            continue;
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
        emit_shell_event(
            app_handle,
            &label,
            "tools-shell-sync-requested",
            "tray-show",
        );
        return;
    }

    println!("[ot-tauri-shell] main shell window is None in show_window");
}

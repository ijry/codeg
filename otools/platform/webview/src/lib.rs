use std::collections::HashSet;
use std::path::PathBuf;

use otools_platform_host::WebviewFileMeta;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewBuilder,
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

const OTOOLS_THEME_SYNC_EVENT_NAME: &str = "otools-theme-sync-requested";
const OTOOLS_LOCALE_SYNC_EVENT_NAME: &str = "otools-locale-changed";
const TOOLS_TAB_WEBVIEW_LABEL_PREFIX: &str = "tools-tab-";

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolsChildThemePayload {
    pub theme_mode: String,
    pub theme_accent: String,
    pub resolved_theme: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ToolsChildLocalePayload {
    pub locale: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewFilePickerOptions {
    pub multiple: Option<bool>,
    pub title: Option<String>,
    pub directory: Option<String>,
    pub filters: Option<Vec<WebviewFileFilter>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewSaveFileOptions {
    pub title: Option<String>,
    pub suggested_name: Option<String>,
    pub directory: Option<String>,
    pub filters: Option<Vec<WebviewFileFilter>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewPickFolderOptions {
    pub title: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WebviewFileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSaveFileMeta {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewPickedFolder {
    pub path: String,
    pub name: String,
}

pub async fn tools_webview_pick_files(
    app: AppHandle,
    options: Option<WebviewFilePickerOptions>,
) -> Result<Vec<WebviewFileMeta>, String> {
    let options = options.unwrap_or_default();
    let multiple = options.multiple.unwrap_or(false);
    let mut dialog = app.dialog().file();

    if let Some(title) = options.title.as_deref() {
        dialog = dialog.set_title(title);
    }
    if let Some(directory) = options.directory.as_deref() {
        dialog = dialog.set_directory(directory);
    }
    if let Some(filters) = options.filters.as_deref() {
        dialog = apply_dialog_filters(dialog, filters);
    }

    let picked = if multiple {
        dialog.blocking_pick_files().unwrap_or_default()
    } else {
        dialog
            .blocking_pick_file()
            .map(|value| vec![value])
            .unwrap_or_default()
    };

    let mut files = Vec::new();
    for item in picked {
        let path = item
            .into_path()
            .map_err(|error| format!("路径转换失败: {error}"))?;
        files.push(file_meta(path).await?);
    }
    Ok(files)
}

pub async fn tools_webview_pick_save_path(
    app: AppHandle,
    options: Option<WebviewSaveFileOptions>,
) -> Result<Option<WebviewSaveFileMeta>, String> {
    let options = options.unwrap_or_default();
    let mut dialog = app.dialog().file();

    if let Some(title) = options.title.as_deref() {
        dialog = dialog.set_title(title);
    }
    if let Some(directory) = options.directory.as_deref() {
        dialog = dialog.set_directory(directory);
    }
    if let Some(file_name) = options.suggested_name.as_deref() {
        dialog = dialog.set_file_name(file_name);
    }
    if let Some(filters) = options.filters.as_deref() {
        dialog = apply_dialog_filters(dialog, filters);
    }

    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("路径转换失败: {error}"))?;
    Ok(Some(WebviewSaveFileMeta {
        name: path_name(&path, "file"),
        path: path.to_string_lossy().to_string(),
    }))
}

pub async fn tools_webview_pick_folder(
    app: AppHandle,
    options: Option<WebviewPickFolderOptions>,
) -> Result<Option<WebviewPickedFolder>, String> {
    let options = options.unwrap_or_default();
    let mut dialog = app.dialog().file();

    if let Some(title) = options.title.as_deref() {
        dialog = dialog.set_title(title);
    }
    if let Some(directory) = options.directory.as_deref() {
        dialog = dialog.set_directory(directory);
    }

    let Some(path) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("路径转换失败: {error}"))?;
    Ok(Some(WebviewPickedFolder {
        name: path_name(&path, "folder"),
        path: path.to_string_lossy().to_string(),
    }))
}

pub async fn create_tools_tab_window(
    app: AppHandle,
    label: String,
    title: String,
    url: String,
    plugin_uuid: Option<String>,
) -> Result<(), String> {
    let _ = plugin_uuid;
    create_child_or_window(app, label, title, url, false).await
}

pub async fn create_embedded_webview(
    app: AppHandle,
    label: String,
    title: String,
    url: String,
) -> Result<(), String> {
    create_child_or_window(app, label, title, url, false).await
}

pub fn close_tools_tab_window(app: AppHandle, label: String) -> Result<(), String> {
    close_webview_or_window(app, label, "tools tab")
}

pub fn close_embedded_webview(app: AppHandle, label: String) -> Result<(), String> {
    close_webview_or_window(app, label, "embedded webview")
}

pub fn tools_tab_exists(app: AppHandle, label: String) -> bool {
    webview_or_window_exists(&app, &label)
}

pub fn embedded_webview_exists(app: AppHandle, label: String) -> bool {
    webview_or_window_exists(&app, &label)
}

pub fn switch_and_position_tools_windows(
    app: AppHandle,
    active_label: Option<String>,
    all_labels: Vec<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    close_orphan_tools_tabs(&app, &all_labels);
    switch_and_position_webviews(app, active_label, all_labels, x, y, width, height)
}

pub fn switch_and_position_embedded_webviews(
    app: AppHandle,
    active_label: Option<String>,
    all_labels: Vec<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    switch_and_position_webviews(app, active_label, all_labels, x, y, width, height)
}

pub fn set_tools_loading_state(
    app: AppHandle,
    visible: bool,
    all_labels: Vec<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let _ = (x, y, width, height);
    if visible {
        for label in all_labels {
            hide_webview_or_window(&app, &label);
        }
    }
    Ok(())
}

pub fn tools_sync_child_webview_theme(
    app: AppHandle,
    payload: ToolsChildThemePayload,
) -> Result<(), String> {
    app.emit(OTOOLS_THEME_SYNC_EVENT_NAME, payload)
        .map_err(|error| format!("broadcast theme sync failed: {error}"))
}

pub fn tools_sync_child_webview_locale(
    app: AppHandle,
    payload: ToolsChildLocalePayload,
) -> Result<(), String> {
    app.emit(OTOOLS_LOCALE_SYNC_EVENT_NAME, payload)
        .map_err(|error| format!("broadcast locale sync failed: {error}"))
}

async fn create_child_or_window(
    app: AppHandle,
    label: String,
    title: String,
    url: String,
    focus: bool,
) -> Result<(), String> {
    let label = require_label(label)?;
    if webview_or_window_exists(&app, &label) {
        return Ok(());
    }

    let webview_url = resolve_webview_url(&url)?;
    if let Some(main_window) = app.get_window("main") {
        let webview = main_window
            .add_child(
                WebviewBuilder::new(&label, webview_url).accept_first_mouse(true),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1.0, 1.0),
            )
            .map_err(|error| format!("Failed to create child webview `{label}`: {error}"))?;
        let _ = webview.hide();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, &label, webview_url)
        .title(normalize_title(&title))
        .inner_size(1024.0, 720.0)
        .visible(false)
        .focused(focus)
        .accept_first_mouse(true)
        .build()
        .map_err(|error| format!("Failed to create webview window `{label}`: {error}"))?;
    let _ = window.hide();
    Ok(())
}

fn switch_and_position_webviews(
    app: AppHandle,
    active_label: Option<String>,
    all_labels: Vec<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let active_label = active_label
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let (x, y, width, height) = normalize_bounds(x, y, width, height);

    for label in &all_labels {
        if Some(label.as_str()) != active_label.as_deref() {
            hide_webview_or_window(&app, label);
        }
    }

    let Some(active) = active_label else {
        return Ok(());
    };

    if width <= 0.0 || height <= 0.0 {
        hide_webview_or_window(&app, &active);
        return Ok(());
    }

    if let Some(webview) = app.get_webview(&active) {
        webview
            .set_position(Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|error| format!("Failed to position webview `{active}`: {error}"))?;
        webview
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|error| format!("Failed to resize webview `{active}`: {error}"))?;
        webview
            .show()
            .map_err(|error| format!("Failed to show webview `{active}`: {error}"))?;
        return Ok(());
    }

    if let Some(window) = app.get_webview_window(&active) {
        let _ = window.set_position(Position::Logical(LogicalPosition::new(x, y)));
        let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
        window
            .show()
            .map_err(|error| format!("Failed to show webview window `{active}`: {error}"))?;
    }

    Ok(())
}

fn close_webview_or_window(app: AppHandle, label: String, kind: &str) -> Result<(), String> {
    let label = require_label(label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview
            .close()
            .map_err(|error| format!("Failed to close {kind} `{label}`: {error}"))?;
        return Ok(());
    }
    if let Some(window) = app.get_webview_window(&label) {
        window
            .destroy()
            .map_err(|error| format!("Failed to close {kind} window `{label}`: {error}"))?;
    }
    Ok(())
}

fn close_orphan_tools_tabs(app: &AppHandle, all_labels: &[String]) {
    let expected = all_labels.iter().cloned().collect::<HashSet<_>>();
    for (label, webview) in app.webviews() {
        if label.starts_with(TOOLS_TAB_WEBVIEW_LABEL_PREFIX) && !expected.contains(&label) {
            let _ = webview.close();
        }
    }
    for (label, window) in app.webview_windows() {
        if label.starts_with(TOOLS_TAB_WEBVIEW_LABEL_PREFIX) && !expected.contains(&label) {
            let _ = window.destroy();
        }
    }
}

fn hide_webview_or_window(app: &AppHandle, label: &str) {
    if let Some(webview) = app.get_webview(label) {
        let _ = webview.hide();
        return;
    }
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.hide();
    }
}

fn webview_or_window_exists(app: &AppHandle, label: &str) -> bool {
    let label = label.trim();
    !label.is_empty() && (app.get_webview(label).is_some() || app.get_webview_window(label).is_some())
}

fn resolve_webview_url(raw: &str) -> Result<WebviewUrl, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err("webview url is required".to_string());
    }

    if let Ok(url) = url::Url::parse(value) {
        return Ok(WebviewUrl::External(url));
    }

    let path = PathBuf::from(value);
    if path.is_absolute() || path.exists() {
        let path = path.canonicalize().unwrap_or(path);
        let url = url::Url::from_file_path(&path)
            .map_err(|_| format!("Invalid file webview url `{}`", path.display()))?;
        return Ok(WebviewUrl::External(url));
    }

    Ok(WebviewUrl::App(value.trim_start_matches('/').into()))
}

fn normalize_bounds(x: f64, y: f64, width: f64, height: f64) -> (f64, f64, f64, f64) {
    (x.max(0.0), y.max(0.0), width.max(0.0), height.max(0.0))
}

fn normalize_title(title: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        "OTools".to_string()
    } else {
        title.to_string()
    }
}

fn require_label(label: String) -> Result<String, String> {
    let label = label.trim().to_string();
    if label.is_empty() {
        Err("webview label is required".to_string())
    } else {
        Ok(label)
    }
}

fn path_name(path: &std::path::Path, fallback: &str) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

async fn file_meta(path: PathBuf) -> Result<WebviewFileMeta, String> {
    otools_platform_host::tools_webview_file_meta(path.to_string_lossy().to_string())
        .await
        .map_err(|error| {
            if let Some(detail) = error.detail {
                format!("{}: {}", error.message, detail)
            } else {
                error.message
            }
        })
}

fn apply_dialog_filters(
    dialog: tauri_plugin_dialog::FileDialogBuilder<tauri::Wry>,
    filters: &[WebviewFileFilter],
) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    filters.iter().fold(dialog, |dialog, filter| {
        let name = filter.name.trim();
        let extensions = filter
            .extensions
            .iter()
            .map(|ext| ext.trim().trim_start_matches('.'))
            .filter(|ext| !ext.is_empty())
            .collect::<Vec<_>>();
        if name.is_empty() || extensions.is_empty() {
            dialog
        } else {
            dialog.add_filter(name, &extensions)
        }
    })
}

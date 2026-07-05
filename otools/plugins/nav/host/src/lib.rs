use chrono::Local;
use otools_core::{catalog, HostError};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const NAV_CATEGORY_UNCLASSIFIED: &str = "未分类";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavCategoryRecord {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavBookmarkRecord {
    pub id: String,
    pub title: String,
    pub url: String,
    pub domain: String,
    pub source: String,
    pub folder_path: String,
    pub note: String,
    pub category_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NavWorkspaceFile {
    pub categories: Vec<NavCategoryRecord>,
    pub bookmarks: Vec<NavBookmarkRecord>,
    pub updated_at: String,
    pub last_imported_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavCategoryView {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: String,
    pub sort_order: i32,
    pub count: usize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavWorkspace {
    pub config_path: String,
    pub total_bookmarks: usize,
    pub uncategorized_count: usize,
    pub categories: Vec<NavCategoryView>,
    pub bookmarks: Vec<NavBookmarkRecord>,
    pub updated_at: String,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavImportInput {
    pub browser: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavImportResult {
    pub browser: String,
    pub source_paths: Vec<String>,
    pub imported_count: usize,
    pub skipped_count: usize,
    pub duplicate_count: usize,
    pub total_bookmarks: usize,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavAiOptions {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavAiOrganizeInput {
    pub ai_options: NavAiOptions,
    pub mode: Option<String>,
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavAiOrganizeResult {
    pub processed_count: usize,
    pub categorized_count: usize,
    pub created_category_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NavAiProgressEvent {
    request_id: String,
    status: String,
    processed: usize,
    total: usize,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavAddBookmarkInput {
    pub title: String,
    pub url: String,
    pub note: Option<String>,
    pub category_id: Option<String>,
    pub auto_classify: Option<bool>,
    pub ai_options: Option<NavAiOptions>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavUpdateBookmarkInput {
    pub id: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub note: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavUpsertCategoryInput {
    pub id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
struct NavImportedBookmark {
    title: String,
    url: String,
    source: String,
    folder_path: String,
}

#[derive(Debug, Clone)]
struct NavClassifyInputItem {
    index: usize,
    title: String,
    url: String,
    note: String,
}

#[derive(Debug, Clone, Deserialize)]
struct NavAiResponse {
    items: Vec<NavAiClassifiedItem>,
}

#[derive(Debug, Clone, Deserialize)]
struct NavAiClassifiedItem {
    index: usize,
    category: String,
}

fn nav_root_dir() -> PathBuf {
    catalog::otools_root_dir().join("nav")
}

fn nav_workspace_path() -> PathBuf {
    nav_root_dir().join("workspace.json")
}

fn now_text() -> String {
    Local::now().to_rfc3339()
}

fn default_category_colors() -> &'static [&'static str] {
    &[
        "#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#14b8a6", "#eab308", "#6366f1",
        "#84cc16", "#ec4899", "#06b6d4", "#8b5cf6", "#f59e0b",
    ]
}

fn normalize_text(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_title(value: &str, fallback: &str) -> String {
    let normalized = normalize_text(value);
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized
    }
}

fn normalize_url(value: &str) -> String {
    let raw = value.trim();
    if raw.is_empty() {
        return String::new();
    }

    let mut normalized = raw.replace(' ', "");
    if !normalized.contains("://") {
        normalized = format!("https://{}", normalized);
    }
    normalized
}

fn extract_domain(url: &str) -> String {
    let lower = url.trim();
    if lower.is_empty() {
        return String::new();
    }

    let without_scheme = lower
        .split_once("://")
        .map(|(_, right)| right)
        .unwrap_or(lower);
    let host_port = without_scheme.split('/').next().unwrap_or_default().trim();

    let host_only = if let Some(stripped) = host_port.strip_prefix('[') {
        stripped.split(']').next().unwrap_or_default().trim()
    } else {
        host_port.split(':').next().unwrap_or_default().trim()
    };

    host_only.to_ascii_lowercase()
}

fn normalize_category_name(value: &str) -> String {
    let normalized = value.trim().replace('\n', " ").replace('\t', " ");
    if normalized.is_empty() {
        NAV_CATEGORY_UNCLASSIFIED.to_string()
    } else {
        normalized
    }
}

fn ensure_nav_root_dir() -> Result<(), String> {
    let root = nav_root_dir();
    if root.exists() {
        return Ok(());
    }
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "创建导航配置目录失败: {} ({})",
            root.to_string_lossy(),
            error
        )
    })
}

fn load_nav_workspace() -> Result<NavWorkspaceFile, String> {
    ensure_nav_root_dir()?;
    let path = nav_workspace_path();
    if !path.exists() {
        return Ok(NavWorkspaceFile::default());
    }
    catalog::read_json_file::<NavWorkspaceFile>(&path).map_err(|error| error.to_string())
}

fn save_nav_workspace(workspace: &NavWorkspaceFile) -> Result<(), String> {
    ensure_nav_root_dir()?;
    catalog::write_json_file(&nav_workspace_path(), workspace).map_err(|error| error.to_string())
}

fn next_category_color(index: usize) -> String {
    let colors = default_category_colors();
    colors[index % colors.len()].to_string()
}

fn ensure_category_exists(
    workspace: &mut NavWorkspaceFile,
    category_name: &str,
    generated_count: &mut usize,
) -> String {
    let normalized_name = normalize_category_name(category_name);
    if let Some(found) = workspace
        .categories
        .iter()
        .find(|item| item.name == normalized_name)
    {
        return found.id.clone();
    }

    let now = now_text();
    let color = next_category_color(workspace.categories.len());
    let record = NavCategoryRecord {
        id: Uuid::new_v4().to_string(),
        name: normalized_name,
        color,
        description: String::new(),
        sort_order: workspace.categories.len() as i32,
        created_at: now.clone(),
        updated_at: now,
    };
    let id = record.id.clone();
    workspace.categories.push(record);
    *generated_count += 1;
    id
}

fn build_workspace_view(workspace: NavWorkspaceFile, note: Option<String>) -> NavWorkspace {
    let mut count_map: HashMap<String, usize> = HashMap::new();
    for bookmark in &workspace.bookmarks {
        let key = bookmark.category_id.trim().to_string();
        if key.is_empty() {
            continue;
        }
        *count_map.entry(key).or_insert(0) += 1;
    }

    let mut categories = workspace
        .categories
        .iter()
        .map(|item| NavCategoryView {
            id: item.id.clone(),
            name: item.name.clone(),
            color: item.color.clone(),
            description: item.description.clone(),
            sort_order: item.sort_order,
            count: *count_map.get(item.id.as_str()).unwrap_or(&0),
            created_at: item.created_at.clone(),
            updated_at: item.updated_at.clone(),
        })
        .collect::<Vec<NavCategoryView>>();

    categories.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.name.cmp(&b.name))
    });

    let uncategorized_count = workspace
        .bookmarks
        .iter()
        .filter(|item| item.category_id.trim().is_empty())
        .count();

    let mut bookmarks = workspace.bookmarks;
    bookmarks.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.title.cmp(&b.title))
            .then_with(|| a.url.cmp(&b.url))
    });

    NavWorkspace {
        config_path: nav_workspace_path().to_string_lossy().to_string(),
        total_bookmarks: bookmarks.len(),
        uncategorized_count,
        categories,
        bookmarks,
        updated_at: workspace.updated_at,
        note: note.unwrap_or_default(),
    }
}

#[allow(unreachable_code)]
fn candidate_browser_roots(browser: &str) -> Vec<PathBuf> {
    let lower = browser.trim().to_ascii_lowercase();

    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        if lower == "edge" {
            return vec![home
                .join("Library/Application Support/Microsoft Edge")
                .to_path_buf()];
        }
        return vec![home
            .join("Library/Application Support/Google/Chrome")
            .to_path_buf()];
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let base = PathBuf::from(local_app_data);
            if lower == "edge" {
                return vec![base.join("Microsoft/Edge/User Data")];
            }
            return vec![base.join("Google/Chrome/User Data")];
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        if lower == "edge" {
            return vec![home.join(".config/microsoft-edge")];
        }
        return vec![
            home.join(".config/google-chrome"),
            home.join(".config/chromium"),
        ];
    }

    vec![]
}

fn resolve_bookmark_paths(browser: &str) -> Vec<PathBuf> {
    let mut paths = Vec::<PathBuf>::new();
    for root in candidate_browser_roots(browser) {
        if !root.exists() || !root.is_dir() {
            continue;
        }

        let mut profile_dirs = Vec::<PathBuf>::new();
        profile_dirs.push(root.join("Default"));

        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Profile ") {
                    profile_dirs.push(path);
                }
            }
        }

        for dir in profile_dirs {
            let candidate = dir.join("Bookmarks");
            if candidate.exists() && candidate.is_file() {
                paths.push(candidate);
            }
        }
    }

    let mut uniq = HashSet::<String>::new();
    paths
        .into_iter()
        .filter(|item| uniq.insert(item.to_string_lossy().to_string()))
        .collect()
}

fn parse_bookmarks_from_file(
    path: &Path,
    source: &str,
) -> Result<Vec<NavImportedBookmark>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("读取收藏夹文件失败({}): {}", path.to_string_lossy(), error))?;
    let value = serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("解析收藏夹文件失败({}): {}", path.to_string_lossy(), error))?;

    let mut items = Vec::<NavImportedBookmark>::new();
    if let Some(roots) = value.get("roots") {
        if let Some(obj) = roots.as_object() {
            for (root_name, node) in obj {
                let mut folder_stack = vec![root_name.to_string()];
                collect_bookmark_nodes(node, &mut folder_stack, source, &mut items);
            }
        }
    }
    Ok(items)
}

fn collect_bookmark_nodes(
    node: &Value,
    folder_stack: &mut Vec<String>,
    source: &str,
    output: &mut Vec<NavImportedBookmark>,
) {
    let node_type = node
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();

    let name = node
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();

    if node_type == "url" {
        let url = node
            .get("url")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        let normalized_url = normalize_url(&url);
        if normalized_url.is_empty() {
            return;
        }

        let title = normalize_title(&name, extract_domain(&normalized_url).as_str());
        let folder_path = folder_stack
            .iter()
            .filter(|item| !item.trim().is_empty())
            .cloned()
            .collect::<Vec<String>>()
            .join("/");

        output.push(NavImportedBookmark {
            title,
            url: normalized_url,
            source: source.to_string(),
            folder_path,
        });
        return;
    }

    let mut pushed = false;
    if !name.trim().is_empty() {
        folder_stack.push(name);
        pushed = true;
    }

    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_bookmark_nodes(child, folder_stack, source, output);
        }
    }

    if pushed {
        let _ = folder_stack.pop();
    }
}

fn heuristic_classify_category(title: &str, url: &str) -> String {
    let text = format!(
        "{} {}",
        title.to_ascii_lowercase(),
        url.to_ascii_lowercase()
    );

    let matches = |keys: &[&str]| keys.iter().any(|key| text.contains(key));

    if matches(&[
        "github",
        "gitlab",
        "bitbucket",
        "npm",
        "pnpm",
        "rust",
        "python",
        "java",
        "golang",
        "docker",
        "kubernetes",
        "stackoverflow",
        "掘金",
        "开发",
        "api",
        "docs",
    ]) {
        return "开发技术".to_string();
    }

    if matches(&["figma", "dribbble", "behance", "设计", "ui", "ux", "icon"]) {
        return "设计创意".to_string();
    }

    if matches(&[
        "aws",
        "aliyun",
        "tencent",
        "cloudflare",
        "vercel",
        "server",
        "运维",
    ]) {
        return "云服务运维".to_string();
    }

    if matches(&["知乎", "wiki", "教程", "文档", "course", "learn", "blog"]) {
        return "学习文档".to_string();
    }

    if matches(&["news", "新浪", "腾讯新闻", "36kr", "虎嗅", "资讯"]) {
        return "新闻资讯".to_string();
    }

    if matches(&["x.com", "twitter", "weibo", "discord", "telegram", "社交"]) {
        return "社交沟通".to_string();
    }

    if matches(&[
        "youtube", "bilibili", "netflix", "video", "music", "podcast", "娱乐",
    ]) {
        return "视频娱乐".to_string();
    }

    if matches(&["taobao", "jd.com", "amazon", "tmall", "shop", "购物"]) {
        return "购物消费".to_string();
    }

    if matches(&["bank", "finance", "股票", "基金", "coin", "crypto", "理财"]) {
        return "金融理财".to_string();
    }

    if matches(&[
        "tool",
        "convert",
        "translate",
        "map",
        "calendar",
        "效率",
        "工具",
    ]) {
        return "工具效率".to_string();
    }

    NAV_CATEGORY_UNCLASSIFIED.to_string()
}

fn sanitize_ai_json(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end >= start {
                return trimmed[start..=end].to_string();
            }
        }
    }

    trimmed.to_string()
}

async fn request_ai_classification(
    ai_options: &NavAiOptions,
    existing_categories: &[String],
    items: &[NavClassifyInputItem],
) -> Result<HashMap<usize, String>, String> {
    let category_hint = if existing_categories.is_empty() {
        "[]".to_string()
    } else {
        serde_json::to_string(existing_categories).unwrap_or_else(|_| "[]".to_string())
    };

    let item_lines = items
        .iter()
        .map(|item| {
            format!(
                "{{\"index\":{},\"title\":\"{}\",\"url\":\"{}\",\"note\":\"{}\"}}",
                item.index,
                item.title.replace('"', "'"),
                item.url.replace('"', "'"),
                item.note.replace('"', "'")
            )
        })
        .collect::<Vec<String>>()
        .join("\n");

    let system_prompt = "你是书签导航整理助手。\n请根据标题、URL、备注为每个条目分配一个分类。\n输出必须是严格 JSON，禁止 Markdown。\nJSON 结构固定为：{\"items\":[{\"index\":0,\"category\":\"分类名\"}]}。\n分类名要求：2-12 个中文字符，避免过细。";

    let user_prompt = format!(
        "现有分类：{}\n\n请优先复用现有分类；没有合适分类再新建。\n待分类条目：\n{}",
        category_hint, item_lines
    );

    let raw =
        otools_ai::generate_text(otools_ai::OtoolsAiGenerateTextRequest {
            ai_options: otools_ai::OtoolsAiConfigInput {
                provider: ai_options.provider.clone(),
                base_url: ai_options.base_url.clone(),
                api_key: ai_options.api_key.clone(),
                model: Some(ai_options.model.clone()),
            },
            system_prompt: system_prompt.to_string(),
            user_prompt,
            temperature: Some(0.2),
            max_tokens: Some(1800),
        })
        .await
        .map_err(|error| error.to_string())?
        .text;

    let json_text = sanitize_ai_json(&raw);
    let parsed = serde_json::from_str::<NavAiResponse>(&json_text)
        .map_err(|error| format!("解析 AI 分类结果失败: {}", error))?;

    let mut result = HashMap::<usize, String>::new();
    for item in parsed.items {
        let category = normalize_category_name(&item.category);
        if category.trim().is_empty() {
            continue;
        }
        result.insert(item.index, category);
    }

    if result.is_empty() {
        return Err("AI 未返回可用分类结果".to_string());
    }
    Ok(result)
}

async fn classify_chunk_with_ai(
    ai_options: &NavAiOptions,
    existing_categories: &[String],
    items: &[NavClassifyInputItem],
) -> Result<HashMap<usize, String>, String> {
    if ai_options.model.trim().is_empty() {
        return Err("AI 模型不能为空".to_string());
    }
    request_ai_classification(ai_options, existing_categories, items).await
}

fn emit_ai_progress(
    request_id: Option<&str>,
    status: &str,
    processed: usize,
    total: usize,
    message: &str,
) {
    let Some(rid) = request_id else {
        return;
    };

    let _payload = NavAiProgressEvent {
        request_id: rid.to_string(),
        status: status.to_string(),
        processed,
        total,
        message: message.to_string(),
    };
}

fn ensure_workspace_category_consistency(workspace: &mut NavWorkspaceFile) {
    let category_ids = workspace
        .categories
        .iter()
        .map(|item| item.id.clone())
        .collect::<HashSet<String>>();
    for bookmark in &mut workspace.bookmarks {
        if bookmark.category_id.trim().is_empty() {
            continue;
        }
        if category_ids.contains(&bookmark.category_id) {
            continue;
        }
        bookmark.category_id = String::new();
    }
}

fn resolve_category_id_from_name(workspace: &NavWorkspaceFile, name: &str) -> Option<String> {
    let normalized = normalize_category_name(name);
    workspace
        .categories
        .iter()
        .find(|item| item.name == normalized)
        .map(|item| item.id.clone())
}

fn ensure_valid_category_id(workspace: &NavWorkspaceFile, category_id: &str) -> String {
    let normalized = category_id.trim();
    if normalized.is_empty() {
        return String::new();
    }
    if workspace
        .categories
        .iter()
        .any(|item| item.id == normalized)
    {
        return normalized.to_string();
    }
    String::new()
}

pub fn nav_get_workspace() -> Result<NavWorkspace, String> {
    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);
    Ok(build_workspace_view(workspace, None))
}

pub fn nav_import_local_bookmarks(input: NavImportInput) -> Result<NavImportResult, String> {
    let browser = input.browser.trim().to_ascii_lowercase();
    if browser != "chrome" && browser != "edge" {
        return Err("browser 仅支持 chrome / edge".to_string());
    }

    let mut source_paths = Vec::<PathBuf>::new();
    if let Some(raw_path) = input.file_path.as_deref().map(str::trim) {
        if !raw_path.is_empty() {
            source_paths.push(PathBuf::from(raw_path));
        }
    }
    if source_paths.is_empty() {
        source_paths = resolve_bookmark_paths(&browser);
    }

    if source_paths.is_empty() {
        return Err(format!(
            "未找到 {} 收藏夹文件，请确认已安装并使用过该浏览器",
            browser
        ));
    }

    let source_text = if browser == "edge" { "Edge" } else { "Chrome" };

    let mut parsed_items = Vec::<NavImportedBookmark>::new();
    let mut failed_paths = Vec::<String>::new();
    for path in &source_paths {
        match parse_bookmarks_from_file(path, source_text) {
            Ok(mut rows) => parsed_items.append(&mut rows),
            Err(_) => failed_paths.push(path.to_string_lossy().to_string()),
        }
    }

    if parsed_items.is_empty() {
        if failed_paths.is_empty() {
            return Err("收藏夹文件中没有可导入的网址".to_string());
        }
        return Err(format!("收藏夹解析失败: {}", failed_paths.join("; ")));
    }

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    let now = now_text();
    let mut existing_keys = workspace
        .bookmarks
        .iter()
        .map(|item| item.url.trim().to_ascii_lowercase())
        .collect::<HashSet<String>>();

    let mut import_dedup_set = HashSet::<String>::new();
    let mut imported_count = 0usize;
    let mut skipped_count = 0usize;
    let mut duplicate_count = 0usize;

    for row in parsed_items {
        let url_key = row.url.trim().to_ascii_lowercase();
        if url_key.is_empty() {
            skipped_count += 1;
            continue;
        }
        if !import_dedup_set.insert(url_key.clone()) {
            duplicate_count += 1;
            continue;
        }
        if existing_keys.contains(&url_key) {
            duplicate_count += 1;
            continue;
        }

        let domain = extract_domain(&row.url);
        let bookmark = NavBookmarkRecord {
            id: Uuid::new_v4().to_string(),
            title: normalize_title(&row.title, domain.as_str()),
            url: row.url,
            domain,
            source: row.source,
            folder_path: row.folder_path,
            note: String::new(),
            category_id: String::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        workspace.bookmarks.push(bookmark);
        existing_keys.insert(url_key);
        imported_count += 1;
    }

    workspace.updated_at = now.clone();
    workspace.last_imported_at = now;
    save_nav_workspace(&workspace)?;

    let total_bookmarks = workspace.bookmarks.len();
    let source_paths_text = source_paths
        .iter()
        .map(|item| item.to_string_lossy().to_string())
        .collect::<Vec<String>>();

    let message = format!(
        "导入完成：新增 {} 条，重复 {} 条，跳过 {} 条",
        imported_count, duplicate_count, skipped_count
    );

    Ok(NavImportResult {
        browser,
        source_paths: source_paths_text,
        imported_count,
        skipped_count,
        duplicate_count,
        total_bookmarks,
        message,
    })
}

pub async fn nav_ai_organize_bookmarks(
    input: NavAiOrganizeInput,
) -> Result<NavAiOrganizeResult, String> {
    if input.ai_options.model.trim().is_empty() {
        return Err("AI 模型不能为空".to_string());
    }

    let mode = input
        .mode
        .as_deref()
        .unwrap_or("uncategorized")
        .trim()
        .to_ascii_lowercase();

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);
    if workspace.bookmarks.is_empty() {
        return Ok(NavAiOrganizeResult {
            processed_count: 0,
            categorized_count: 0,
            created_category_count: 0,
            message: "暂无可分类网址".to_string(),
        });
    }

    let mut target_indices = Vec::<usize>::new();
    for (idx, item) in workspace.bookmarks.iter().enumerate() {
        let include = if mode == "all" {
            true
        } else {
            item.category_id.trim().is_empty()
        };
        if include {
            target_indices.push(idx);
        }
    }

    if target_indices.is_empty() {
        return Ok(NavAiOrganizeResult {
            processed_count: 0,
            categorized_count: 0,
            created_category_count: 0,
            message: "当前无需重新分类".to_string(),
        });
    }

    let mut existing_category_names = workspace
        .categories
        .iter()
        .map(|item| item.name.clone())
        .collect::<Vec<String>>();
    existing_category_names.sort();
    existing_category_names.dedup();

    let total = target_indices.len();
    let batch_size = 80usize;
    let mut processed = 0usize;
    let mut categorized = 0usize;
    let mut created_category_count = 0usize;

    emit_ai_progress(
        input.request_id.as_deref(),
        "started",
        processed,
        total,
        "开始 AI 分类整理",
    );

    for chunk in target_indices.chunks(batch_size) {
        let batch = chunk
            .iter()
            .filter_map(|index| {
                workspace
                    .bookmarks
                    .get(*index)
                    .map(|item| NavClassifyInputItem {
                        index: *index,
                        title: item.title.clone(),
                        url: item.url.clone(),
                        note: item.note.clone(),
                    })
            })
            .collect::<Vec<NavClassifyInputItem>>();

        let classify_result =
            classify_chunk_with_ai(&input.ai_options, &existing_category_names, &batch).await;

        let mut category_mapping = HashMap::<usize, String>::new();
        match classify_result {
            Ok(map) => {
                category_mapping = map;
            }
            Err(_) => {
                for item in &batch {
                    category_mapping.insert(
                        item.index,
                        heuristic_classify_category(&item.title, &item.url),
                    );
                }
            }
        }

        for (index, category_name) in category_mapping {
            if index >= workspace.bookmarks.len() {
                continue;
            }

            let category_id =
                if let Some(found_id) = resolve_category_id_from_name(&workspace, &category_name) {
                    found_id
                } else {
                    let created_id = ensure_category_exists(
                        &mut workspace,
                        &category_name,
                        &mut created_category_count,
                    );
                    if let Some(new_name) = workspace
                        .categories
                        .iter()
                        .find(|item| item.id == created_id)
                        .map(|item| item.name.clone())
                    {
                        existing_category_names.push(new_name);
                        existing_category_names.sort();
                        existing_category_names.dedup();
                    }
                    created_id
                };

            if let Some(item) = workspace.bookmarks.get_mut(index) {
                if item.category_id != category_id {
                    item.category_id = category_id;
                    item.updated_at = now_text();
                    categorized += 1;
                }
            }
        }

        processed = (processed + batch.len()).min(total);
        emit_ai_progress(
            input.request_id.as_deref(),
            "progress",
            processed,
            total,
            "AI 分类处理中",
        );
    }

    workspace.updated_at = now_text();
    save_nav_workspace(&workspace)?;

    emit_ai_progress(
        input.request_id.as_deref(),
        "completed",
        total,
        total,
        "AI 分类整理完成",
    );

    Ok(NavAiOrganizeResult {
        processed_count: total,
        categorized_count: categorized,
        created_category_count,
        message: format!(
            "AI 分类完成：处理 {} 条，归类 {} 条，新建 {} 个分类",
            total, categorized, created_category_count
        ),
    })
}

pub async fn nav_add_bookmark(input: NavAddBookmarkInput) -> Result<NavBookmarkRecord, String> {
    let title = normalize_title(&input.title, "未命名网址");
    let url = normalize_url(&input.url);
    if url.trim().is_empty() {
        return Err("网址不能为空".to_string());
    }

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    let url_key = url.trim().to_ascii_lowercase();
    if workspace
        .bookmarks
        .iter()
        .any(|item| item.url.trim().to_ascii_lowercase() == url_key)
    {
        return Err("该网址已存在".to_string());
    }

    let mut generated_count = 0usize;
    let mut category_id =
        ensure_valid_category_id(&workspace, input.category_id.as_deref().unwrap_or_default());

    if category_id.is_empty() && input.auto_classify.unwrap_or(false) {
        let category_name = if let Some(ai_options) = &input.ai_options {
            if ai_options.model.trim().is_empty() {
                heuristic_classify_category(&title, &url)
            } else {
                let temporary = NavClassifyInputItem {
                    index: 0usize,
                    title: title.clone(),
                    url: url.clone(),
                    note: input.note.clone().unwrap_or_default(),
                };

                let existing_categories = workspace
                    .categories
                    .iter()
                    .map(|item| item.name.clone())
                    .collect::<Vec<String>>();
                let pairs = vec![temporary];
                match classify_chunk_with_ai(ai_options, &existing_categories, &pairs).await {
                    Ok(map) => map
                        .get(&0usize)
                        .cloned()
                        .unwrap_or_else(|| heuristic_classify_category(&title, &url)),
                    Err(_) => heuristic_classify_category(&title, &url),
                }
            }
        } else {
            heuristic_classify_category(&title, &url)
        };
        category_id = ensure_category_exists(&mut workspace, &category_name, &mut generated_count);
    }

    let now = now_text();
    let domain = extract_domain(&url);
    let bookmark = NavBookmarkRecord {
        id: Uuid::new_v4().to_string(),
        title,
        url,
        domain,
        source: "manual".to_string(),
        folder_path: "手动新增".to_string(),
        note: normalize_text(input.note.as_deref().unwrap_or_default()),
        category_id,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    workspace.bookmarks.push(bookmark.clone());
    workspace.updated_at = now;

    if generated_count > 0 {
        workspace.updated_at = now_text();
    }

    save_nav_workspace(&workspace)?;
    Ok(bookmark)
}

pub fn nav_update_bookmark(input: NavUpdateBookmarkInput) -> Result<NavBookmarkRecord, String> {
    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    let target_id = input.id.trim();
    if target_id.is_empty() {
        return Err("id 不能为空".to_string());
    }

    let category_id = input
        .category_id
        .as_deref()
        .map(|value| ensure_valid_category_id(&workspace, value));

    let Some(bookmark) = workspace
        .bookmarks
        .iter_mut()
        .find(|item| item.id == target_id)
    else {
        return Err(format!("未找到书签: {}", target_id));
    };

    if let Some(title) = input.title {
        bookmark.title = normalize_title(&title, bookmark.title.as_str());
    }

    if let Some(url) = input.url {
        let normalized = normalize_url(&url);
        if normalized.trim().is_empty() {
            return Err("网址不能为空".to_string());
        }
        bookmark.url = normalized;
        bookmark.domain = extract_domain(&bookmark.url);
    }

    if let Some(note) = input.note {
        bookmark.note = normalize_text(&note);
    }

    if let Some(next_category_id) = category_id {
        bookmark.category_id = next_category_id;
    }

    bookmark.updated_at = now_text();
    workspace.updated_at = bookmark.updated_at.clone();
    let updated = bookmark.clone();

    save_nav_workspace(&workspace)?;
    Ok(updated)
}

pub fn nav_delete_bookmark(id: String) -> Result<(), String> {
    let target = id.trim();
    if target.is_empty() {
        return Err("id 不能为空".to_string());
    }

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    let before = workspace.bookmarks.len();
    workspace.bookmarks.retain(|item| item.id != target);
    if workspace.bookmarks.len() == before {
        return Err(format!("未找到书签: {}", target));
    }

    workspace.updated_at = now_text();
    save_nav_workspace(&workspace)
}

pub fn nav_upsert_category(input: NavUpsertCategoryInput) -> Result<NavCategoryRecord, String> {
    let name = normalize_category_name(&input.name);
    if name == NAV_CATEGORY_UNCLASSIFIED {
        return Err("分类名称不能为空".to_string());
    }

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    if workspace
        .categories
        .iter()
        .any(|item| item.name == name && input.id.as_deref().unwrap_or_default() != item.id)
    {
        return Err("分类名称已存在".to_string());
    }

    let color = input
        .color
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            default_category_colors()[workspace.categories.len() % default_category_colors().len()]
        })
        .to_string();
    let description = normalize_text(input.description.as_deref().unwrap_or_default());

    let now = now_text();
    if let Some(id) = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let Some(record) = workspace.categories.iter_mut().find(|item| item.id == id) else {
            return Err(format!("未找到分类: {}", id));
        };
        record.name = name;
        record.color = color;
        record.description = description;
        record.updated_at = now.clone();
        workspace.updated_at = now;
        let updated = record.clone();
        save_nav_workspace(&workspace)?;
        return Ok(updated);
    }

    let created = NavCategoryRecord {
        id: Uuid::new_v4().to_string(),
        name,
        color,
        description,
        sort_order: workspace.categories.len() as i32,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    workspace.categories.push(created.clone());
    workspace.updated_at = now;
    save_nav_workspace(&workspace)?;
    Ok(created)
}

pub fn nav_delete_category(id: String) -> Result<(), String> {
    let target = id.trim();
    if target.is_empty() {
        return Err("id 不能为空".to_string());
    }

    let mut workspace = load_nav_workspace()?;
    ensure_workspace_category_consistency(&mut workspace);

    let before = workspace.categories.len();
    workspace.categories.retain(|item| item.id != target);
    if workspace.categories.len() == before {
        return Err(format!("未找到分类: {}", target));
    }

    for bookmark in &mut workspace.bookmarks {
        if bookmark.category_id == target {
            bookmark.category_id = String::new();
            bookmark.updated_at = now_text();
        }
    }

    for (idx, category) in workspace.categories.iter_mut().enumerate() {
        category.sort_order = idx as i32;
    }

    workspace.updated_at = now_text();
    save_nav_workspace(&workspace)
}

pub fn supports_plugin(plugin_uuid: &str) -> bool {
    matches!(
        plugin_uuid.trim().to_ascii_lowercase().as_str(),
        "otools-nav" | "nav"
    )
}

pub async fn dispatch_command(command: &str, payload: Value) -> Result<Value, HostError> {
    match command {
        "nav_get_workspace" => command_result(nav_get_workspace().map_err(nav_error)?),
        "nav_import_local_bookmarks" => {
            let params = command_payload::<InputParam<NavImportInput>>(payload)?;
            command_result(nav_import_local_bookmarks(params.input).map_err(nav_error)?)
        }
        "nav_ai_organize_bookmarks" => {
            let params = command_payload::<InputParam<NavAiOrganizeInput>>(payload)?;
            command_result(nav_ai_organize_bookmarks(params.input).await.map_err(nav_error)?)
        }
        "nav_add_bookmark" => {
            let params = command_payload::<InputParam<NavAddBookmarkInput>>(payload)?;
            command_result(nav_add_bookmark(params.input).await.map_err(nav_error)?)
        }
        "nav_update_bookmark" => {
            let params = command_payload::<InputParam<NavUpdateBookmarkInput>>(payload)?;
            command_result(nav_update_bookmark(params.input).map_err(nav_error)?)
        }
        "nav_delete_bookmark" => {
            let params = command_payload::<IdParam>(payload)?;
            nav_delete_bookmark(params.id).map_err(nav_error)?;
            Ok(Value::Null)
        }
        "nav_upsert_category" => {
            let params = command_payload::<InputParam<NavUpsertCategoryInput>>(payload)?;
            command_result(nav_upsert_category(params.input).map_err(nav_error)?)
        }
        "nav_delete_category" => {
            let params = command_payload::<IdParam>(payload)?;
            nav_delete_category(params.id).map_err(nav_error)?;
            Ok(Value::Null)
        }
        _ => Err(HostError::not_found(format!(
            "Unsupported otools-nav command: {command}"
        ))),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputParam<T> {
    input: T,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdParam {
    id: String,
}

fn command_payload<T: DeserializeOwned>(payload: Value) -> Result<T, HostError> {
    let payload = if payload.is_null() {
        Value::Object(serde_json::Map::new())
    } else {
        payload
    };
    serde_json::from_value(payload).map_err(|error| {
        HostError::invalid_input("Invalid plugin command payload").with_detail(error.to_string())
    })
}

fn command_result<T: Serialize>(value: T) -> Result<Value, HostError> {
    serde_json::to_value(value).map_err(|error| {
        HostError::task_execution_failed("Failed to serialize plugin command result")
            .with_detail(error.to_string())
    })
}

fn nav_error(message: String) -> HostError {
    HostError::task_execution_failed(message)
}

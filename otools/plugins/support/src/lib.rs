use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub fn normalize_plugin_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn normalize_plugin_identity(uuid: &str, packid: &str) -> String {
    let value = uuid.trim();
    if value.is_empty() {
        normalize_plugin_id(packid)
    } else {
        normalize_plugin_id(value)
    }
}

pub fn sanitize_plugin_packid(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter_map(|item| {
            if item.is_ascii_alphanumeric() {
                Some(item.to_ascii_lowercase())
            } else if matches!(item, '-' | '_' | '.') {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn sanitize_plugin_packid_or(raw: &str, fallback: &str) -> String {
    let normalized = sanitize_plugin_packid(raw);
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized
    }
}

pub fn package_name_from_pack_id(packid: &str, fallback: &str) -> String {
    sanitize_plugin_packid_or(packid, fallback)
}

pub fn collect_plugin_dir_candidates(
    base_dir: &Path,
    values: &[&str],
    fallback: &str,
) -> Vec<PathBuf> {
    let mut seen = HashSet::<String>::new();
    let mut paths = Vec::<PathBuf>::new();
    for value in values {
        if value.trim().is_empty() {
            continue;
        }
        let normalized = sanitize_plugin_packid_or(value, fallback);
        if seen.insert(normalized.clone()) {
            paths.push(base_dir.join(normalized));
        }
    }
    paths
}

pub fn collect_workspace_plugin_dirs(
    explicit_dirs: &[PathBuf],
    roots: &[PathBuf],
    builtin_root: &Path,
) -> Vec<PathBuf> {
    let mut output = Vec::<PathBuf>::new();
    let mut seen = HashSet::<String>::new();
    for path in explicit_dirs {
        push_unique_existing_dir(&mut output, &mut seen, path.clone(), builtin_root);
    }
    for root in roots {
        for ancestor in root.ancestors() {
            push_unique_existing_dir(
                &mut output,
                &mut seen,
                ancestor.join("plugins"),
                builtin_root,
            );
        }
    }
    output
}

fn push_unique_existing_dir(
    output: &mut Vec<PathBuf>,
    seen: &mut HashSet<String>,
    path: PathBuf,
    builtin_root: &Path,
) {
    if !path.exists() || !path.is_dir() || same_existing_dir(&path, builtin_root) {
        return;
    }
    let canonical = fs::canonicalize(&path).unwrap_or(path);
    let key = canonical.to_string_lossy().to_ascii_lowercase();
    if seen.insert(key) {
        output.push(canonical);
    }
}

fn same_existing_dir(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_pack_ids_for_file_names() {
        assert_eq!(sanitize_plugin_packid(" Sample.Plugin_id "), "sample-plugin-id");
        assert_eq!(sanitize_plugin_packid("!!!"), "");
        assert_eq!(sanitize_plugin_packid_or("!!!", "fallback"), "fallback");
    }

    #[test]
    fn collects_deduped_install_candidates() {
        let root = PathBuf::from("plugins");
        let candidates = collect_plugin_dir_candidates(
            &root,
            &["sample.plugin", "sample_plugin", " ", "SAMPLE-PLUGIN"],
            "offline-plugin",
        );
        assert_eq!(candidates, vec![root.join("sample-plugin")]);
    }

    #[test]
    fn collects_workspace_plugin_dirs_without_builtin_or_duplicates() {
        let root = std::env::temp_dir().join(format!(
            "otools-plugin-support-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        let workspace_plugins = root.join("workspace/plugins");
        let explicit_plugins = root.join("explicit");
        let builtin_plugins = root.join("builtin");
        fs::create_dir_all(&workspace_plugins).expect("create workspace plugins");
        fs::create_dir_all(&explicit_plugins).expect("create explicit plugins");
        fs::create_dir_all(&builtin_plugins).expect("create builtin plugins");

        let dirs = collect_workspace_plugin_dirs(
            &[
                explicit_plugins.clone(),
                explicit_plugins.clone(),
                builtin_plugins.clone(),
            ],
            &[root.join("workspace/project")],
            &builtin_plugins,
        );

        assert_eq!(dirs.len(), 2);
        assert!(dirs.contains(&fs::canonicalize(&explicit_plugins).expect("canonical explicit")));
        assert!(dirs.contains(&fs::canonicalize(&workspace_plugins).expect("canonical workspace")));
        assert!(!dirs.contains(&fs::canonicalize(&builtin_plugins).expect("canonical builtin")));
        fs::remove_dir_all(root).ok();
    }
}

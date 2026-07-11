use std::path::{Path, PathBuf};

pub fn native_platform_lib_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macOS.dylib"
    }
    #[cfg(target_os = "windows")]
    {
        "Windows.dll"
    }
    #[cfg(target_os = "linux")]
    {
        "Linux.so"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "native.so"
    }
}

pub fn native_build_artifact_path(native_dir: &Path, lib_basename: &str) -> PathBuf {
    let release_dir = native_dir.join("target").join("release");
    if cfg!(target_os = "windows") {
        release_dir.join(format!("{lib_basename}.dll"))
    } else if cfg!(target_os = "macos") {
        release_dir.join(format!("lib{lib_basename}.dylib"))
    } else {
        release_dir.join(format!("lib{lib_basename}.so"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_platform_lib_name_matches_host_platform() {
        let name = native_platform_lib_name();
        if cfg!(target_os = "windows") {
            assert_eq!(name, "Windows.dll");
        } else if cfg!(target_os = "macos") {
            assert_eq!(name, "macOS.dylib");
        } else if cfg!(target_os = "linux") {
            assert_eq!(name, "Linux.so");
        } else {
            assert_eq!(name, "native.so");
        }
    }

    #[test]
    fn native_build_artifact_path_uses_platform_filename() {
        let path = native_build_artifact_path(Path::new("native"), "sample_tool_native");
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap();
        if cfg!(target_os = "windows") {
            assert_eq!(file_name, "sample_tool_native.dll");
        } else if cfg!(target_os = "macos") {
            assert_eq!(file_name, "libsample_tool_native.dylib");
        } else {
            assert_eq!(file_name, "libsample_tool_native.so");
        }
    }
}

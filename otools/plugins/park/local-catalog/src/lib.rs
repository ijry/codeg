use std::path::{Path, PathBuf};

use otools_core::catalog;
use otools_core::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const PARK_PLUGIN_MARKET_FILE_VERSION: u64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkLocalCatalogFile {
    version: u64,
    items: Vec<Value>,
}

pub fn park_local_catalog_path() -> PathBuf {
    catalog::park_root_dir().join("local_catalog.json")
}

pub fn read_local_park_catalog(path: &Path) -> Result<Vec<Value>, HostError> {
    if !path.exists() {
        catalog::write_json_file(
            path,
            &ParkLocalCatalogFile {
                version: PARK_PLUGIN_MARKET_FILE_VERSION,
                items: Vec::new(),
            },
        )?;
    }
    let value = catalog::read_json_file::<Value>(path)?;
    match value {
        Value::Object(_) => serde_json::from_value::<ParkLocalCatalogFile>(value)
            .map(|file| file.items)
            .map_err(|error| {
                HostError::configuration_invalid("Invalid OTools Park local catalog")
                    .with_detail(format!("{}: {error}", path.display()))
            }),
        Value::Array(array) => Ok(array),
        _ => Ok(Vec::new()),
    }
}

pub fn write_local_park_catalog(path: &Path, items: &[Value]) -> Result<(), HostError> {
    catalog::write_json_file(
        path,
        &ParkLocalCatalogFile {
            version: PARK_PLUGIN_MARKET_FILE_VERSION,
            items: items.to_vec(),
        },
    )
}

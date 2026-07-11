use std::collections::HashMap;

use otools_core::{HostError, HostErrorCode};
use otools_plugin_park_catalog::{
    normalize_catalog_item_identity, remote_to_catalog_item, should_replace_remote_item,
    ParkCatalogItem, ParkCategory, ParkRemoteCatalogItem,
};
use serde::{Deserialize, Serialize};

const PARK_REMOTE_LIST_API: &str = "https://otools-api.lingyun.net/api/v1/otools/plugin/lists";
const PARK_REMOTE_CATEGORIES: [(&str, &str); 4] = [
    ("hot", "热门"),
    ("latest", "最新"),
    ("featured", "精选"),
    ("official", "官方"),
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkRemoteListResponse {
    code: i64,
    msg: String,
    data: ParkRemoteListData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ParkRemoteListData {
    data_list: Vec<ParkRemoteCatalogItem>,
}

pub async fn fetch_remote_category_items(
    client: &reqwest::Client,
    cate: &str,
) -> Result<Vec<ParkCatalogItem>, HostError> {
    let response = client
        .get(PARK_REMOTE_LIST_API)
        .query(&[("cate", cate)])
        .send()
        .await
        .map_err(|error| market_error(format!("获取插件市场失败: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        return Err(market_error(format!(
            "获取插件市场失败(cate={cate})，HTTP 状态: {status}"
        )));
    }
    let payload = response
        .json::<ParkRemoteListResponse>()
        .await
        .map_err(|error| market_error(format!("解析插件市场失败: {error}")))?;
    parse_remote_list_payload(payload, cate)
}

pub async fn fetch_remote_items_index(
    client: &reqwest::Client,
) -> Result<HashMap<String, ParkCatalogItem>, HostError> {
    let mut index = HashMap::<String, ParkCatalogItem>::new();
    for (category, _) in PARK_REMOTE_CATEGORIES {
        let items = fetch_remote_category_items(client, category).await?;
        for item in items {
            let normalized_id = normalize_catalog_item_identity(&item.uuid, &item.packid);
            if normalized_id.is_empty() {
                continue;
            }
            match index.get(&normalized_id) {
                Some(current) if !should_replace_remote_item(current, &item) => {}
                _ => {
                    index.insert(normalized_id, item);
                }
            }
        }
    }
    Ok(index)
}

pub async fn build_workspace_categories(
    client: &reqwest::Client,
    requested_cate: &str,
    item_count: usize,
    installed_count: usize,
) -> Vec<ParkCategory> {
    let requested = requested_cate.trim().to_ascii_lowercase();
    let mut categories = Vec::<ParkCategory>::with_capacity(PARK_REMOTE_CATEGORIES.len() + 1);
    for (key, label) in PARK_REMOTE_CATEGORIES {
        let count = if requested == key {
            item_count
        } else {
            fetch_remote_category_items(client, key)
                .await
                .map(|items| items.len())
                .unwrap_or(0)
        };
        categories.push(ParkCategory {
            key: key.to_string(),
            label: label.to_string(),
            count,
        });
    }
    categories.push(ParkCategory {
        key: "installed".to_string(),
        label: "已安装".to_string(),
        count: installed_count,
    });
    categories
}

fn parse_remote_list_payload(
    payload: ParkRemoteListResponse,
    cate: &str,
) -> Result<Vec<ParkCatalogItem>, HostError> {
    if payload.code != 200 {
        let message = payload.msg.trim();
        return Err(market_error(format!(
            "插件市场接口返回异常(cate={cate}){}",
            if message.is_empty() {
                String::new()
            } else {
                format!(": {message}")
            }
        )));
    }
    Ok(payload
        .data
        .data_list
        .into_iter()
        .filter_map(|item| remote_to_catalog_item(item, cate))
        .collect())
}

fn market_error(message: impl Into<String>) -> HostError {
    HostError::new(HostErrorCode::TaskExecutionFailed, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_remote_market_payload() {
        let payload = ParkRemoteListResponse {
            code: 200,
            data: ParkRemoteListData {
                data_list: vec![ParkRemoteCatalogItem {
                    id: "remote-id".into(),
                    packid: "sample".to_string(),
                    display_name: "Sample".to_string(),
                    version: "1.0.0".to_string(),
                    easy_mode: 1.into(),
                    ..ParkRemoteCatalogItem::default()
                }],
            },
            ..ParkRemoteListResponse::default()
        };

        let items = parse_remote_list_payload(payload, "hot").expect("parse remote payload");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].uuid, "remote-id");
        assert_eq!(items[0].packid, "sample");
        assert_eq!(items[0].categories, vec!["hot"]);
        assert!(items[0].installable);
    }

    #[test]
    fn rejects_remote_market_error_payload() {
        let payload = ParkRemoteListResponse {
            code: 500,
            msg: "boom".to_string(),
            ..ParkRemoteListResponse::default()
        };

        let error = parse_remote_list_payload(payload, "hot").expect_err("payload should fail");

        assert!(error.message.contains("boom"));
    }
}

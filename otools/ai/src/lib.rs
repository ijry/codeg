use std::fs;
use std::path::PathBuf;

use async_openai::{
    config::{AzureConfig, OpenAIConfig},
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequest,
        CreateChatCompletionRequestArgs,
    },
    Client,
};
use chrono::Utc;
use otools_core::{catalog, HostError};
pub use otools_plugin_config::OtoolsAiSettings;
use serde::{Deserialize, Serialize};

pub const OTOOLS_GLOBAL_AI_SETTINGS_KEY: &str = "ai_settings";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OtoolsAiConfigInput {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsAiGenerateTextRequest {
    #[serde(flatten)]
    pub ai_options: OtoolsAiConfigInput,
    pub system_prompt: String,
    pub user_prompt: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsAiGenerateTextResult {
    pub text: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OtoolsAiChatMessageRecord {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct OtoolsAiChatHistoryFile {
    pub prefix: String,
    pub updated_at: String,
    pub messages: Vec<OtoolsAiChatMessageRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OtoolsAiChatHistoryStored {
    Messages(Vec<OtoolsAiChatMessageRecord>),
    File(OtoolsAiChatHistoryFile),
}

pub fn normalize_ai_provider_alias(provider: Option<&str>) -> String {
    let normalized = provider.unwrap_or("openai").trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return "openai".to_string();
    }
    match normalized.as_str() {
        "aliyun-bailian" | "dashscope" | "aliyun" | "bailian" => "openai".to_string(),
        _ => normalized,
    }
}

pub async fn load_global_ai_settings() -> Result<OtoolsAiSettings, HostError> {
    let value =
        otools_plugin_config::get_otools_config_value(OTOOLS_GLOBAL_AI_SETTINGS_KEY.to_string())
            .await?;
    let mut merged = match value {
        Some(value) => serde_json::from_value::<OtoolsAiSettings>(value).map_err(|error| {
            HostError::configuration_invalid("Invalid OTools AI settings")
                .with_detail(error.to_string())
        })?,
        None => OtoolsAiSettings::default(),
    };
    let defaults = OtoolsAiSettings::default();

    if merged.provider.trim().is_empty() {
        merged.provider = defaults.provider;
    }
    if merged.base_url.trim().is_empty() {
        merged.base_url = defaults.base_url;
    }
    if merged.model.trim().is_empty() {
        merged.model = defaults.model;
    }

    Ok(merged)
}

pub async fn resolve_ai_settings(
    input: Option<&OtoolsAiConfigInput>,
) -> Result<OtoolsAiSettings, HostError> {
    let mut settings = load_global_ai_settings().await?;

    if let Some(input) = input {
        if let Some(provider) = input
            .provider
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            settings.provider = provider.to_string();
        }
        if let Some(base_url) = input
            .base_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            settings.base_url = base_url.to_string();
        }
        if let Some(model) = input
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            settings.model = model.to_string();
        }
        if let Some(api_key) = input.api_key.as_deref() {
            settings.api_key = api_key.trim().to_string();
        }
    }

    settings.provider = normalize_ai_provider_alias(Some(&settings.provider));
    if settings.model.trim().is_empty() {
        return Err(HostError::invalid_input("AI model is required"));
    }
    if settings.provider == "azure" && settings.base_url.trim().is_empty() {
        return Err(HostError::invalid_input("Azure base URL is required"));
    }

    Ok(settings)
}

pub fn append_ollama_base_url_hint(
    provider: &str,
    base_url: Option<&str>,
    error: String,
) -> String {
    if provider != "ollama" {
        return error;
    }
    let lower = error.to_ascii_lowercase();
    if !lower.contains("404") && !lower.contains("wrappederror") {
        return error;
    }
    let hint_url = base_url.unwrap_or("http://127.0.0.1:11434/v1");
    if let Some(url) = base_url {
        if url.to_ascii_lowercase().contains("/v1") {
            return error;
        }
    }
    format!(
        "{error}. Ollama usually needs an OpenAI-compatible base URL such as {hint_url}"
    )
}

pub async fn generate_text(
    request: OtoolsAiGenerateTextRequest,
) -> Result<OtoolsAiGenerateTextResult, HostError> {
    let settings = resolve_ai_settings(Some(&request.ai_options)).await?;
    let provider = settings.provider.clone();
    let base_url = if settings.base_url.trim().is_empty() {
        None
    } else {
        Some(settings.base_url.as_str())
    };

    let text = if provider == "azure" {
        let config = build_azure_config(&settings)?;
        let client = Client::with_config(config);
        request_text_with_client(
            &client,
            settings.model.trim(),
            request.system_prompt.trim(),
            request.user_prompt.trim(),
            request.temperature,
            request.max_tokens,
        )
        .await?
    } else {
        let config = build_openai_config(&settings);
        let client = Client::with_config(config);
        request_text_with_client(
            &client,
            settings.model.trim(),
            request.system_prompt.trim(),
            request.user_prompt.trim(),
            request.temperature,
            request.max_tokens,
        )
        .await
        .map_err(|error| {
            let mut next = HostError::task_execution_failed(
                append_ollama_base_url_hint(&provider, base_url, error.message.clone()),
            );
            if let Some(detail) = error.detail {
                next = next.with_detail(detail);
            }
            next
        })?
    };

    Ok(OtoolsAiGenerateTextResult {
        text,
        provider,
        model: settings.model.trim().to_string(),
    })
}

pub async fn load_chat_history(
    prefix: String,
) -> Result<Vec<OtoolsAiChatMessageRecord>, HostError> {
    load_chat_history_messages(&prefix)
}

pub async fn save_chat_history(
    prefix: String,
    messages: Vec<OtoolsAiChatMessageRecord>,
) -> Result<(), HostError> {
    let path = resolve_chat_history_path(&prefix)?;
    let payload = OtoolsAiChatHistoryFile {
        prefix: prefix.trim().to_string(),
        updated_at: Utc::now().to_rfc3339(),
        messages: normalize_chat_messages(messages),
    };
    catalog::write_json_file(&path, &payload)
}

fn build_openai_config(settings: &OtoolsAiSettings) -> OpenAIConfig {
    let mut config = OpenAIConfig::new();
    if !settings.base_url.trim().is_empty() {
        config = config.with_api_base(settings.base_url.trim().to_string());
    }
    if !settings.api_key.trim().is_empty() {
        config = config.with_api_key(settings.api_key.trim().to_string());
    }
    config
}

fn build_azure_config(settings: &OtoolsAiSettings) -> Result<AzureConfig, HostError> {
    if settings.base_url.trim().is_empty() {
        return Err(HostError::invalid_input("Azure base URL is required"));
    }
    Ok(AzureConfig::new()
        .with_api_base(settings.base_url.trim().to_string())
        .with_api_key(settings.api_key.trim().to_string()))
}

fn build_messages(
    system_prompt: &str,
    user_prompt: &str,
) -> Result<Vec<ChatCompletionRequestMessage>, HostError> {
    Ok(vec![
        ChatCompletionRequestMessage::System(
            ChatCompletionRequestSystemMessageArgs::default()
                .content(system_prompt)
                .build()
                .map_err(|error| {
                    HostError::invalid_input("Failed to build AI system prompt")
                        .with_detail(error.to_string())
                })?,
        ),
        ChatCompletionRequestMessage::User(
            ChatCompletionRequestUserMessageArgs::default()
                .content(user_prompt)
                .build()
                .map_err(|error| {
                    HostError::invalid_input("Failed to build AI user prompt")
                        .with_detail(error.to_string())
                })?,
        ),
    ])
}

fn build_chat_request(
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: Option<f32>,
    max_tokens: Option<u16>,
) -> Result<CreateChatCompletionRequest, HostError> {
    let messages = build_messages(system_prompt, user_prompt)?;
    let mut builder = CreateChatCompletionRequestArgs::default();
    builder.model(model).messages(messages);

    if let Some(value) = temperature {
        builder.temperature(value);
    }
    if let Some(value) = max_tokens {
        builder.max_tokens(value);
    }

    builder.build().map_err(|error| {
        HostError::invalid_input("Failed to build AI request").with_detail(error.to_string())
    })
}

async fn request_text_with_client<C>(
    client: &Client<C>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: Option<f32>,
    max_tokens: Option<u16>,
) -> Result<String, HostError>
where
    C: async_openai::config::Config,
{
    let request = build_chat_request(
        model,
        system_prompt,
        user_prompt,
        temperature,
        max_tokens,
    )?;

    let response = client.chat().create(request).await.map_err(|error| {
        HostError::task_execution_failed("AI request failed").with_detail(error.to_string())
    })?;

    let raw = response
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .unwrap_or_default();

    if raw.trim().is_empty() {
        return Err(HostError::task_execution_failed("AI returned empty content"));
    }

    Ok(raw)
}

fn resolve_chat_history_path(prefix: &str) -> Result<PathBuf, HostError> {
    let native_id = get_or_create_otools_native_id()?;
    let normalized_prefix = normalize_chat_prefix(prefix)?;
    Ok(catalog::otools_root_dir()
        .join("ai")
        .join("chat")
        .join(native_id)
        .join(format!("{normalized_prefix}.json")))
}

fn get_or_create_otools_native_id() -> Result<String, HostError> {
    let path = catalog::otools_root_dir().join("runtime").join("native_id.txt");
    if path.exists() {
        let value = fs::read_to_string(&path).map_err(HostError::io)?;
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let value = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HostError::io)?;
    }
    fs::write(&path, &value).map_err(HostError::io)?;
    Ok(value)
}

fn normalize_chat_prefix(prefix: &str) -> Result<String, HostError> {
    let trimmed = prefix.trim();
    if trimmed.is_empty() {
        return Err(HostError::invalid_input("Chat history prefix is required"));
    }

    let normalized = trimmed
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if normalized.is_empty() {
        return Err(HostError::invalid_input(
            "Chat history prefix does not contain valid characters",
        ));
    }

    Ok(normalized)
}

fn normalize_chat_messages(
    messages: Vec<OtoolsAiChatMessageRecord>,
) -> Vec<OtoolsAiChatMessageRecord> {
    messages
        .into_iter()
        .filter_map(|message| {
            let content = message.content.trim().to_string();
            if content.is_empty() {
                return None;
            }

            let role = match message.role.trim() {
                "user" => "user",
                _ => "assistant",
            }
            .to_string();

            let created_at = if message.created_at.trim().is_empty() {
                Utc::now().to_rfc3339()
            } else {
                message.created_at
            };

            let id = if message.id.trim().is_empty() {
                format!("{created_at}_{}", uuid::Uuid::new_v4())
            } else {
                message.id
            };

            Some(OtoolsAiChatMessageRecord {
                id,
                role,
                content,
                created_at,
            })
        })
        .collect()
}

fn load_chat_history_messages(prefix: &str) -> Result<Vec<OtoolsAiChatMessageRecord>, HostError> {
    let path = resolve_chat_history_path(prefix)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let stored = catalog::read_json_file::<OtoolsAiChatHistoryStored>(&path)?;
    let messages = match stored {
        OtoolsAiChatHistoryStored::Messages(messages) => messages,
        OtoolsAiChatHistoryStored::File(payload) => payload.messages,
    };
    Ok(normalize_chat_messages(messages))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_provider_aliases() {
        assert_eq!(normalize_ai_provider_alias(Some("aliyun")), "openai");
        assert_eq!(normalize_ai_provider_alias(Some("dashscope")), "openai");
        assert_eq!(normalize_ai_provider_alias(Some("ollama")), "ollama");
    }

    #[test]
    fn normalizes_chat_messages_shape() {
        let items = normalize_chat_messages(vec![
            OtoolsAiChatMessageRecord {
                id: String::new(),
                role: " user ".to_string(),
                content: " hi ".to_string(),
                created_at: String::new(),
            },
            OtoolsAiChatMessageRecord {
                id: String::new(),
                role: "system".to_string(),
                content: "   ".to_string(),
                created_at: String::new(),
            },
        ]);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].role, "user");
        assert_eq!(items[0].content, "hi");
        assert!(!items[0].id.is_empty());
        assert!(!items[0].created_at.is_empty());
    }
}

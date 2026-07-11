use async_openai::{
    config::{AzureConfig, OpenAIConfig},
    types::{
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequest,
        CreateChatCompletionRequestArgs,
    },
    Client,
};
use futures::StreamExt;
use lazy_static::lazy_static;
use serde_json::Value;
use std::future::Future;
use std::sync::mpsc;
use tokio::runtime::Builder as TokioRuntimeBuilder;
use tokio::sync::oneshot;

pub use otools_ai::{
    normalize_ai_provider_alias, OtoolsAiConfigInput, OtoolsAiGenerateTextRequest,
    OtoolsAiGenerateTextResult, OtoolsAiSettings, OTOOLS_GLOBAL_AI_SETTINGS_KEY,
};

lazy_static! {
    static ref AI_WORKER_RUNTIME: tokio::runtime::Runtime = TokioRuntimeBuilder::new_multi_thread()
        .worker_threads(2)
        .thread_name("otools-ai-worker")
        .enable_all()
        .build()
        .expect("failed to create ai worker runtime");
}

pub fn runtime_block_on<F: Future>(future: F) -> F::Output {
    AI_WORKER_RUNTIME.block_on(future)
}

pub fn load_global_ai_settings() -> Result<OtoolsAiSettings, String> {
    let path = otools_core::catalog::otools_root_dir().join("config.json");
    let mut merged = if path.exists() {
        let text = std::fs::read_to_string(&path)
            .map_err(|error| format!("读取 OTools 配置失败: {}", error))?;
        match serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("解析 OTools 配置失败: {}", error))?
        {
            Value::Object(map) => match map.get(OTOOLS_GLOBAL_AI_SETTINGS_KEY) {
                Some(value) => serde_json::from_value::<OtoolsAiSettings>(value.clone())
                    .map_err(|error| format!("解析 AI 配置失败: {}", error))?,
                None => OtoolsAiSettings::default(),
            },
            _ => OtoolsAiSettings::default(),
        }
    } else {
        OtoolsAiSettings::default()
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

pub fn resolve_ai_settings(input: Option<&OtoolsAiConfigInput>) -> Result<OtoolsAiSettings, String> {
    let mut settings = load_global_ai_settings()?;

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
        return Err("AI 模型不能为空，请先在配置中设置".to_string());
    }
    if settings.provider == "azure" && settings.base_url.trim().is_empty() {
        return Err("Azure Base URL 不能为空".to_string());
    }

    Ok(settings)
}

pub fn append_ollama_base_url_hint(
    provider: &str,
    base_url: Option<&str>,
    error: String,
) -> String {
    otools_ai::append_ollama_base_url_hint(provider, base_url, error)
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

fn build_azure_config(settings: &OtoolsAiSettings) -> Result<AzureConfig, String> {
    if settings.base_url.trim().is_empty() {
        return Err("Azure Base URL 不能为空".to_string());
    }
    Ok(AzureConfig::new()
        .with_api_base(settings.base_url.trim().to_string())
        .with_api_key(settings.api_key.trim().to_string()))
}

fn build_messages(
    system_prompt: &str,
    user_prompt: &str,
) -> Result<Vec<ChatCompletionRequestMessage>, String> {
    Ok(vec![
        ChatCompletionRequestMessage::System(
            ChatCompletionRequestSystemMessageArgs::default()
                .content(system_prompt)
                .build()
                .map_err(|error| format!("构建系统消息失败: {}", error))?,
        ),
        ChatCompletionRequestMessage::User(
            ChatCompletionRequestUserMessageArgs::default()
                .content(user_prompt)
                .build()
                .map_err(|error| format!("构建用户消息失败: {}", error))?,
        ),
    ])
}

fn build_chat_request(
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: Option<f32>,
    max_tokens: Option<u16>,
    stream: bool,
) -> Result<CreateChatCompletionRequest, String> {
    let messages = build_messages(system_prompt, user_prompt)?;
    let mut builder = CreateChatCompletionRequestArgs::default();
    builder.model(model).messages(messages);

    if let Some(value) = temperature {
        builder.temperature(value);
    }
    if let Some(value) = max_tokens {
        builder.max_tokens(value);
    }
    if stream {
        builder.stream(true);
    }

    builder
        .build()
        .map_err(|error| format!("构建 AI 请求失败: {}", error))
}

async fn request_text_stream_with_client<C, F>(
    client: &Client<C>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: Option<f32>,
    max_tokens: Option<u16>,
    mut on_delta: F,
) -> Result<String, String>
where
    C: async_openai::config::Config,
    F: FnMut(&str),
{
    let request = build_chat_request(
        model,
        system_prompt,
        user_prompt,
        temperature,
        max_tokens,
        true,
    )?;

    let mut stream = client
        .chat()
        .create_stream(request)
        .await
        .map_err(|error| format!("AI 调用失败: {}", error))?;

    let mut text = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("AI 流式调用失败: {}", error))?;
        for choice in chunk.choices {
            if let Some(delta) = choice.delta.content {
                if !delta.is_empty() {
                    on_delta(delta.as_str());
                    text.push_str(&delta);
                }
            }
        }
    }

    if text.trim().is_empty() {
        return Err("AI 返回内容为空".to_string());
    }

    Ok(text)
}

async fn request_text_with_client<C>(
    client: &Client<C>,
    model: &str,
    system_prompt: &str,
    user_prompt: &str,
    temperature: Option<f32>,
    max_tokens: Option<u16>,
) -> Result<String, String>
where
    C: async_openai::config::Config,
{
    let request = build_chat_request(
        model,
        system_prompt,
        user_prompt,
        temperature,
        max_tokens,
        false,
    )?;

    let response = client
        .chat()
        .create(request)
        .await
        .map_err(|error| format!("AI 调用失败: {}", error))?;

    let raw = response
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .unwrap_or_default();

    if raw.trim().is_empty() {
        return Err("AI 返回内容为空".to_string());
    }

    Ok(raw)
}

async fn generate_text_inner(
    request: OtoolsAiGenerateTextRequest,
) -> Result<OtoolsAiGenerateTextResult, String> {
    let settings = resolve_ai_settings(Some(&request.ai_options))?;
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
        .map_err(|error| append_ollama_base_url_hint(&provider, base_url, error))?
    };

    Ok(OtoolsAiGenerateTextResult {
        text,
        provider,
        model: settings.model.trim().to_string(),
    })
}

async fn run_ai_task<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: std::future::Future<Output = Result<T, String>> + Send + 'static,
{
    let (tx, rx) = oneshot::channel();
    AI_WORKER_RUNTIME.spawn(async move {
        let _ = tx.send(task.await);
    });

    rx.await
        .map_err(|error| format!("等待 AI 后台任务失败: {}", error))?
}

fn run_ai_task_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: std::future::Future<Output = Result<T, String>> + Send + 'static,
{
    let (tx, rx) = mpsc::sync_channel(1);
    AI_WORKER_RUNTIME.spawn(async move {
        let _ = tx.send(task.await);
    });
    rx.recv()
        .map_err(|error| format!("等待 AI 后台任务失败: {}", error))?
}

pub async fn generate_text(
    request: &OtoolsAiGenerateTextRequest,
) -> Result<OtoolsAiGenerateTextResult, String> {
    run_ai_task(generate_text_inner(request.clone())).await
}

async fn generate_text_stream_inner<F>(
    request: OtoolsAiGenerateTextRequest,
    on_delta: F,
) -> Result<OtoolsAiGenerateTextResult, String>
where
    F: FnMut(&str) + Send + 'static,
{
    let settings = resolve_ai_settings(Some(&request.ai_options))?;
    let provider = settings.provider.clone();
    let base_url = if settings.base_url.trim().is_empty() {
        None
    } else {
        Some(settings.base_url.as_str())
    };

    let text = if provider == "azure" {
        let config = build_azure_config(&settings)?;
        let client = Client::with_config(config);
        request_text_stream_with_client(
            &client,
            settings.model.trim(),
            request.system_prompt.trim(),
            request.user_prompt.trim(),
            request.temperature,
            request.max_tokens,
            on_delta,
        )
        .await?
    } else {
        let config = build_openai_config(&settings);
        let client = Client::with_config(config);
        request_text_stream_with_client(
            &client,
            settings.model.trim(),
            request.system_prompt.trim(),
            request.user_prompt.trim(),
            request.temperature,
            request.max_tokens,
            on_delta,
        )
        .await
        .map_err(|error| append_ollama_base_url_hint(&provider, base_url, error))?
    };

    Ok(OtoolsAiGenerateTextResult {
        text,
        provider,
        model: settings.model.trim().to_string(),
    })
}

pub async fn generate_text_stream<F>(
    request: &OtoolsAiGenerateTextRequest,
    on_delta: F,
) -> Result<OtoolsAiGenerateTextResult, String>
where
    F: FnMut(&str) + Send + 'static,
{
    run_ai_task(generate_text_stream_inner(request.clone(), on_delta)).await
}

pub fn blocking_generate_text(
    request: OtoolsAiGenerateTextRequest,
) -> Result<OtoolsAiGenerateTextResult, String> {
    run_ai_task_blocking(generate_text_inner(request))
}

use serde::{Deserialize, Serialize};

use crate::web::{TunnelProviderKind, TunnelServiceConfig};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TunnelStatusState {
    Disabled,
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatusInfo {
    pub provider: TunnelProviderKind,
    pub state: TunnelStatusState,
    pub public_url: Option<String>,
    pub last_error: Option<String>,
}

impl Default for TunnelStatusInfo {
    fn default() -> Self {
        Self {
            provider: TunnelProviderKind::None,
            state: TunnelStatusState::Disabled,
            public_url: None,
            last_error: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TunnelSyncReason {
    ManualStart,
    ProcessStartup,
    ConfigChanged,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TunnelError {
    pub key: &'static str,
    pub detail: Option<String>,
}

impl TunnelError {
    pub fn unsupported_provider() -> Self {
        Self {
            key: "web_tunnel.unsupported_provider",
            detail: None,
        }
    }

    pub fn auth_token_missing() -> Self {
        Self {
            key: "web_tunnel.auth_token_missing",
            detail: None,
        }
    }

    pub fn start_failed(detail: impl Into<String>) -> Self {
        Self {
            key: "web_tunnel.start_failed",
            detail: Some(detail.into()),
        }
    }

    pub fn stop_failed(detail: impl Into<String>) -> Self {
        Self {
            key: "web_tunnel.stop_failed",
            detail: Some(detail.into()),
        }
    }
}

#[async_trait::async_trait]
pub trait ActiveTunnel: Send {
    fn provider(&self) -> TunnelProviderKind;
    fn public_url(&self) -> &str;
    async fn stop(&mut self) -> Result<(), TunnelError>;
}

#[async_trait::async_trait]
pub trait TunnelProvider: Send + Sync {
    async fn start(&self, upstream_url: &str) -> Result<Box<dyn ActiveTunnel>, TunnelError>;
}

pub struct TunnelRuntimeState {
    active: tokio::sync::Mutex<Option<Box<dyn ActiveTunnel>>>,
    status: std::sync::Mutex<TunnelStatusInfo>,
}

impl Default for TunnelRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl TunnelRuntimeState {
    pub fn new() -> Self {
        Self {
            active: tokio::sync::Mutex::new(None),
            status: std::sync::Mutex::new(TunnelStatusInfo::default()),
        }
    }

    pub fn status(&self) -> TunnelStatusInfo {
        self.status.lock().unwrap().clone()
    }

    pub(crate) fn set_status(&self, status: TunnelStatusInfo) {
        *self.status.lock().unwrap() = status;
    }
}

pub async fn stop_web_tunnel(runtime: &TunnelRuntimeState) {
    if let Some(mut active) = runtime.active.lock().await.take() {
        if let Err(err) = active.stop().await {
            tracing::warn!("[WEB][TUNNEL] stop failed: {} {:?}", err.key, err.detail);
        }
    }
}

pub async fn sync_web_tunnel_runtime(
    runtime: &TunnelRuntimeState,
    config: &TunnelServiceConfig,
    reason: TunnelSyncReason,
) {
    if config.provider == TunnelProviderKind::None || !config.enabled {
        stop_web_tunnel(runtime).await;
        runtime.set_status(TunnelStatusInfo {
            provider: config.provider,
            state: if config.provider == TunnelProviderKind::None {
                TunnelStatusState::Disabled
            } else {
                TunnelStatusState::Stopped
            },
            public_url: None,
            last_error: None,
        });
        return;
    }

    if reason == TunnelSyncReason::ProcessStartup && !config.auto_start {
        runtime.set_status(TunnelStatusInfo {
            provider: config.provider,
            state: TunnelStatusState::Stopped,
            public_url: None,
            last_error: None,
        });
        return;
    }

    match config.provider {
        TunnelProviderKind::None => {}
        TunnelProviderKind::Ngrok => {
            match crate::web::tunnel_ngrok::NgrokTunnelProvider::from_stored_token() {
                Ok(provider) => {
                    sync_web_tunnel_runtime_with_provider(runtime, config, reason, &provider).await;
                }
                Err(err) => {
                    runtime.set_status(TunnelStatusInfo {
                        provider: TunnelProviderKind::Ngrok,
                        state: TunnelStatusState::Error,
                        public_url: None,
                        last_error: Some(err.key.to_string()),
                    });
                }
            }
        }
    }
}

pub async fn sync_web_tunnel_runtime_with_provider(
    runtime: &TunnelRuntimeState,
    config: &TunnelServiceConfig,
    reason: TunnelSyncReason,
    provider: &dyn TunnelProvider,
) {
    if config.provider == TunnelProviderKind::None || !config.enabled {
        stop_web_tunnel(runtime).await;
        runtime.set_status(TunnelStatusInfo {
            provider: config.provider,
            state: if config.provider == TunnelProviderKind::None {
                TunnelStatusState::Disabled
            } else {
                TunnelStatusState::Stopped
            },
            public_url: None,
            last_error: None,
        });
        return;
    }

    if reason == TunnelSyncReason::ProcessStartup && !config.auto_start {
        runtime.set_status(TunnelStatusInfo {
            provider: config.provider,
            state: TunnelStatusState::Stopped,
            public_url: None,
            last_error: None,
        });
        return;
    }

    stop_web_tunnel(runtime).await;
    runtime.set_status(TunnelStatusInfo {
        provider: config.provider,
        state: TunnelStatusState::Starting,
        public_url: None,
        last_error: None,
    });

    match provider.start("http://127.0.0.1:3080").await {
        Ok(active) => {
            let public_url = active.public_url().to_string();
            *runtime.active.lock().await = Some(active);
            runtime.set_status(TunnelStatusInfo {
                provider: config.provider,
                state: TunnelStatusState::Running,
                public_url: Some(public_url),
                last_error: None,
            });
        }
        Err(err) => {
            runtime.set_status(TunnelStatusInfo {
                provider: config.provider,
                state: TunnelStatusState::Error,
                public_url: None,
                last_error: Some(err.key.to_string()),
            });
            if let Some(detail) = err.detail {
                tracing::warn!("[WEB][TUNNEL] start failed: {}: {}", err.key, detail);
            } else {
                tracing::warn!("[WEB][TUNNEL] start failed: {}", err.key);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    struct FakeActiveTunnel {
        stopped: Arc<AtomicBool>,
        public_url: String,
    }

    #[async_trait::async_trait]
    impl ActiveTunnel for FakeActiveTunnel {
        fn provider(&self) -> TunnelProviderKind {
            TunnelProviderKind::Ngrok
        }

        fn public_url(&self) -> &str {
            &self.public_url
        }

        async fn stop(&mut self) -> Result<(), TunnelError> {
            self.stopped.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    struct FakeProvider {
        stopped: Arc<AtomicBool>,
        public_url: String,
        fail: Option<TunnelError>,
    }

    impl FakeProvider {
        fn success(public_url: &str) -> Self {
            Self {
                stopped: Arc::new(AtomicBool::new(false)),
                public_url: public_url.to_string(),
                fail: None,
            }
        }

        fn failure(err: TunnelError) -> Self {
            Self {
                stopped: Arc::new(AtomicBool::new(false)),
                public_url: String::new(),
                fail: Some(err),
            }
        }
    }

    #[async_trait::async_trait]
    impl TunnelProvider for FakeProvider {
        async fn start(&self, _upstream_url: &str) -> Result<Box<dyn ActiveTunnel>, TunnelError> {
            if let Some(err) = self.fail.clone() {
                return Err(err);
            }
            Ok(Box::new(FakeActiveTunnel {
                stopped: self.stopped.clone(),
                public_url: self.public_url.clone(),
            }))
        }
    }

    #[tokio::test]
    async fn sync_starts_fake_provider_and_records_public_url() {
        let runtime = TunnelRuntimeState::new();
        let provider = FakeProvider::success("https://fake.ngrok.app");
        let config = TunnelServiceConfig {
            provider: TunnelProviderKind::Ngrok,
            enabled: true,
            auto_start: false,
            auth_token_present: true,
            auth_token: None,
        };

        sync_web_tunnel_runtime_with_provider(
            &runtime,
            &config,
            TunnelSyncReason::ManualStart,
            &provider,
        )
        .await;

        let status = runtime.status();
        assert_eq!(status.state, TunnelStatusState::Running);
        assert_eq!(status.public_url.as_deref(), Some("https://fake.ngrok.app"));
    }

    #[tokio::test]
    async fn sync_failure_sets_error_without_panicking() {
        let runtime = TunnelRuntimeState::new();
        let provider = FakeProvider::failure(TunnelError::auth_token_missing());
        let config = TunnelServiceConfig {
            provider: TunnelProviderKind::Ngrok,
            enabled: true,
            auto_start: false,
            auth_token_present: false,
            auth_token: None,
        };

        sync_web_tunnel_runtime_with_provider(
            &runtime,
            &config,
            TunnelSyncReason::ManualStart,
            &provider,
        )
        .await;

        let status = runtime.status();
        assert_eq!(status.state, TunnelStatusState::Error);
        assert_eq!(
            status.last_error.as_deref(),
            Some("web_tunnel.auth_token_missing")
        );
    }

    #[tokio::test]
    async fn process_startup_respects_tunnel_auto_start_flag() {
        let runtime = TunnelRuntimeState::new();
        let provider = FakeProvider::success("https://fake.ngrok.app");
        let config = TunnelServiceConfig {
            provider: TunnelProviderKind::Ngrok,
            enabled: true,
            auto_start: false,
            auth_token_present: true,
            auth_token: None,
        };

        sync_web_tunnel_runtime_with_provider(
            &runtime,
            &config,
            TunnelSyncReason::ProcessStartup,
            &provider,
        )
        .await;

        assert_eq!(runtime.status().state, TunnelStatusState::Stopped);
    }
}

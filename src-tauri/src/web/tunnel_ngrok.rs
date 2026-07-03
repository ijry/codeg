use ngrok::prelude::*;
use url::Url;

use crate::web::{
    tunnel::{ActiveTunnel, TunnelError, TunnelProvider},
    TunnelProviderKind,
};

pub struct NgrokTunnelProvider {
    auth_token: String,
}

impl NgrokTunnelProvider {
    pub fn from_stored_token() -> Result<Self, TunnelError> {
        let auth_token = crate::keyring_store::get_tunnel_token("ngrok")
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(TunnelError::auth_token_missing)?;
        Ok(Self { auth_token })
    }
}

pub struct NgrokActiveTunnel {
    forwarder: ngrok::forwarder::Forwarder<ngrok::tunnel::HttpTunnel>,
    public_url: String,
}

#[async_trait::async_trait]
impl ActiveTunnel for NgrokActiveTunnel {
    fn provider(&self) -> TunnelProviderKind {
        TunnelProviderKind::Ngrok
    }

    fn public_url(&self) -> &str {
        &self.public_url
    }

    async fn stop(&mut self) -> Result<(), TunnelError> {
        self.forwarder
            .close()
            .await
            .map_err(|err| TunnelError::stop_failed(err.to_string()))
    }
}

#[async_trait::async_trait]
impl TunnelProvider for NgrokTunnelProvider {
    async fn start(&self, upstream_url: &str) -> Result<Box<dyn ActiveTunnel>, TunnelError> {
        let upstream =
            Url::parse(upstream_url).map_err(|err| TunnelError::start_failed(err.to_string()))?;
        let session = ngrok::Session::builder()
            .authtoken(self.auth_token.clone())
            .connect()
            .await
            .map_err(|err| TunnelError::start_failed(err.to_string()))?;
        let forwarder = session
            .http_endpoint()
            .listen_and_forward(upstream)
            .await
            .map_err(|err| TunnelError::start_failed(err.to_string()))?;
        let public_url = forwarder.url().to_string();
        Ok(Box::new(NgrokActiveTunnel {
            forwarder,
            public_url,
        }))
    }
}

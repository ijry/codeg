use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const SSH_CONNECT_TIMEOUT_SECS: u64 = 30;
pub const SSH_SESSION_TIMEOUT_MS: u32 = 30_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SshAuthType {
    #[default]
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SshAuthConfig {
    #[serde(default)]
    pub auth_type: SshAuthType,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub private_key_path: String,
    #[serde(default)]
    pub passphrase: String,
}

pub fn validate_ssh_auth_config(auth: &SshAuthConfig) -> Result<(), String> {
    match auth.auth_type {
        SshAuthType::Password => {
            if auth.password.is_empty() {
                return Err("SSH 密码不能为空".to_string());
            }
        }
        SshAuthType::PrivateKey => {
            let private_key_path = resolve_private_key_path(&auth.private_key_path)?;
            if !private_key_path.exists() {
                return Err(format!("SSH 私钥不存在: {}", private_key_path.display()));
            }
        }
    }

    Ok(())
}

pub fn connect_ssh_session(
    host: &str,
    port: u16,
    username: &str,
    auth: &SshAuthConfig,
) -> Result<Session, String> {
    if host.trim().is_empty() {
        return Err("SSH 主机不能为空".to_string());
    }
    if port == 0 {
        return Err("SSH 端口无效".to_string());
    }
    if username.trim().is_empty() {
        return Err("SSH 用户名不能为空".to_string());
    }

    validate_ssh_auth_config(auth)?;

    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("SSH 地址解析失败: {}", error))?
        .next()
        .ok_or_else(|| format!("无法解析 SSH 地址: {}:{}", host, port))?;

    let tcp_stream =
        TcpStream::connect_timeout(&addr, Duration::from_secs(SSH_CONNECT_TIMEOUT_SECS))
            .map_err(|error| format!("连接 SSH 服务器失败: {}", error))?;
    let _ = tcp_stream.set_nodelay(true);

    let mut session = Session::new().map_err(|error| format!("创建 SSH 会话失败: {}", error))?;
    session.set_tcp_stream(tcp_stream);
    session.set_timeout(SSH_SESSION_TIMEOUT_MS);
    session
        .handshake()
        .map_err(|error| format!("SSH 握手失败: {}", error))?;

    authenticate_ssh_session(&session, username, auth)?;

    if !session.authenticated() {
        return Err("SSH 认证失败".to_string());
    }

    Ok(session)
}

pub fn authenticate_ssh_session(
    session: &Session,
    username: &str,
    auth: &SshAuthConfig,
) -> Result<(), String> {
    match auth.auth_type {
        SshAuthType::Password => session
            .userauth_password(username, &auth.password)
            .map_err(|error| format!("SSH 密码认证失败: {}", error)),
        SshAuthType::PrivateKey => {
            let private_key_path = resolve_private_key_path(&auth.private_key_path)?;
            let passphrase = if auth.passphrase.is_empty() {
                None
            } else {
                Some(auth.passphrase.as_str())
            };
            session
                .userauth_pubkey_file(username, None, &private_key_path, passphrase)
                .map_err(|error| format!("SSH 私钥认证失败: {}", error))
        }
    }
}

pub fn resolve_private_key_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("SSH 私钥路径不能为空".to_string());
    }

    if let Some(home) = dirs::home_dir() {
        if trimmed == "~" {
            return Ok(home);
        }
        if let Some(rest) = trimmed.strip_prefix("~/") {
            return Ok(home.join(rest));
        }
        if let Some(rest) = trimmed.strip_prefix("~\\") {
            return Ok(home.join(rest));
        }
    }

    Ok(Path::new(trimmed).to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_home_private_key_paths() {
        let Some(home) = dirs::home_dir() else {
            return;
        };

        assert_eq!(resolve_private_key_path("~").unwrap(), home);
        assert_eq!(
            resolve_private_key_path("~/.ssh/id_rsa").unwrap(),
            home.join(".ssh").join("id_rsa")
        );
    }

    #[test]
    fn validates_password_auth_requires_password() {
        let error = validate_ssh_auth_config(&SshAuthConfig::default()).unwrap_err();
        assert_eq!(error, "SSH 密码不能为空");
    }
}

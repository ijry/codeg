use super::client::{connect_ssh_session, SshAuthConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ssh2::{Channel, Session};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

pub const SSH_OUTPUT_EVENT: &str = "ssh-output";
pub const SSH_CONNECTION_STATUS_EVENT: &str = "ssh-connection-status";
pub const SSH_CONNECTED_EVENT: &str = "ssh-connected";
pub const SSH_DISCONNECTED_EVENT: &str = "ssh-disconnected";

/// Event sink used by the host to fan out SSH shell events over Tauri/Web.
pub type SshEventSink = Arc<dyn Fn(&str, Value) + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshConfig {
    #[serde(default, alias = "serverId")]
    pub server_id: String,
    #[serde(default, alias = "sessionId")]
    pub session_id: String,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(flatten)]
    pub auth: SshAuthConfig,
}

fn default_ssh_port() -> u16 {
    22
}

#[derive(Debug)]
enum ChannelMessage {
    WriteData(String),
    Close,
}

struct ManagedSession {
    is_connected: Arc<AtomicBool>,
    tx: Mutex<Option<Sender<ChannelMessage>>>,
    emit: SshEventSink,
}

#[derive(Default)]
struct SshShellManager {
    connections: Mutex<HashMap<String, ManagedSession>>,
}

static SSH_SHELL_MANAGER: OnceLock<SshShellManager> = OnceLock::new();

fn shell_manager() -> &'static SshShellManager {
    SSH_SHELL_MANAGER.get_or_init(SshShellManager::default)
}

fn emit_event(emit: &SshEventSink, event: &str, payload: Value) {
    emit(event, payload);
}

fn emit_connection_status(emit: &SshEventSink, session_id: &str, status: &str) {
    emit_event(
        emit,
        SSH_CONNECTION_STATUS_EVENT,
        json!({
            "sessionId": session_id,
            "status": status,
        }),
    );
}

fn emit_output(emit: &SshEventSink, session_id: &str, output: String) {
    emit_event(
        emit,
        SSH_OUTPUT_EVENT,
        json!({
            "sessionId": session_id,
            "output": output,
        }),
    );
}

impl SshConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.session_id.trim().is_empty() {
            return Err("SSH session_id 不能为空".to_string());
        }
        if self.host.trim().is_empty() {
            return Err("SSH 主机不能为空".to_string());
        }
        if self.port == 0 {
            return Err("SSH 端口无效".to_string());
        }
        if self.username.trim().is_empty() {
            return Err("SSH 用户名不能为空".to_string());
        }
        super::client::validate_ssh_auth_config(&self.auth)
    }
}

/// Connect an interactive SSH PTY/shell session (legacy TerminalView contract).
pub fn connect_ssh_server(config: SshConfig, emit: SshEventSink) -> Result<String, String> {
    config.validate()?;

    let session_id = config.session_id.trim().to_string();
    let _ = disconnect_ssh_server(String::new(), session_id.clone());

    let sess = connect_ssh_session(&config.host, config.port, &config.username, &config.auth)?;
    let channel = open_shell_channel(&sess)?;
    // ssh2 0.9.x does not expose Channel::set_blocking; set Session non-blocking.
    sess.set_blocking(false);

    emit_event(
        &emit,
        SSH_CONNECTED_EVENT,
        Value::String(format!("成功连接到服务器: {}", config.host)),
    );
    emit_connection_status(&emit, &session_id, "connected");

    let (tx, rx) = mpsc::channel::<ChannelMessage>();
    let is_connected = Arc::new(AtomicBool::new(true));
    let channel = Arc::new(Mutex::new(channel));
    let closed = Arc::new(AtomicBool::new(false));

    // Keep Session alive for the channel lifetime by parking it in the read thread.
    spawn_write_thread(
        rx,
        channel.clone(),
        is_connected.clone(),
        closed.clone(),
        emit.clone(),
        session_id.clone(),
    );
    spawn_read_thread(
        sess,
        channel,
        is_connected.clone(),
        closed,
        emit.clone(),
        session_id.clone(),
    );

    let managed = ManagedSession {
        is_connected,
        tx: Mutex::new(Some(tx)),
        emit,
    };

    shell_manager()
        .connections
        .lock()
        .map_err(|_| "锁定 SSH 会话表失败".to_string())?
        .insert(session_id, managed);

    Ok(format!("已连接到服务器: {}", config.host))
}

pub fn send_ssh_input(
    _server_id: String,
    session_id: String,
    input: String,
) -> Result<(), String> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err("SSH session_id 不能为空".to_string());
    }

    let connections = shell_manager()
        .connections
        .lock()
        .map_err(|_| "锁定 SSH 会话表失败".to_string())?;

    let session = connections
        .get(&session_id)
        .ok_or_else(|| format!("未找到服务器连接: {session_id}"))?;

    if !session.is_connected.load(Ordering::SeqCst) {
        return Err("SSH连接已断开".to_string());
    }

    let tx = session
        .tx
        .lock()
        .map_err(|_| "锁定 SSH 发送通道失败".to_string())?
        .as_ref()
        .ok_or_else(|| "SSH通道未初始化".to_string())?
        .clone();

    tx.send(ChannelMessage::WriteData(input))
        .map_err(|error| format!("发送输入失败: {error}"))?;
    Ok(())
}

pub fn disconnect_ssh_server(_server_id: String, session_id: String) -> Result<(), String> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err("SSH session_id 不能为空".to_string());
    }

    let mut connections = shell_manager()
        .connections
        .lock()
        .map_err(|_| "锁定 SSH 会话表失败".to_string())?;

    let Some(session) = connections.remove(&session_id) else {
        return Err("未找到指定的服务器连接".to_string());
    };

    if let Ok(guard) = session.tx.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(ChannelMessage::Close);
        }
    }
    session.is_connected.store(false, Ordering::SeqCst);

    emit_event(
        &session.emit,
        SSH_DISCONNECTED_EVENT,
        Value::String(format!("已断开服务器连接: {session_id}")),
    );
    emit_connection_status(&session.emit, &session_id, "disconnected");
    Ok(())
}

pub fn is_ssh_connected(session_id: &str) -> bool {
    let Ok(connections) = shell_manager().connections.lock() else {
        return false;
    };
    connections
        .get(session_id.trim())
        .map(|session| session.is_connected.load(Ordering::SeqCst))
        .unwrap_or(false)
}

fn open_shell_channel(sess: &Session) -> Result<Channel, String> {
    let mut channel = sess
        .channel_session()
        .map_err(|error| format!("创建SSH通道失败: {error}"))?;

    // (cols, rows, pixel_width, pixel_height)
    if let Err(error) = channel.request_pty("xterm", None, Some((80, 24, 0, 0))) {
        eprintln!("请求PTY失败: {error}");
    }

    channel
        .shell()
        .map_err(|error| format!("创建shell失败: {error}"))?;

    Ok(channel)
}

fn spawn_write_thread(
    rx: mpsc::Receiver<ChannelMessage>,
    channel: Arc<Mutex<Channel>>,
    is_connected: Arc<AtomicBool>,
    closed: Arc<AtomicBool>,
    emit: SshEventSink,
    session_id: String,
) {
    thread::spawn(move || {
        loop {
            if !is_connected.load(Ordering::SeqCst) {
                break;
            }

            match rx.recv_timeout(Duration::from_millis(10)) {
                Ok(ChannelMessage::WriteData(data)) => {
                    let processed = data.replace('\n', "\r");
                    let mut wrote = false;
                    while !wrote {
                        if !is_connected.load(Ordering::SeqCst) {
                            break;
                        }
                        let write_result = channel
                            .lock()
                            .map_err(|_| {
                                std::io::Error::new(std::io::ErrorKind::Other, "锁定通道失败")
                            })
                            .and_then(|mut ch| {
                                ch.write_all(processed.as_bytes())?;
                                ch.flush()?;
                                Ok(())
                            });
                        match write_result {
                            Ok(()) => wrote = true,
                            Err(ref error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                                thread::sleep(Duration::from_millis(1));
                            }
                            Err(error) => {
                                eprintln!("写入SSH通道失败: {error}");
                                is_connected.store(false, Ordering::SeqCst);
                                break;
                            }
                        }
                    }
                }
                Ok(ChannelMessage::Close) => {
                    is_connected.store(false, Ordering::SeqCst);
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    is_connected.store(false, Ordering::SeqCst);
                    break;
                }
            }
        }

        if closed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Ok(mut ch) = channel.lock() {
            let _ = ch.close();
            let _ = ch.wait_close();
        }
        emit_event(
            &emit,
            SSH_DISCONNECTED_EVENT,
            Value::String(format!("服务器连接已关闭: {session_id}")),
        );
    });
}

fn spawn_read_thread(
    _session: Session,
    channel: Arc<Mutex<Channel>>,
    is_connected: Arc<AtomicBool>,
    closed: Arc<AtomicBool>,
    emit: SshEventSink,
    session_id: String,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 1024];
        loop {
            if !is_connected.load(Ordering::SeqCst) {
                break;
            }

            let read_result = channel
                .lock()
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "锁定通道失败"))
                .and_then(|mut ch| ch.read(&mut buffer));

            match read_result {
                Ok(0) => {
                    is_connected.store(false, Ordering::SeqCst);
                    break;
                }
                Ok(n) => {
                    let output = match std::str::from_utf8(&buffer[..n]) {
                        Ok(text) => text.to_string(),
                        Err(_) => String::from_utf8_lossy(&buffer[..n]).to_string(),
                    };
                    emit_output(&emit, &session_id, output);
                }
                Err(ref error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::TimedOut =>
                {
                    thread::sleep(Duration::from_millis(1));
                }
                Err(error) => {
                    eprintln!("读取SSH输出错误: {error}");
                    if error.kind() != std::io::ErrorKind::Interrupted {
                        is_connected.store(false, Ordering::SeqCst);
                        break;
                    }
                    thread::sleep(Duration::from_millis(1));
                }
            }
        }

        if closed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Ok(mut ch) = channel.lock() {
            let _ = ch.close();
            let _ = ch.wait_close();
        }
        emit_event(
            &emit,
            SSH_DISCONNECTED_EVENT,
            Value::String(format!("服务器连接已关闭: {session_id}")),
        );
        emit_connection_status(&emit, &session_id, "disconnected");
        if let Ok(mut map) = shell_manager().connections.lock() {
            map.remove(&session_id);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::{SshAuthConfig, SshAuthType};

    #[test]
    fn validates_required_session_fields() {
        let error = SshConfig {
            server_id: "s1".into(),
            session_id: String::new(),
            host: "example.com".into(),
            port: 22,
            username: "root".into(),
            auth: SshAuthConfig {
                auth_type: SshAuthType::Password,
                password: "secret".into(),
                private_key_path: String::new(),
                passphrase: String::new(),
            },
        }
        .validate()
        .unwrap_err();
        assert_eq!(error, "SSH session_id 不能为空");
    }

    #[test]
    fn disconnect_missing_session_errors() {
        let error = disconnect_ssh_server("s1".into(), "missing-session".into()).unwrap_err();
        assert_eq!(error, "未找到指定的服务器连接");
    }

    #[test]
    fn parses_legacy_snake_case_config() {
        let config: SshConfig = serde_json::from_value(json!({
            "server_id": "srv",
            "session_id": "sess-1",
            "host": "1.2.3.4",
            "port": 22,
            "username": "root",
            "auth_type": "password",
            "password": "pw"
        }))
        .unwrap();

        assert_eq!(config.session_id, "sess-1");
        assert_eq!(config.auth.password, "pw");
        assert!(config.validate().is_ok());
    }
}

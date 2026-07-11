use super::client::{connect_ssh_session, validate_ssh_auth_config, SshAuthConfig};
use serde::{Deserialize, Serialize};
use ssh2::{Channel, Session};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const SSH_TUNNEL_IDLE_SLEEP_MS: u64 = 8;
const SSH_TUNNEL_ACCEPT_SLEEP_MS: u64 = 40;

fn default_ssh_port() -> u16 {
    22
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshTunnelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(flatten)]
    pub auth: SshAuthConfig,
}

impl Default for SshTunnelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: String::new(),
            port: default_ssh_port(),
            username: String::new(),
            auth: SshAuthConfig::default(),
        }
    }
}

impl SshTunnelConfig {
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn validate(&self) -> Result<(), String> {
        if !self.enabled {
            return Ok(());
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
        validate_ssh_auth_config(&self.auth)?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct TcpEndpoint {
    pub host: String,
    pub port: u16,
}

impl TcpEndpoint {
    fn direct(host: &str, port: u16) -> Self {
        Self {
            host: host.to_string(),
            port,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TunnelSignature {
    ssh: SshTunnelConfig,
    target_host: String,
    target_port: u16,
}

struct ManagedTunnel {
    endpoint: TcpEndpoint,
    signature: TunnelSignature,
    stop_flag: Arc<AtomicBool>,
    accept_handle: Option<JoinHandle<()>>,
}

impl ManagedTunnel {
    fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(handle) = self.accept_handle.take() {
            let _ = handle.join();
        }
    }
}

#[derive(Default)]
struct SshTunnelManager {
    tunnels: Mutex<HashMap<String, ManagedTunnel>>,
}

static SSH_TUNNEL_MANAGER: OnceLock<SshTunnelManager> = OnceLock::new();

fn tunnel_manager() -> &'static SshTunnelManager {
    SSH_TUNNEL_MANAGER.get_or_init(SshTunnelManager::default)
}

pub fn resolve_tcp_endpoint(
    tunnel_id: &str,
    ssh: Option<&SshTunnelConfig>,
    target_host: &str,
    target_port: u16,
) -> Result<TcpEndpoint, String> {
    let normalized_target_host = target_host.trim();
    if normalized_target_host.is_empty() {
        return Err("数据库主机不能为空".to_string());
    }
    if target_port == 0 {
        return Err("数据库端口无效".to_string());
    }

    let Some(ssh) = ssh.filter(|config| config.is_enabled()) else {
        return Ok(TcpEndpoint::direct(normalized_target_host, target_port));
    };

    ssh.validate()?;

    if tunnel_id.trim().is_empty() {
        return Err("SSH 隧道标识不能为空".to_string());
    }

    tunnel_manager().get_or_create_tunnel(
        tunnel_id.trim(),
        ssh,
        normalized_target_host,
        target_port,
    )
}

pub fn invalidate_tunnel(tunnel_id: &str) {
    tunnel_manager().invalidate_tunnel(tunnel_id);
}

impl SshTunnelManager {
    fn get_or_create_tunnel(
        &self,
        tunnel_id: &str,
        ssh: &SshTunnelConfig,
        target_host: &str,
        target_port: u16,
    ) -> Result<TcpEndpoint, String> {
        let signature = TunnelSignature {
            ssh: ssh.clone(),
            target_host: target_host.to_string(),
            target_port,
        };

        let mut tunnels = self
            .tunnels
            .lock()
            .map_err(|error| format!("获取 SSH 隧道锁失败: {}", error))?;

        if let Some(existing) = tunnels.get(tunnel_id) {
            if existing.signature == signature {
                return Ok(existing.endpoint.clone());
            }
        }

        if let Some(mut previous) = tunnels.remove(tunnel_id) {
            previous.stop();
        }

        let (endpoint, stop_flag, accept_handle) =
            spawn_tunnel_listener(tunnel_id, ssh.clone(), target_host.to_string(), target_port)?;

        println!(
            "[ssh][tunnel] ready id={} local={}:{} ssh={}:{} target={}:{}",
            tunnel_id, endpoint.host, endpoint.port, ssh.host, ssh.port, target_host, target_port
        );

        tunnels.insert(
            tunnel_id.to_string(),
            ManagedTunnel {
                endpoint: endpoint.clone(),
                signature,
                stop_flag,
                accept_handle: Some(accept_handle),
            },
        );

        Ok(endpoint)
    }

    fn invalidate_tunnel(&self, tunnel_id: &str) {
        let tunnel = match self.tunnels.lock() {
            Ok(mut tunnels) => tunnels.remove(tunnel_id),
            Err(error) => {
                eprintln!(
                    "[ssh][tunnel] failed to lock tunnel cache during invalidate id={} error={}",
                    tunnel_id, error
                );
                None
            }
        };

        if let Some(mut tunnel) = tunnel {
            println!("[ssh][tunnel] invalidate id={}", tunnel_id);
            tunnel.stop();
        }
    }
}

fn spawn_tunnel_listener(
    tunnel_id: &str,
    ssh: SshTunnelConfig,
    target_host: String,
    target_port: u16,
) -> Result<(TcpEndpoint, Arc<AtomicBool>, JoinHandle<()>), String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("创建 SSH 隧道监听端口失败: {}", error))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("设置 SSH 隧道监听失败: {}", error))?;

    let local_addr = listener
        .local_addr()
        .map_err(|error| format!("读取 SSH 隧道本地端口失败: {}", error))?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_for_thread = stop_flag.clone();
    let tunnel_id_owned = tunnel_id.to_string();

    let accept_handle = thread::spawn(move || {
        while !stop_flag_for_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, peer_addr)) => {
                    let ssh = ssh.clone();
                    let target_host = target_host.clone();
                    let tunnel_id = tunnel_id_owned.clone();
                    thread::spawn(move || {
                        if let Err(error) = forward_stream(stream, &ssh, &target_host, target_port)
                        {
                            eprintln!(
                                "[ssh][tunnel] forward failed id={} peer={} target={}:{} error={}",
                                tunnel_id, peer_addr, target_host, target_port, error
                            );
                        }
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(SSH_TUNNEL_ACCEPT_SLEEP_MS));
                }
                Err(error) => {
                    eprintln!(
                        "[ssh][tunnel] accept failed id={} target={}:{} error={}",
                        tunnel_id_owned, target_host, target_port, error
                    );
                    thread::sleep(Duration::from_millis(SSH_TUNNEL_ACCEPT_SLEEP_MS));
                }
            }
        }
    });

    Ok((
        TcpEndpoint {
            host: "127.0.0.1".to_string(),
            port: local_addr.port(),
        },
        stop_flag,
        accept_handle,
    ))
}

fn forward_stream(
    mut local_stream: TcpStream,
    ssh: &SshTunnelConfig,
    target_host: &str,
    target_port: u16,
) -> Result<(), String> {
    local_stream
        .set_nonblocking(true)
        .map_err(|error| format!("设置本地隧道连接失败: {}", error))?;

    let session = establish_ssh_session(ssh)?;
    let mut channel = session
        .channel_direct_tcpip(target_host, target_port, None)
        .map_err(|error| format!("创建 SSH 直连通道失败: {}", error))?;
    session.set_blocking(false);

    let bridge_result = bridge_streams(&mut local_stream, &mut channel);

    let _ = channel.close();
    let _ = channel.wait_close();

    bridge_result
}

fn establish_ssh_session(ssh: &SshTunnelConfig) -> Result<Session, String> {
    connect_ssh_session(&ssh.host, ssh.port, &ssh.username, &ssh.auth)
}

fn bridge_streams(local_stream: &mut TcpStream, channel: &mut Channel) -> Result<(), String> {
    let mut local_buffer = [0_u8; 16 * 1024];
    let mut remote_buffer = [0_u8; 16 * 1024];
    let mut local_eof = false;
    let mut remote_eof = false;

    loop {
        let mut moved_data = false;

        if !local_eof {
            match local_stream.read(&mut local_buffer) {
                Ok(0) => {
                    local_eof = true;
                    let _ = channel.send_eof();
                }
                Ok(read_bytes) => {
                    write_all_to_channel(channel, &local_buffer[..read_bytes])?;
                    moved_data = true;
                }
                Err(error) if is_nonblocking_io_error(&error) => {}
                Err(error) => {
                    return Err(format!("读取本地连接失败: {}", error));
                }
            }
        }

        match channel.read(&mut remote_buffer) {
            Ok(0) => {
                if channel.eof() {
                    remote_eof = true;
                }
            }
            Ok(read_bytes) => {
                write_all_to_stream(local_stream, &remote_buffer[..read_bytes])?;
                moved_data = true;
            }
            Err(error) if is_nonblocking_io_error(&error) => {}
            Err(error) => {
                return Err(format!("读取 SSH 通道失败: {}", error));
            }
        }

        if remote_eof {
            break;
        }
        if local_eof && channel.eof() {
            break;
        }
        if !moved_data {
            thread::sleep(Duration::from_millis(SSH_TUNNEL_IDLE_SLEEP_MS));
        }
    }

    Ok(())
}

fn write_all_to_channel(channel: &mut Channel, data: &[u8]) -> Result<(), String> {
    let mut written = 0;
    while written < data.len() {
        match channel.write(&data[written..]) {
            Ok(0) => return Err("SSH 通道已关闭".to_string()),
            Ok(size) => {
                written += size;
            }
            Err(error) if is_nonblocking_io_error(&error) => {
                thread::sleep(Duration::from_millis(SSH_TUNNEL_IDLE_SLEEP_MS));
            }
            Err(error) => return Err(format!("写入 SSH 通道失败: {}", error)),
        }
    }
    channel
        .flush()
        .map_err(|error| format!("刷新 SSH 通道失败: {}", error))
}

fn write_all_to_stream(stream: &mut TcpStream, data: &[u8]) -> Result<(), String> {
    let mut written = 0;
    while written < data.len() {
        match stream.write(&data[written..]) {
            Ok(0) => return Err("本地连接已关闭".to_string()),
            Ok(size) => {
                written += size;
            }
            Err(error) if is_nonblocking_io_error(&error) => {
                thread::sleep(Duration::from_millis(SSH_TUNNEL_IDLE_SLEEP_MS));
            }
            Err(error) => return Err(format!("写入本地连接失败: {}", error)),
        }
    }
    Ok(())
}

fn is_nonblocking_io_error(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::WouldBlock
            | std::io::ErrorKind::TimedOut
            | std::io::ErrorKind::Interrupted
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_tunnel_resolves_direct_endpoint() {
        let endpoint = resolve_tcp_endpoint("db", None, "127.0.0.1", 5432).unwrap();
        assert_eq!(endpoint.host, "127.0.0.1");
        assert_eq!(endpoint.port, 5432);
    }

    #[test]
    fn enabled_tunnel_validates_required_fields() {
        let config = SshTunnelConfig {
            enabled: true,
            ..SshTunnelConfig::default()
        };

        assert_eq!(config.validate().unwrap_err(), "SSH 主机不能为空");
    }
}

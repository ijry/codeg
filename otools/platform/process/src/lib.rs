use std::collections::{BTreeSet, HashMap};
use std::ffi::OsStr;
use std::process::{Command, Output};

use otools_core::HostError;
use serde::Serialize;
use serde_json::{json, Value};

#[cfg(target_os = "windows")]
use csv::ReaderBuilder;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtoolsHostListenProcessInfo {
    pub pid: u32,
    pub name: String,
    pub command: String,
    pub ports: Vec<u16>,
}

pub fn apply_command_background_mode(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

pub fn new_background_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    apply_command_background_mode(&mut command);
    command
}

pub async fn otools_host_list_listen_processes() -> Result<Vec<Value>, HostError> {
    Ok(list_listen_processes()
        .unwrap_or_default()
        .into_iter()
        .map(|item| {
            json!({
                "pid": item.pid,
                "name": item.name,
                "command": item.command,
                "ports": item.ports,
            })
        })
        .collect())
}

pub async fn otools_host_kill_process(pid: u32) -> Result<(), HostError> {
    kill_process_by_pid(pid).map_err(HostError::task_execution_failed)
}

pub fn list_listen_processes() -> Result<Vec<OtoolsHostListenProcessInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        return collect_processes_windows();
    }

    #[cfg(not(target_os = "windows"))]
    {
        collect_processes_unix()
    }
}

pub fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid pid".to_string());
    }

    let pid_text = pid.to_string();

    #[cfg(target_os = "windows")]
    {
        let output = new_background_command("taskkill")
            .args(["/PID", &pid_text, "/F"])
            .output()
            .map_err(|error| format!("Failed to start taskkill: {error}"))?;

        if !output.status.success() {
            return Err(build_command_error("taskkill", &output));
        }

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let term_output = new_background_command("kill")
            .args(["-TERM", &pid_text])
            .output()
            .map_err(|error| format!("Failed to start kill: {error}"))?;

        if term_output.status.success() {
            return Ok(());
        }

        Err(build_command_error("kill", &term_output))
    }
}

fn build_command_error(program: &str, output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if !stderr.is_empty() {
        format!("Failed to execute {program}: {stderr}")
    } else if !stdout.is_empty() {
        format!("Failed to execute {program}: {stdout}")
    } else {
        format!("Failed to execute {program}")
    }
}

fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = new_background_command(program)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to start {program}: {error}"))?;

    if !output.status.success() {
        return Err(build_command_error(program, &output));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn extract_port_from_endpoint(endpoint: &str) -> Option<u16> {
    let target = endpoint.split_whitespace().next()?.trim();
    if target.is_empty() || target.contains("->") {
        return None;
    }

    let raw = target.rsplit(':').next()?.trim();
    let digits = raw.trim_matches(|ch: char| !ch.is_ascii_digit());
    if digits.is_empty() {
        return None;
    }

    digits.parse::<u16>().ok()
}

fn sort_processes(items: &mut [OtoolsHostListenProcessInfo]) {
    items.sort_by(|left, right| {
        right
            .ports
            .len()
            .cmp(&left.ports.len())
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.pid.cmp(&right.pid))
    });
}

#[cfg(not(target_os = "windows"))]
fn collect_ports_by_pid_unix() -> HashMap<u32, BTreeSet<u16>> {
    let output = match run_command("lsof", &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };

    let mut ports_by_pid = HashMap::<u32, BTreeSet<u16>>::new();
    let mut current_pid = None;

    for line in output.lines() {
        if line.is_empty() {
            continue;
        }

        let mut chars = line.chars();
        let Some(prefix) = chars.next() else {
            continue;
        };
        let payload = chars.as_str().trim();

        match prefix {
            'p' => current_pid = payload.parse::<u32>().ok(),
            'n' => {
                if let (Some(pid), Some(port)) =
                    (current_pid, extract_port_from_endpoint(payload))
                {
                    ports_by_pid.entry(pid).or_default().insert(port);
                }
            }
            _ => {}
        }
    }

    ports_by_pid
}

#[cfg(not(target_os = "windows"))]
fn collect_processes_unix() -> Result<Vec<OtoolsHostListenProcessInfo>, String> {
    let output = run_command("ps", &["-axo", "pid=,comm=,args="])?;
    let ports_by_pid = collect_ports_by_pid_unix();
    let mut processes = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut segments = trimmed.split_whitespace();
        let Some(pid_raw) = segments.next() else {
            continue;
        };
        let Some(name_raw) = segments.next() else {
            continue;
        };
        let Ok(pid) = pid_raw.parse::<u32>() else {
            continue;
        };

        let args = segments.collect::<Vec<_>>().join(" ");
        let name = name_raw.to_string();
        let command = if args.is_empty() { name.clone() } else { args };
        let ports = ports_by_pid
            .get(&pid)
            .map(|set| set.iter().copied().collect::<Vec<_>>())
            .unwrap_or_default();

        processes.push(OtoolsHostListenProcessInfo {
            pid,
            name,
            command,
            ports,
        });
    }

    sort_processes(&mut processes);
    Ok(processes)
}

#[cfg(target_os = "windows")]
fn collect_ports_by_pid_windows() -> HashMap<u32, BTreeSet<u16>> {
    let output = match run_command("netstat", &["-ano", "-p", "tcp"]) {
        Ok(value) => value,
        Err(_) => return HashMap::new(),
    };

    let mut ports_by_pid = HashMap::<u32, BTreeSet<u16>>::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts = trimmed.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 5 || !parts[3].eq_ignore_ascii_case("LISTENING") {
            continue;
        }

        let Ok(pid) = parts[4].parse::<u32>() else {
            continue;
        };
        if let Some(port) = extract_port_from_endpoint(parts[1]) {
            ports_by_pid.entry(pid).or_default().insert(port);
        }
    }

    ports_by_pid
}

#[cfg(target_os = "windows")]
fn collect_processes_windows() -> Result<Vec<OtoolsHostListenProcessInfo>, String> {
    let output = run_command("tasklist", &["/FO", "CSV", "/NH"])?;
    let ports_by_pid = collect_ports_by_pid_windows();
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .from_reader(output.as_bytes());
    let mut processes = Vec::new();

    for row in reader.records() {
        let Ok(record) = row else {
            continue;
        };
        if record.len() < 2 {
            continue;
        }

        let name = record.get(0).unwrap_or("").trim().to_string();
        let Ok(pid) = record.get(1).unwrap_or("").trim().parse::<u32>() else {
            continue;
        };
        let ports = ports_by_pid
            .get(&pid)
            .map(|set| set.iter().copied().collect::<Vec<_>>())
            .unwrap_or_default();

        processes.push(OtoolsHostListenProcessInfo {
            pid,
            name: name.clone(),
            command: name,
            ports,
        });
    }

    sort_processes(&mut processes);
    Ok(processes)
}

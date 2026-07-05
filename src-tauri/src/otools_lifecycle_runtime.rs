use std::thread;

use otools_lifecycle::OtoolsLifecycleRunReport;

pub fn spawn_otools_autostart_worker(context: &'static str) {
    let thread_name = format!("otools-autostart-{context}");
    let spawn = thread::Builder::new().name(thread_name.clone()).spawn(move || {
        let report = run_with_runtime(otools_lifecycle::run_otools_autostart_tasks());
        log_report(context, "autostart", &report);
    });

    if let Err(error) = spawn {
        tracing::error!("[OTools][{context}] failed to spawn autostart worker: {error}");
    }
}

pub fn run_otools_shutdown_hooks_worker(context: &'static str) {
    let thread_name = format!("otools-shutdown-{context}");
    let spawn = thread::Builder::new().name(thread_name).spawn(move || {
        let report = run_with_runtime(otools_lifecycle::run_otools_shutdown_hooks());
        log_report(context, "shutdown", &report);
    });

    match spawn {
        Ok(handle) => {
            if let Err(error) = handle.join() {
                tracing::error!(
                    "[OTools][{context}] shutdown worker panicked: {}",
                    format_panic_payload(error)
                );
            }
        }
        Err(error) => tracing::error!("[OTools][{context}] failed to spawn shutdown worker: {error}"),
    }
}

fn run_with_runtime(
    future: impl std::future::Future<Output = OtoolsLifecycleRunReport>,
) -> OtoolsLifecycleRunReport {
    match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime.block_on(future),
        Err(error) => OtoolsLifecycleRunReport {
            phase: "runtime".to_string(),
            total: 1,
            success_count: 0,
            failed_count: 1,
            skipped_count: 0,
            ignored_count: 0,
            items: vec![otools_lifecycle::OtoolsLifecycleRunItem {
                plugin_id: "runtime".to_string(),
                entry_id: "tokio.build".to_string(),
                action: "runtime".to_string(),
                status: "failed".to_string(),
                message: format!("failed to build lifecycle runtime: {error}"),
                elapsed_ms: 0,
            }],
            message: format!("lifecycle runtime build failed: {error}"),
        },
    }
}

fn log_report(context: &str, stage: &str, report: &OtoolsLifecycleRunReport) {
    if report.failed_count == 0 {
        tracing::info!(
            "[OTools][{context}] {stage} ok: {} (total={}, success={}, skipped={}, ignored={})",
            report.message,
            report.total,
            report.success_count,
            report.skipped_count,
            report.ignored_count
        );
        return;
    }

    tracing::warn!(
        "[OTools][{context}] {stage} finished with failures: {}",
        report.message
    );
    for item in report.items.iter().filter(|item| item.status == "failed") {
        tracing::warn!(
            "[OTools][{context}] {stage} failed plugin={} entry={} action={} message={}",
            item.plugin_id,
            item.entry_id,
            item.action,
            item.message
        );
    }
}

fn format_panic_payload(payload: Box<dyn std::any::Any + Send>) -> String {
    match payload.downcast::<String>() {
        Ok(message) => *message,
        Err(payload) => match payload.downcast::<&'static str>() {
            Ok(message) => (*message).to_string(),
            Err(_) => "unknown panic payload".to_string(),
        },
    }
}

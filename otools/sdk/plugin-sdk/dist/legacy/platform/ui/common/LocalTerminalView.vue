<template>
  <div class="local-terminal-view" :style="containerStyle">
    <div ref="terminalRef" class="terminal-canvas"></div>

    <div v-if="connecting" class="overlay">
      <span>正在启动本地终端...</span>
    </div>

    <div v-else-if="!connected" class="overlay error">
      <div class="message">{{ errorMessage || '终端未连接' }}</div>
      <el-button size="small" type="primary" @click="reconnect">重连</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElButton } from 'element-plus';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getTheme, getThemeContainerStyle } from '@/utils/termThemes.js';
import { isRemoteServiceRuntime } from '@/platform/runtime';

interface Props {
  sessionId: string;
  workingDir?: string;
  themeName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  themeName: 'solarized-light',
});

const terminalRef = ref<HTMLElement>();
const connecting = ref(true);
const connected = ref(false);
const errorMessage = ref('');
const isWindowsClient =
  typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win');

const currentTheme = computed(() => {
  const theme = getTheme(props.themeName || 'solarized-light');
  return {
    ...theme,
    selectionBackground: theme.selection,
  };
});

const containerStyle = computed(() => getThemeContainerStyle(props.themeName || 'solarized-light'));

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let outputUnlisten: (() => void) | null = null;
let statusUnlisten: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeRaf = 0;
let windowsLocalEchoLine = '';
let pollingTimer: number | null = null;
const START_TIMEOUT_MS = 10000;
const CLOSE_TIMEOUT_MS = 2500;
const REMOTE_POLL_INTERVAL_MS = 120;

type LocalTerminalStatusEventPayload = {
  sessionId?: string;
  status?: string;
  message?: string;
};

type LocalTerminalOutputEventPayload = {
  sessionId?: string;
  output?: string;
};

type LocalTerminalBufferedEvent = {
  kind?: string;
  sessionId?: string;
  output?: string | null;
  status?: string | null;
  message?: string | null;
};

const invokeWithTimeout = async <T = unknown>(
  command: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<T> => {
  return (await Promise.race([
    invoke<T>(command, args),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${command} 超时（>${Math.floor(timeoutMs / 1000)}s）`));
      }, timeoutMs);
    }),
  ])) as T;
};

const syncTerminalSize = async () => {
  if (!connected.value || !terminal) return;
  const cols = Math.max(1, terminal.cols || 80);
  const rows = Math.max(1, terminal.rows || 24);
  try {
    await invoke('resize_local_terminal_session', {
      sessionId: props.sessionId,
      cols,
      rows,
    });
  } catch {
    // resize 异常不阻断交互
  }
};

const refreshLayout = async () => {
  if (!terminal || !fitAddon || !terminalRef.value) return;
  if (terminalRef.value.clientWidth <= 0 || terminalRef.value.clientHeight <= 0) return;
  fitAddon.fit();
  await syncTerminalSize();
};

const queueRefreshLayout = () => {
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf);
  }
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    void refreshLayout();
  });
};

const resetWindowsLocalEcho = () => {
  windowsLocalEchoLine = '';
};

const trimLastUnicodeChar = (value: string) => {
  const chars = Array.from(value);
  chars.pop();
  return chars.join('');
};

const writeWindowsLocalEcho = (data: string) => {
  if (!isWindowsClient || !terminal || !data) return;

  if (data === '\r' || data === '\n' || data === '\r\n') {
    terminal.write('\r\n');
    resetWindowsLocalEcho();
    return;
  }

  if (data === '\u007f' || data === '\b') {
    if (!windowsLocalEchoLine) return;
    windowsLocalEchoLine = trimLastUnicodeChar(windowsLocalEchoLine);
    terminal.write('\b \b');
    return;
  }

  if (data === '\u0003') {
    terminal.write('^C\r\n');
    resetWindowsLocalEcho();
    return;
  }

  if (data.includes('\u001b')) {
    return;
  }

  const visible = data.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  if (!visible) return;

  windowsLocalEchoLine += visible;
  terminal.write(visible);
};

const normalizeTerminalOutput = (output: string) => {
  if (!isWindowsClient || !output) return output;

  let normalized = '';
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (char === '\n') {
      if (index > 0 && output[index - 1] === '\r') {
        normalized += '\n';
      } else {
        normalized += '\r\n';
      }
    } else {
      normalized += char;
    }
  }

  return normalized;
};

const handleOutputPayload = (payload: LocalTerminalOutputEventPayload) => {
  if (payload?.sessionId !== props.sessionId) return;
  if (!terminal) return;
  terminal.write(normalizeTerminalOutput(payload.output || ''));
};

const handleStatusPayload = (payload: LocalTerminalStatusEventPayload) => {
  if (payload?.sessionId !== props.sessionId) return;
  const status = payload?.status || '';

  if (status === 'connected') {
    connecting.value = false;
    connected.value = true;
    errorMessage.value = '';
    queueRefreshLayout();
  } else if (status === 'closed' || status === 'disconnected') {
    connecting.value = false;
    connected.value = false;
    if (payload.message) {
      errorMessage.value = payload.message;
    }
  } else if (status === 'error') {
    connecting.value = false;
    connected.value = false;
    errorMessage.value = payload.message || '终端发生错误';
  }
};

const initTerminal = async () => {
  terminal = new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 13,
    theme: currentTheme.value,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  await nextTick();
  if (terminalRef.value) {
    terminal.open(terminalRef.value);
    queueRefreshLayout();
    terminal.focus();

    terminal.onData(async (data) => {
      if (!connected.value) return;
      writeWindowsLocalEcho(data);
      try {
        await invoke('send_local_terminal_input', {
          sessionId: props.sessionId,
          input: data,
        });
      } catch (error) {
        const message =
          typeof error === 'string'
            ? error
            : ((error as any)?.message as string) || '发送输入失败';
        errorMessage.value = message;
        connected.value = false;
      }
    });
  }
};

const bindEvents = async () => {
  outputUnlisten = await listen('local-terminal-output', (event: any) => {
    handleOutputPayload(event.payload as LocalTerminalOutputEventPayload);
  });

  statusUnlisten = await listen('local-terminal-status', (event: any) => {
    handleStatusPayload(event.payload as LocalTerminalStatusEventPayload);
  });
};

const pollBufferedEvents = async () => {
  if (!isRemoteServiceRuntime()) {
    return;
  }

  try {
    const events = await invoke<LocalTerminalBufferedEvent[]>('pull_local_terminal_events', {
      sessionId: props.sessionId,
    });
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    for (const event of events) {
      if (event?.kind === 'output') {
        handleOutputPayload({
          sessionId: event.sessionId,
          output: event.output || '',
        });
      } else if (event?.kind === 'status') {
        handleStatusPayload({
          sessionId: event.sessionId,
          status: event.status || '',
          message: event.message || '',
        });
      }
    }
  } catch {
    // ignore polling errors in remote mode
  }
};

const startPolling = () => {
  if (!isRemoteServiceRuntime() || pollingTimer !== null) {
    return;
  }

  pollingTimer = window.setInterval(() => {
    void pollBufferedEvents();
  }, REMOTE_POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (pollingTimer === null) {
    return;
  }
  window.clearInterval(pollingTimer);
  pollingTimer = null;
};

const connectTerminal = async () => {
  connecting.value = true;
  connected.value = false;
  errorMessage.value = '';
  try {
    await Promise.race([
      invoke('start_local_terminal_session', {
        sessionId: props.sessionId,
        workingDir: props.workingDir || null,
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`启动超时（>${START_TIMEOUT_MS / 1000}s）`));
        }, START_TIMEOUT_MS);
      }),
    ]);
    // 兜底：即使事件丢失，也不要一直卡在启动态
    connecting.value = false;
    connected.value = true;
    errorMessage.value = '';
    queueRefreshLayout();
  } catch (error) {
    connecting.value = false;
    connected.value = false;
    errorMessage.value =
      typeof error === 'string'
        ? error
        : ((error as any)?.message as string) || '启动终端失败';
  }
};

const reconnect = async () => {
  resetWindowsLocalEcho();
  try {
    await invokeWithTimeout('close_local_terminal_session', { sessionId: props.sessionId }, CLOSE_TIMEOUT_MS);
  } catch {
    // ignore
  }
  await connectTerminal();
};

const disconnect = async () => {
  resetWindowsLocalEcho();
  try {
    await invokeWithTimeout('close_local_terminal_session', { sessionId: props.sessionId }, CLOSE_TIMEOUT_MS);
  } catch {
    // ignore
  }
};

const executeCommand = async (command: string) => {
  const normalized = command.trim();
  if (!normalized) return;

  if (!connected.value) {
    await reconnect();
  }
  if (!connected.value) {
    throw new Error(errorMessage.value || '终端未连接');
  }

  await invoke('send_local_terminal_input', {
    sessionId: props.sessionId,
    input: isWindowsClient ? `${normalized}\r` : `${normalized}\n`,
  });
  if (isWindowsClient) {
    writeWindowsLocalEcho(normalized);
    writeWindowsLocalEcho('\r');
  }
  terminal?.focus();
};

const writeOutput = (output: string) => {
  if (!terminal) return;
  terminal.write(normalizeTerminalOutput(output));
};

const handleResize = () => {
  queueRefreshLayout();
};

onMounted(async () => {
  try {
    await initTerminal();
  } catch (error) {
    connecting.value = false;
    connected.value = false;
    errorMessage.value =
      typeof error === 'string'
        ? error
        : ((error as any)?.message as string) || '终端初始化失败';
    return;
  }

  try {
    await bindEvents();
  } catch (error) {
    // 事件监听失败不阻断启动流程，但给出可见提示
    errorMessage.value =
      typeof error === 'string'
        ? error
        : ((error as any)?.message as string) || '终端事件监听失败';
  }

  startPolling();
  await connectTerminal();
  await pollBufferedEvents();
  if (terminalRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      queueRefreshLayout();
    });
    resizeObserver.observe(terminalRef.value);
  }
  window.addEventListener('resize', handleResize);
});

onUnmounted(async () => {
  stopPolling();
  window.removeEventListener('resize', handleResize);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = 0;
  }

  if (outputUnlisten) {
    outputUnlisten();
    outputUnlisten = null;
  }
  if (statusUnlisten) {
    statusUnlisten();
    statusUnlisten = null;
  }

  await disconnect();

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
  fitAddon = null;
});

watch(
  () => props.workingDir,
  () => {
    // 工作目录变化不自动重建会话，避免误中断用户正在执行的任务
  }
);

watch(
  () => props.themeName,
  () => {
    if (!terminal) return;
    terminal.options.theme = currentTheme.value;
    requestAnimationFrame(() => {
      if (terminal) {
        terminal.refresh(0, Math.max(0, terminal.rows - 1));
      }
    });
  }
);

defineExpose({
  reconnect,
  disconnect,
  refreshLayout,
  executeCommand,
  writeOutput,
});
</script>

<style scoped>
.local-terminal-view {
  width: 100%;
  height: 100%;
  position: relative;
  padding: 6px;
  background: #2e3440;
}

.terminal-canvas {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  gap: 10px;
}

.overlay.error {
  background: rgba(0, 0, 0, 0.55);
}

.message {
  max-width: 80%;
  word-break: break-all;
  text-align: center;
  font-size: 13px;
}
</style>

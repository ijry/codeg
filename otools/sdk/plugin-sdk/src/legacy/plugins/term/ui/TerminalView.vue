<template>
  <div
    class="terminal-container"
    :style="containerStyle"
  >
    <div ref="terminalRef" class="terminal" />
    <div v-if="connecting" class="connecting-overlay">
      <p>正在连接到 {{ serverName }}...</p>
    </div>
    <div v-else-if="!connected" class="disconnected-overlay">
      <p>{{ errorMessage || '未连接到服务器' }}</p>
      <button @click="reconnect" class="reconnect-btn">重新连接</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getTheme, getThemeContainerStyle } from './themes.js';

interface Props {
  serverId?: string;
  serverName?: string;
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'private_key';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  themeName?: string;
  sessionId?: string;
  initialCommand?: string;
}

const props = withDefaults(defineProps<Props>(), {
  port: 22,
  serverId: 'default-server',
  themeName: 'catppuccin',
  sessionId: '',
  initialCommand: ''
});

const terminalRef = ref<HTMLElement>();
const connecting = ref(true);
const connected = ref(false);
const errorMessage = ref<string | null>(null);
const containerStyle = ref(getThemeContainerStyle(props.themeName));
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let eventUnlisten: (() => void) | null = null;
let sessionId: string | null = null;
let connectionStatusListener: (() => void) | null = null;

const initTerminal = async () => {
  terminal = new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    theme: getTheme(props.themeName)
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  await nextTick();
  if (terminalRef.value) {
    terminal.open(terminalRef.value);
    fitAddon.fit();
    terminal.focus();
    terminal.options.theme = getTheme(props.themeName);
    terminal.refresh(0, Math.max(0, terminal.rows - 1));

    terminal.onData((data) => {
      if (!connected.value) {
        return;
      }

      if (data === '\r') {
        terminal?.write('\r\n');
        sendCommand('\r');
        return;
      }

      sendCommand(data);
    });
  }
};

const sendCommand = async (command: string) => {
  if (!connected.value || !props.sessionId) {
    return;
  }

  try {
    await invoke('send_ssh_input', {
      serverId: props.serverId,
      sessionId: props.sessionId,
      input: command
    });
  } catch (error) {
    console.error('发送命令失败:', error);
  }
};

const connect = async () => {
  connecting.value = true;
  errorMessage.value = null;

  try {
    const currentSessionId = props.sessionId || `session-${Date.now()}`;

    listen('ssh-output', (event: { payload: { sessionId: string, output: string } }) => {
      if (event.payload.sessionId === currentSessionId && terminal) {
        terminal.write(event.payload.output);
      }
    }).then((unlisten) => {
      eventUnlisten = unlisten;
    }).catch((error) => {
      console.error('监听SSH输出失败:', error);
    });

    listen('ssh-connection-status', (event: { payload: { sessionId: string, status: 'connected' | 'disconnected' | 'error' } }) => {
      if (event.payload.sessionId === currentSessionId) {
        if (event.payload.status === 'connected') {
          connected.value = true;
          connecting.value = false;
          if (props.initialCommand) {
            setTimeout(() => sendCommand(props.initialCommand), 300);
          }
        } else if (event.payload.status === 'disconnected') {
          connected.value = false;
          connecting.value = false;
        } else if (event.payload.status === 'error') {
          connected.value = false;
          connecting.value = false;
          errorMessage.value = '连接异常';
        }
      }
    }).then((unlisten) => {
      connectionStatusListener = unlisten;
    }).catch((error) => {
      console.error('监听连接状态失败:', error);
    });

    await invoke('connect_ssh_server', {
      config: {
        server_id: props.serverId,
        session_id: currentSessionId,
        host: props.host || '',
        port: props.port,
        username: props.username || '',
        auth_type: props.authType || 'password',
        password: props.password || '',
        private_key_path: props.privateKeyPath || '',
        passphrase: props.passphrase || ''
      }
    });

    connecting.value = false;
    connected.value = true;
    sessionId = currentSessionId;
  } catch (error) {
    console.error('连接失败:', error);
    connecting.value = false;
    connected.value = false;

    if (error instanceof Object && 'message' in error) {
      errorMessage.value = `连接失败: ${(error as Error).message}`;
    } else {
      errorMessage.value = `连接失败: ${String(error)}`;
    }

    if (terminal) {
      terminal.writeln(`连接失败: ${(error as Error)?.message || '未知错误'}`);
    }
  }
};

const reconnect = async () => {
  if (eventUnlisten) {
    await eventUnlisten();
    eventUnlisten = null;
  }
  if (connectionStatusListener) {
    await connectionStatusListener();
    connectionStatusListener = null;
  }
  await connect();
};

const disconnect = async () => {
  if (!props.sessionId) return;

  try {
    await invoke('disconnect_ssh_server', {
      serverId: props.serverId,
      sessionId: props.sessionId
    });
    connected.value = false;
    connecting.value = false;
  } catch (error) {
    console.error('断开连接失败:', error);
  }
};

const handleResize = () => {
  if (fitAddon) {
    fitAddon.fit();
  }
};

const refreshLayout = () => {
  handleResize();
};

onMounted(async () => {
  await initTerminal();
  await connect();

  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);

  if (terminal) {
    terminal.dispose();
    terminal = null;
    fitAddon = null;
  }

  if (eventUnlisten) {
    eventUnlisten();
    eventUnlisten = null;
  }

  if (connectionStatusListener) {
    connectionStatusListener();
    connectionStatusListener = null;
  }
});

watch(
  [
    () => props.host,
    () => props.port,
    () => props.username,
    () => props.authType,
    () => props.password,
    () => props.privateKeyPath,
    () => props.passphrase,
  ],
  () => {
    if (props.host && props.port) {
      reconnect();
    }
  },
  { flush: 'sync' }
);

watch(
  () => props.themeName,
  (name) => {
    containerStyle.value = getThemeContainerStyle(name);
    if (!terminal || !terminal.element || !terminal.element.isConnected) {
      return;
    }
    nextTick(() => {
      if (!terminal || !terminal.element || !terminal.element.isConnected) {
        return;
      }
      terminal.options.theme = getTheme(name || 'midnight');
      requestAnimationFrame(() => {
        if (terminal && terminal.element && terminal.element.isConnected) {
          terminal.refresh(0, Math.max(0, terminal.rows - 1));
        }
      });
    });
  }
);

defineExpose({
  refreshLayout,
  reconnect,
  disconnect,
  sendCommand,
});
</script>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  position: relative;
  padding: 10px;
}

.terminal {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.connecting-overlay,
.disconnected-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  z-index: 10;
}

.disconnected-overlay p {
  margin-bottom: 15px;
  text-align: center;
}

.reconnect-btn {
  margin-top: 10px;
  padding: 8px 16px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.reconnect-btn:hover {
  background-color: #66b1ff;
}
</style>

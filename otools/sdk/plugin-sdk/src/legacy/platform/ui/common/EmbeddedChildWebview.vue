<template>
  <div ref="hostRef" class="embedded-webview-host">
    <div v-if="showPlaceholder" class="embedded-webview-placeholder">
      <slot name="placeholder">
        <div class="embedded-webview-placeholder-badge" :class="`is-${placeholderState}`">
          {{ placeholderBadgeText }}
        </div>
        <h3>{{ placeholderTitle || title || '正在打开页面' }}</h3>
        <p>{{ placeholderDescriptionText }}</p>
        <button
          v-if="isTauriRuntime"
          type="button"
          class="embedded-webview-retry"
          :disabled="manualReloading"
          @click="reload(true)"
        >
          {{ manualReloading ? '重试中...' : '重新加载' }}
        </button>
      </slot>
    </div>

    <iframe
      v-else
      :key="frameKey"
      class="embedded-webview-iframe"
      :src="url"
      frameborder="0"
      allow="clipboard-read; clipboard-write"
    />
  </div>
</template>

<script setup lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const DEFAULT_MIN_SIZE = 24;
const KEEP_ALIVE_INTERVAL = 1200;

const props = defineProps<{
  label: string;
  title: string;
  url: string;
  visible: boolean;
  placeholderTitle?: string;
  placeholderDescription?: string;
  minSize?: number;
}>();

const isTauriRuntime = isTauri();
const hostRef = ref<HTMLElement | null>(null);
const frameKey = ref(0);
const normalizedUrl = computed(() => String(props.url || '').trim());
const minSize = computed(() => Math.max(Number(props.minSize || DEFAULT_MIN_SIZE), DEFAULT_MIN_SIZE));
const webviewLabels = computed(() => (normalizedUrl.value && props.label ? [props.label] : []));
const webviewReady = ref(false);
const syncError = ref('');
const manualReloading = ref(false);

const placeholderState = computed<'loading' | 'error'>(() => (syncError.value ? 'error' : 'loading'));
const placeholderBadgeText = computed(() => (syncError.value ? '加载异常' : '加载中'));
const placeholderDescriptionText = computed(() => {
  if (syncError.value) {
    return `${syncError.value}。你可以点击下方重新加载。`;
  }
  return props.placeholderDescription || '页面正在附着到当前区域，如果首次未显示会自动继续重试。';
});
const showPlaceholder = computed(() => (isTauriRuntime ? !webviewReady.value : false));

let resizeObserver: ResizeObserver | null = null;
let overlayObserver: MutationObserver | null = null;
let syncScheduled = false;
let syncInFlight = false;
let lastLoadedUrl = '';
let overlayCheckScheduled = false;
let overlaySuspended = false;
let keepAliveTimer: number | null = null;

const isDocumentVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

const isElementTreeVisible = (element: HTMLElement | null) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  if (!element || !element.isConnected || !document.contains(element)) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || style.contentVisibility === 'hidden'
    ) {
      return false;
    }
    current = current.parentElement;
  }

  return element.getClientRects().length > 0;
};

const shouldDisplayEmbeddedWebview = () =>
  Boolean(
    props.label
    && normalizedUrl.value
    && props.visible
    && !overlaySuspended
    && isDocumentVisible()
    && isElementTreeVisible(hostRef.value),
  );

const hasVisibleElementPlusLayers = () => {
  const floatingLayers = document.querySelectorAll<HTMLElement>('.el-overlay');
  for (const layer of floatingLayers) {
    const style = window.getComputedStyle(layer);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }
    if (layer.getClientRects().length > 0) {
      return true;
    }
  }
  return false;
};

const syncBounds = async () => {
  if (!isTauriRuntime) {
    return;
  }

  if (!shouldDisplayEmbeddedWebview()) {
    webviewReady.value = false;
    await hideWebview();
    return;
  }

  if (syncInFlight) {
    return;
  }

  syncInFlight = true;
  try {
    await ensureWebview();
    await nextTick();

    const rect = hostRef.value?.getBoundingClientRect();
    const x = Math.max(0, Math.round(rect?.left ?? 0));
    const y = Math.max(0, Math.round(rect?.top ?? 0));
    const width = Math.max(0, Math.round(rect?.width ?? 0));
    const height = Math.max(0, Math.round(rect?.height ?? 0));

    if (width < minSize.value || height < minSize.value) {
      webviewReady.value = false;
      scheduleSyncWithRetry();
      return;
    }

    await invoke('switch_and_position_embedded_webviews', {
      activeLabel: props.label,
      allLabels: webviewLabels.value,
      x,
      y,
      width,
      height,
    });
    webviewReady.value = true;
    syncError.value = '';
  } catch (error) {
    webviewReady.value = false;
    syncError.value = String(error || '同步内嵌页面失败');
    console.error('[EmbeddedChildWebview] sync failed', error);
    scheduleSyncWithRetry();
  } finally {
    syncInFlight = false;
  }
};

const scheduleSync = () => {
  if (!isTauriRuntime || syncScheduled) {
    return;
  }

  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    void syncBounds();
  });
};

const scheduleSyncWithRetry = () => {
  scheduleSync();
  window.setTimeout(scheduleSync, 32);
  window.setTimeout(scheduleSync, 180);
  window.setTimeout(scheduleSync, 640);
  window.setTimeout(scheduleSync, 1200);
  window.setTimeout(scheduleSync, 2400);
};

const applyOverlaySuspendedState = async () => {
  if (!isTauriRuntime) {
    return;
  }

  const next = hasVisibleElementPlusLayers();
  if (overlaySuspended === next) {
    return;
  }

  overlaySuspended = next;
  if (overlaySuspended) {
    await hideWebview();
    return;
  }

  await syncRuntimeVisibilityState();
};

const scheduleOverlayStateSync = () => {
  if (!isTauriRuntime || overlayCheckScheduled) {
    return;
  }

  overlayCheckScheduled = true;
  requestAnimationFrame(() => {
    overlayCheckScheduled = false;
    void applyOverlaySuspendedState();
  });
};

const ensureWebview = async (forceRecreate = false) => {
  if (!isTauriRuntime || !props.label || !normalizedUrl.value) {
    return;
  }

  const exists = await invoke<boolean>('embedded_webview_exists', { label: props.label });
  const urlChanged = Boolean(lastLoadedUrl) && lastLoadedUrl !== normalizedUrl.value;
  const shouldRecreate = exists && (forceRecreate || urlChanged);

  if (shouldRecreate) {
    await invoke('close_embedded_webview', { label: props.label });
    webviewReady.value = false;
  }

  if (!exists || shouldRecreate) {
    await invoke('create_embedded_webview', {
      label: props.label,
      title: props.title,
      url: normalizedUrl.value,
    });
  }

  lastLoadedUrl = normalizedUrl.value;
};

const stopKeepAliveLoop = () => {
  if (keepAliveTimer !== null) {
    window.clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
};

const startKeepAliveLoop = () => {
  stopKeepAliveLoop();
  if (!isTauriRuntime || !props.label || !normalizedUrl.value || !props.visible) {
    return;
  }
  keepAliveTimer = window.setInterval(() => {
    if (!shouldDisplayEmbeddedWebview()) {
      webviewReady.value = false;
      void hideWebview();
      return;
    }
    scheduleSync();
  }, KEEP_ALIVE_INTERVAL);
};

const syncRuntimeVisibilityState = async () => {
  if (!isTauriRuntime) {
    return;
  }

  if (!shouldDisplayEmbeddedWebview()) {
    stopKeepAliveLoop();
    webviewReady.value = false;
    await hideWebview();
    return;
  }

  startKeepAliveLoop();
  scheduleSyncWithRetry();
};

const hideWebview = async () => {
  if (!isTauriRuntime || !props.label || webviewLabels.value.length === 0) {
    return;
  }

  try {
    await invoke('switch_and_position_embedded_webviews', {
      activeLabel: null,
      allLabels: webviewLabels.value,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  } catch (error) {
    console.error('[EmbeddedChildWebview] hide failed', error);
  }
};

const reload = async (fromUser = false) => {
  if (!isTauriRuntime) {
    frameKey.value += 1;
    return;
  }

  if (fromUser) {
    manualReloading.value = true;
  }
  webviewReady.value = false;
  syncError.value = '';
  try {
    await ensureWebview(true);
    startKeepAliveLoop();
    scheduleSyncWithRetry();
  } catch (error) {
    syncError.value = String(error || '刷新内嵌页面失败');
    console.error('[EmbeddedChildWebview] reload failed', error);
  } finally {
    if (fromUser) {
      manualReloading.value = false;
    }
  }
};

watch(
  () => props.visible,
  async (value) => {
    if (value) {
      await syncRuntimeVisibilityState();
      return;
    }
    await syncRuntimeVisibilityState();
  },
);

watch(
  () => props.url,
  async () => {
    if (!normalizedUrl.value) {
      stopKeepAliveLoop();
      webviewReady.value = false;
      await hideWebview();
      return;
    }
    if (props.visible) {
      syncError.value = '';
      await syncRuntimeVisibilityState();
    }
  },
);

const handleDocumentVisibilityChange = () => {
  void syncRuntimeVisibilityState();
};

onMounted(() => {
  if (isTauriRuntime) {
    resizeObserver = new ResizeObserver(() => {
      scheduleSyncWithRetry();
    });
    if (hostRef.value) {
      resizeObserver.observe(hostRef.value);
    }
    window.addEventListener('resize', scheduleSyncWithRetry);
    window.addEventListener('scroll', scheduleSyncWithRetry, true);
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
    overlayObserver = new MutationObserver(() => {
      scheduleOverlayStateSync();
    });
    overlayObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style'],
    });
    scheduleOverlayStateSync();
    startKeepAliveLoop();
    scheduleSyncWithRetry();
    return;
  }

  frameKey.value += 1;
});

onBeforeUnmount(async () => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  overlayObserver?.disconnect();
  overlayObserver = null;
  stopKeepAliveLoop();
  window.removeEventListener('resize', scheduleSyncWithRetry);
  window.removeEventListener('scroll', scheduleSyncWithRetry, true);
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);

  if (!isTauriRuntime || !props.label) {
    return;
  }

  try {
    await invoke('close_embedded_webview', { label: props.label });
  } catch (error) {
    console.error('[EmbeddedChildWebview] close failed', error);
  }
});

defineExpose({
  reload,
});
</script>

<style scoped>
.embedded-webview-host {
  position: relative;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.embedded-webview-placeholder,
.embedded-webview-iframe {
  width: 100%;
  height: 100%;
}

.embedded-webview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}

.embedded-webview-placeholder-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  background: color-mix(in srgb, var(--el-fill-color-light) 72%, transparent);
  color: var(--el-text-color-secondary);
}

.embedded-webview-placeholder-badge.is-loading {
  color: var(--el-color-primary);
}

.embedded-webview-placeholder-badge.is-error {
  color: var(--el-color-danger);
}

.embedded-webview-placeholder h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.embedded-webview-placeholder p {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.6;
}

.embedded-webview-retry {
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
}

.embedded-webview-retry:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.embedded-webview-iframe {
  display: block;
  border: 0;
  background: #fff;
}
</style>

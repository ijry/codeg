<template>
  <div class="dev-standalone">
    <div class="dev-standalone-header">
      <div>
        <div class="dev-standalone-title">{{ t('title') }}</div>
        <div class="dev-standalone-subtitle">
          {{ t('subtitle') }}
        </div>
      </div>
      <div class="dev-standalone-actions">
        <el-button size="small" @click="pickStandaloneBuildDir">{{ t('pickDir') }}</el-button>
        <el-button size="small" type="primary" :loading="building" @click="buildStandaloneNative">
          {{ t('build') }}
        </el-button>
      </div>
    </div>
    <div class="dev-standalone-path">
      {{ t('currentDir') }}<span>{{ standaloneDir || t('unselected') }}</span>
    </div>
    <pre class="dev-standalone-output">{{ outputText }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { ElMessage } from 'element-plus';
import { useI18nScope } from '@/platform/i18n';
const { t } = useI18nScope('dev.standalone');

interface DevNativeBuildJobStart {
  jobId: string;
}

interface DevNativeBuildJobSnapshot {
  jobId: string;
  running: boolean;
  success?: boolean | null;
  log: string;
  message: string;
  error: string;
}

const standaloneDir = ref('');
const output = ref('');
const building = ref(false);

const outputText = computed(() => {
  const text = String(output.value || '').trim();
  return text || t('emptyOutput');
});

const pickStandaloneBuildDir = async () => {
  try {
    const selected = await openDialog({
      title: t('selectDirTitle'),
      multiple: false,
      directory: true,
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }
    standaloneDir.value = selected;
    output.value = '';
  } catch (error) {
    ElMessage.error(t('pickDirFailed', { message: String(error) }));
  }
};

const buildStandaloneNative = async () => {
  const dir = standaloneDir.value.trim();
  if (!dir) {
    ElMessage.warning(t('pickDirRequired'));
    return;
  }
  building.value = true;
  output.value = `${t('building')}\n`;
  try {
    const started = await invoke<DevNativeBuildJobStart>('dev_start_native_artifact_build_from_dir', {
      directoryPath: dir,
    });
    let lastLogLength = 0;
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const snapshot = await invoke<DevNativeBuildJobSnapshot>('dev_get_native_build_job', {
        jobId: started.jobId,
      });
      const log = String(snapshot.log || '');
      if (log.length > lastLogLength) {
        output.value += log.slice(lastLogLength);
      }
      lastLogLength = log.length;
      if (snapshot.running) {
        continue;
      }
      if (snapshot.success) {
        ElMessage.success(t('buildCompleted'));
        return;
      }
      throw new Error(snapshot.error || t('buildFailed', { message: '' }));
    }
  } catch (error) {
    output.value += `\n${String(error)}`;
    ElMessage.error(t('buildFailed', { message: String(error) }));
  } finally {
    building.value = false;
  }
};
</script>

<style scoped lang="scss">
.dev-standalone {
  border: 1px solid var(--el-border-color-light);
  border-radius: 16px;
  padding: 14px 16px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dev-standalone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-standalone-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.dev-standalone-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dev-standalone-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dev-standalone-path {
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.dev-standalone-path span {
  color: var(--el-text-color-primary);
}

.dev-standalone-output {
  margin: 0;
  min-height: 72px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(
    --el-font-family-monospace,
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    "Courier New",
    monospace
  );
}
</style>

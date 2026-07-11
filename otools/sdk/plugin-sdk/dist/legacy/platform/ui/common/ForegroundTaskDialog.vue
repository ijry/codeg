<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="760px"
    top="8vh"
    destroy-on-close
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <div class="task-toolbar">
      <el-tag :type="hasError ? 'danger' : (running ? 'warning' : 'success')" effect="plain" size="small">
        {{ hasError ? '检测到错误' : (running ? '执行中' : '已结束') }}
      </el-tag>
      <span class="task-status">{{ statusText || '等待任务输出...' }}</span>
      <el-button
        v-if="showOpenTerminal"
        size="small"
        plain
        :loading="openTerminalBusy"
        @click="emit('open-terminal')"
      >
        {{ openTerminalText || '系统终端执行' }}
      </el-button>
      <el-button size="small" plain :loading="loading" @click="emit('refresh')">刷新</el-button>
    </div>

    <el-alert
      v-if="hasError"
      class="task-alert"
      type="error"
      :closable="false"
      show-icon
      :title="errorHint || '日志检测到 error/failed，请检查详情后重试。'"
    />

    <el-alert
      v-if="tipText"
      class="task-alert task-tip"
      type="info"
      :closable="false"
      show-icon
      :title="tipText"
    />

    <el-input
      :model-value="logText || '暂无日志输出'"
      type="textarea"
      :rows="18"
      resize="vertical"
      readonly
      class="task-log"
    />

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">{{ closeText || '关闭' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  title: string;
  loading: boolean;
  running: boolean;
  hasError: boolean;
  statusText: string;
  logText: string;
  tipText?: string;
  errorHint?: string;
  showOpenTerminal?: boolean;
  openTerminalBusy?: boolean;
  openTerminalText?: string;
  closeText?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'refresh'): void;
  (event: 'open-terminal'): void;
}>();
</script>

<style scoped>
.task-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.task-status {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.task-log :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.task-alert {
  margin-bottom: 10px;
}

.task-tip {
  margin-top: 0;
}
</style>

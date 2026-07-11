<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="1080px"
    top="4vh"
    class="fs-window"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <div class="fs-window__layout" v-loading="loading">
      <aside class="fs-window__sidebar">
        <div class="fs-window__sidebar-title">{{ t('platform.remoteFileDialog.locations') }}</div>
        <button
          v-for="root in roots"
          :key="root.path"
          type="button"
          class="fs-window__root-item"
          :class="{ 'is-active': currentPath === root.path }"
          @click="navigate(root.path)"
        >
          <span class="fs-window__root-name">{{ root.name }}</span>
          <span class="fs-window__root-path">{{ root.path }}</span>
        </button>
      </aside>

      <section class="fs-window__main">
        <div class="fs-window__toolbar">
          <el-button size="small" text :disabled="!parentPath || loading" @click="goParent">
            {{ t('platform.remoteFileDialog.parent') }}
          </el-button>
          <el-input
            v-model="pathInput"
            size="small"
            class="fs-window__path-input"
            :placeholder="t('platform.remoteFileDialog.pathPlaceholder')"
            @keyup.enter="navigate(pathInput)"
          />
          <el-button size="small" @click="navigate(pathInput)">{{ t('platform.remoteFileDialog.open') }}</el-button>
          <el-button size="small" text :loading="loading" @click="refresh">{{ t('platform.remoteFileDialog.refresh') }}</el-button>
        </div>

        <div class="fs-window__location">
          <div class="fs-window__current-path">{{ currentPath || '-' }}</div>
          <div v-if="focusedName" class="fs-window__focused-name">{{ t('platform.fsWindow.focusedItem', { name: focusedName }) }}</div>
        </div>

        <div class="fs-window__list">
          <div class="fs-window__list-head">
            <span class="fs-window__list-name">{{ t('platform.remoteFileDialog.name') }}</span>
            <span class="fs-window__list-meta">{{ t('platform.remoteFileDialog.typeAndSize') }}</span>
          </div>

          <button
            v-for="entry in entries"
            :key="entry.path"
            type="button"
            class="fs-window__entry"
            :class="{
              'is-active': activePath === entry.path,
              'is-directory': entry.kind === 'directory',
            }"
            @click="handleEntryClick(entry)"
            @dblclick="handleEntryDoubleClick(entry)"
          >
            <span class="fs-window__entry-main">
              <span class="fs-window__entry-icon">
                {{ entry.kind === 'directory' ? 'DIR' : 'FILE' }}
              </span>
              <span class="fs-window__entry-name">{{ entry.name }}</span>
            </span>
            <span class="fs-window__entry-meta">
              {{ entry.kind === 'directory' ? t('platform.remoteFileDialog.directory') : formatFileMeta(entry) }}
            </span>
          </button>

          <div v-if="!loading && entries.length === 0" class="fs-window__empty">
            {{ t('platform.fsWindow.empty') }}
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="fs-window__footer">
        <span class="fs-window__footer-summary">{{ footerSummary }}</span>
        <div class="fs-window__footer-actions">
          <el-button size="small" @click="handleClose">{{ t('platform.remoteFileDialog.cancel') }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@/platform/i18n'
import { browseHostDialog } from '@/utils/hostFs'
import type { FsWindowRequest } from '@/platform/ui/fsWindow'

interface FsWindowEntry {
  name: string
  path: string
  kind: 'directory' | 'file'
  size?: number
  mime?: string
  lastModified?: number | null
}

interface FsWindowRoot {
  name: string
  path: string
}

interface FsWindowBrowsePayload {
  currentPath: string
  parentPath?: string | null
  fileName?: string | null
  roots: FsWindowRoot[]
  entries: FsWindowEntry[]
}

const props = defineProps<{
  request: FsWindowRequest
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'error', reason: unknown): void
}>()

const visible = ref(true)
const loading = ref(false)
const currentPath = ref('')
const parentPath = ref('')
const pathInput = ref('')
const roots = ref<FsWindowRoot[]>([])
const entries = ref<FsWindowEntry[]>([])
const activePath = ref('')
const focusedName = ref('')
const initialized = ref(false)
const closed = ref(false)

const dialogTitle = computed(() => {
  const title = String(props.request.title || '').trim()
  return title || t('platform.fsWindow.title')
})

const footerSummary = computed(() => {
  if (activePath.value) {
    return activePath.value
  }
  if (focusedName.value) {
    return t('platform.fsWindow.focusedItem', { name: focusedName.value })
  }
  return currentPath.value || '-'
})

const formatFileMeta = (entry: FsWindowEntry): string => {
  const bytes = Number(entry.size || 0)
  if (bytes <= 0) {
    return entry.mime || t('platform.remoteFileDialog.file')
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const handleBrowseError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || t('platform.remoteFileDialog.readFailed'))
  ElMessage.error(message)
  emit('error', error)
  if (!initialized.value) {
    handleClose()
  }
}

const loadDirectory = async (path?: string) => {
  loading.value = true
  try {
    const response = await browseHostDialog({ path }) as FsWindowBrowsePayload
    currentPath.value = response.currentPath || ''
    parentPath.value = response.parentPath || ''
    pathInput.value = response.currentPath || ''
    roots.value = response.roots || []
    entries.value = response.entries || []
    focusedName.value = String(response.fileName || '').trim()

    const focusedEntry = focusedName.value
      ? entries.value.find((entry) => entry.name === focusedName.value)
      : null

    activePath.value = focusedEntry?.path || ''
    initialized.value = true
  } catch (error) {
    handleBrowseError(error)
  } finally {
    loading.value = false
  }
}

const navigate = async (path?: string) => {
  const target = String(path || '').trim()
  if (!target && currentPath.value) {
    return
  }
  await loadDirectory(target || props.request.defaultPath)
}

const refresh = async () => {
  await loadDirectory(currentPath.value || props.request.defaultPath)
}

const goParent = async () => {
  if (!parentPath.value) {
    return
  }
  await loadDirectory(parentPath.value)
}

const handleEntryClick = (entry: FsWindowEntry) => {
  activePath.value = entry.path
  focusedName.value = entry.name
}

const handleEntryDoubleClick = async (entry: FsWindowEntry) => {
  activePath.value = entry.path
  focusedName.value = entry.name
  if (entry.kind === 'directory') {
    await loadDirectory(entry.path)
  }
}

const handleClose = () => {
  if (closed.value) {
    return
  }
  closed.value = true
  visible.value = false
  emit('close')
}

onMounted(() => {
  void loadDirectory(props.request.defaultPath)
})
</script>

<style scoped>
.fs-window :deep(.el-dialog__body) {
  padding-top: 12px;
}

.fs-window__layout {
  display: flex;
  min-height: 64vh;
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
}

.fs-window__sidebar {
  width: 240px;
  flex: 0 0 240px;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
  padding: 12px;
  overflow: auto;
}

.fs-window__sidebar-title {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.fs-window__root-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px 12px;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.fs-window__root-item:hover,
.fs-window__root-item.is-active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.fs-window__root-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.fs-window__root-path {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.fs-window__main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.fs-window__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fs-window__path-input {
  flex: 1;
  min-width: 0;
}

.fs-window__location {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fs-window__current-path,
.fs-window__focused-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.fs-window__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.fs-window__list-head,
.fs-window__entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fs-window__list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-light);
}

.fs-window__list-name,
.fs-window__entry-main {
  min-width: 0;
  flex: 1;
}

.fs-window__list-meta,
.fs-window__entry-meta {
  width: 160px;
  flex: 0 0 160px;
  text-align: right;
}

.fs-window__entry {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.fs-window__entry:hover,
.fs-window__entry.is-active {
  background: var(--el-color-primary-light-9);
}

.fs-window__entry-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fs-window__entry-icon {
  width: 40px;
  flex: 0 0 40px;
  font-size: 11px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.fs-window__entry-name {
  min-width: 0;
  flex: 1;
  text-align: left;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.fs-window__entry-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.fs-window__empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.fs-window__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fs-window__footer-summary {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fs-window__footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

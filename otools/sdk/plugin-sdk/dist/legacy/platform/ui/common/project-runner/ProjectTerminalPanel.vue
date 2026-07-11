<template>
  <div class="git-term-panel">
    <div class="term-tabs">
      <div class="term-tabs-scroll">
        <div
          v-for="tab in terminalTabs"
          :key="tab.id"
          class="term-tab"
          :class="{ active: activeTabId === tab.id }"
          @click="switchTab(tab.id)"
        >
          <span class="term-tab-title">{{ tab.name }}</span>
          <el-icon class="term-tab-close" @click.stop="closeTab(tab.id)">
            <Close />
          </el-icon>
        </div>
        <div class="term-tab add-tab" @click="() => addTerminal()">+</div>
      </div>
      <div class="term-tabs-right-tools">
        <el-dropdown trigger="click" @command="handleThemeChange">
          <el-button class="theme-switch-btn" size="small" text>
            {{ themeSelectionLabel }}
            <el-icon class="theme-switch-icon"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="theme in themeOptions"
                :key="theme"
                :command="theme"
                :class="{ 'is-active-theme': themeSelection === theme }"
              >
                {{ themeOptionLabel(theme) }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="term-content" :style="currentThemeContainerStyle">
      <div v-if="terminalTabs.length === 0" class="empty-panel">
        <el-empty :description="emptyText" />
      </div>

      <div v-else class="terminal-wrapper">
        <div
          v-for="tab in terminalTabs"
          :key="tab.id"
          v-show="activeTabId === tab.id"
          class="terminal-instance"
        >
          <LocalTerminalView
            :ref="(el) => setTerminalRef(tab.id, el)"
            :session-id="tab.sessionId"
            :working-dir="tab.workingDir"
            :theme-name="effectiveThemeName"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElEmpty, ElIcon } from 'element-plus'
import { ArrowDown, Close } from '@element-plus/icons-vue'
import LocalTerminalView from '@/platform/ui/common/LocalTerminalView.vue'
import {
  ACCENT_LIGHT_THEME,
  getProjectTerminalContainerStyle,
  projectTerminalThemes,
} from './themes'
import type {
  ProjectTerminalPanelExpose,
  ProjectTerminalTab,
  ProjectTerminalViewInstance,
} from './terminal'

interface Props {
  workingDir?: string
  emptyText?: string
  defaultThemeName?: string
  defaultThemeLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  workingDir: '',
  emptyText: 'No terminal tabs',
  defaultThemeName: 'default',
  defaultThemeLabel: 'Default',
})

const terminalTabs = ref<ProjectTerminalTab[]>([])
const activeTabId = ref('')
const terminalRefs = ref<Record<string, ProjectTerminalViewInstance | null>>({})
const DARK_MODE_DEFAULT_THEME = 'nord'
const LIGHT_MODE_DEFAULT_THEME = ACCENT_LIGHT_THEME
const themeSelection = ref<string>(props.defaultThemeName)
const isAppDarkMode = ref(false)
let appThemeObserver: MutationObserver | null = null
let terminalIndex = 1

const syncAppTheme = () => {
  if (typeof document === 'undefined') {
    isAppDarkMode.value = false
    return
  }
  isAppDarkMode.value = document.documentElement.classList.contains('dark')
}

const effectiveThemeName = computed(() => {
  if (themeSelection.value !== props.defaultThemeName) {
    return themeSelection.value
  }
  return isAppDarkMode.value ? DARK_MODE_DEFAULT_THEME : LIGHT_MODE_DEFAULT_THEME
})

const themeOptions = computed(() => [props.defaultThemeName, ...Object.keys(projectTerminalThemes)])
const themeSelectionLabel = computed(() => themeOptionLabel(themeSelection.value))
const themeOptionLabel = (theme: string) =>
  theme === props.defaultThemeName ? props.defaultThemeLabel : theme
const currentThemeContainerStyle = computed(() =>
  getProjectTerminalContainerStyle(effectiveThemeName.value),
)

const generateSessionId = () =>
  `git-local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const normalizeWorkingDir = (value?: string) => String(value || '').trim()

const buildTerminalTabName = (workingDir?: string) => {
  const normalized = normalizeWorkingDir(workingDir)
  if (!normalized) {
    return `Terminal ${terminalIndex++}`
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean)
  const tail = segments[segments.length - 1]
  return tail || `Terminal ${terminalIndex++}`
}

const setTerminalRef = (tabId: string, el: unknown) => {
  terminalRefs.value[tabId] = (el as ProjectTerminalViewInstance | null) || null
}

const handleThemeChange = (theme: string) => {
  themeSelection.value = theme
}

const ensureActiveTerminalView = async (): Promise<ProjectTerminalViewInstance | null> => {
  if (terminalTabs.value.length === 0) {
    addTerminal()
  }

  if (!activeTabId.value && terminalTabs.value.length > 0) {
    activeTabId.value = terminalTabs.value[0].id
  }

  await nextTick()
  const activeId = activeTabId.value
  if (!activeId) return null
  return terminalRefs.value[activeId] || null
}

const ensureTerminalTabForWorkingDir = async (
  workingDir?: string,
): Promise<ProjectTerminalViewInstance | null> => {
  const normalizedDir = normalizeWorkingDir(workingDir)
  if (!normalizedDir) {
    return ensureActiveTerminalView()
  }

  const matchedTab = terminalTabs.value.find(
    (tab) => normalizeWorkingDir(tab.workingDir) === normalizedDir,
  )
  if (matchedTab) {
    activeTabId.value = matchedTab.id
    await nextTick()
    return terminalRefs.value[matchedTab.id] || null
  }

  const nextTabId = addTerminal({
    name: buildTerminalTabName(normalizedDir),
    workingDir: normalizedDir,
    activate: true,
  })
  await nextTick()
  return terminalRefs.value[nextTabId] || null
}

const runCommand = async (command: string, workingDir?: string) => {
  const normalizedCommand = command.trim()
  if (!normalizedCommand) return

  const terminalView = await ensureTerminalTabForWorkingDir(workingDir)
  if (!terminalView?.executeCommand) {
    throw new Error('Terminal is not ready')
  }

  await terminalView.executeCommand(normalizedCommand)
}

const refreshActiveTerminalLayout = async () => {
  if (!activeTabId.value) return
  await nextTick()
  const view = terminalRefs.value[activeTabId.value]
  if (view?.refreshLayout) {
    await view.refreshLayout()
  }
}

const addTerminal = (options: { name?: string; workingDir?: string; activate?: boolean } = {}) => {
  const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const resolvedWorkingDir = normalizeWorkingDir(options.workingDir ?? props.workingDir)
  const tab: ProjectTerminalTab = {
    id,
    name: options.name || buildTerminalTabName(resolvedWorkingDir),
    sessionId: generateSessionId(),
    workingDir: resolvedWorkingDir,
  }
  terminalTabs.value.push(tab)
  if (options.activate !== false) {
    activeTabId.value = id
    void refreshActiveTerminalLayout()
  }
  return id
}

const switchTab = (tabId: string) => {
  activeTabId.value = tabId
  void refreshActiveTerminalLayout()
}

const closeTab = (tabId: string) => {
  const index = terminalTabs.value.findIndex((tab) => tab.id === tabId)
  if (index === -1) return

  const isActive = activeTabId.value === tabId
  terminalTabs.value.splice(index, 1)
  delete terminalRefs.value[tabId]

  if (terminalTabs.value.length === 0) {
    activeTabId.value = ''
    return
  }

  if (isActive) {
    const nextIndex = Math.max(0, index - 1)
    activeTabId.value = terminalTabs.value[nextIndex].id
    void refreshActiveTerminalLayout()
  }
}

const openTab = (name?: string, workingDir?: string) =>
  addTerminal({ name, workingDir, activate: true })

const appendOutput = async (tabId: string, output: string) => {
  if (!tabId) return
  await nextTick()
  const view = terminalRefs.value[tabId]
  view?.writeOutput?.(output)
}

onMounted(() => {
  syncAppTheme()
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    appThemeObserver = new MutationObserver(() => {
      syncAppTheme()
    })
    appThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
  addTerminal()
})

onUnmounted(() => {
  if (appThemeObserver) {
    appThemeObserver.disconnect()
    appThemeObserver = null
  }
})

defineExpose<ProjectTerminalPanelExpose>({
  runCommand,
  openTab,
  appendOutput,
})
</script>

<style scoped>
.git-term-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--layout-border-color);
  overflow: hidden;
}

.dark .git-term-panel {
  background: var(--layout-border-color);
}

.term-tabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #ebeef5;
  background: #f1f5f9;
}

.dark .term-tabs {
  background: var(--layout-border-color);
  border-bottom: 1px solid var(--layout-border-color);
}

.term-tabs-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  overflow-x: auto;
}

.term-tabs-right-tools {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 8px;
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
}

.dark .term-tabs-right-tools {
  background: var(--layout-border-color);
  border-left: 1px solid var(--layout-border-color);
}

.theme-switch-btn {
  height: 24px;
  padding: 0 6px;
  color: #475569;
  font-size: 12px;
}

.dark .theme-switch-btn {
  color: var(--el-color-primary);
}

.theme-switch-icon {
  margin-left: 4px;
  font-size: 12px;
}

:deep(.is-active-theme) {
  color: var(--el-color-primary);
  font-weight: 600;
}

.term-tab {
  height: 30px;
  min-width: 120px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  border-right: 1px solid #e2e8f0;
  user-select: none;
}

.dark .term-tab {
  color: var(--el-color-primary);
  border-right: 1px solid var(--layout-border-color);
}

.term-tab.active {
  background: #ffffff;
  color: #111827;
}

.dark .term-tab.active {
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.term-tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.term-tab-close {
  color: #94a3b8;
  font-size: 13px;
}

.term-tab-close:hover {
  color: #ef4444;
}

.add-tab {
  min-width: 42px;
  justify-content: center;
  font-size: 16px;
}

.term-content {
  flex: 1;
  min-height: 0;
  background: #111827;
}

.empty-panel {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.terminal-wrapper {
  height: 100%;
}

.terminal-instance {
  height: 100%;
}
</style>

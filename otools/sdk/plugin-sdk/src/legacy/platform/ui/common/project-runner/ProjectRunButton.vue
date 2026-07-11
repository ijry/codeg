<template>
  <div class="run-project-container">
    <el-dropdown
      v-if="hasPackageJson && scripts.length > 0"
      :disabled="disabled"
      trigger="click"
      @command="handleCommand"
    >
      <el-button
        type="primary"
        size="small"
        :disabled="disabled"
        :title="buttonTitle"
      >
        {{ resolvedButtonText }}
        <template #icon>
          <el-icon><VideoPlay /></el-icon>
        </template>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu style="max-height: 300px; overflow-y: auto;">
          <template v-for="(group, groupIndex) in groupedScripts" :key="group.prefix">
            <el-dropdown-item
              class="script-group-title"
              disabled
              :divided="groupIndex > 0"
            >
              {{ group.prefix }}
            </el-dropdown-item>
            <el-dropdown-item
              v-for="script in group.items"
              :key="script.name"
              :command="script.name"
            >
              <span class="script-name">{{ commandPrefix }}{{ script.name }}</span>
            </el-dropdown-item>
          </template>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { VideoPlay } from '@element-plus/icons-vue'
import {
  buildProjectScriptCommand,
  groupProjectScripts,
  readProjectScripts,
} from '@/platform/services/project-runner/packageScripts'
import type {
  ProjectRunLoadError,
  ProjectRunTarget,
  ProjectScriptGroup,
  ProjectScriptInfo,
} from '@/platform/services/project-runner/types'

interface Props {
  workingDir?: string
  target?: ProjectRunTarget
  autoLoad?: boolean
  disabled?: boolean
  buttonText?: string
  builtinTitle?: string
  systemTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  workingDir: '',
  target: 'builtin-terminal',
  autoLoad: true,
  disabled: false,
  buttonText: 'Run',
  builtinTitle: '',
  systemTitle: '',
})

const emit = defineEmits<{
  'run-script': [payload: { scriptName: string; command: string }]
  'load-error': [payload: ProjectRunLoadError]
}>()

const scripts = ref<ProjectScriptInfo[]>([])
const hasPackageJson = ref(false)
const commandPrefix = ref('npm run ')
const groupedScripts = computed<ProjectScriptGroup[]>(() => groupProjectScripts(scripts.value))
const resolvedButtonText = computed(() => props.buttonText || 'Run')
const buttonTitle = computed(() =>
  props.target === 'builtin-terminal' ? props.builtinTitle : props.systemTitle,
)

const loadScripts = async () => {
  if (!props.autoLoad) {
    return
  }

  try {
    hasPackageJson.value = false
    scripts.value = []

    const result = await readProjectScripts(props.workingDir)
    commandPrefix.value = result.commandPrefix || 'npm run '
    hasPackageJson.value = result.hasPackageJson
    scripts.value = Array.isArray(result.scripts)
      ? result.scripts.map((item) => ({
          name: item.name,
          command: item.command || '',
        }))
      : []
  } catch (error) {
    console.error('Error loading package.json scripts:', error)
    hasPackageJson.value = false
    scripts.value = []
    emit('load-error', {
      code: 'READ_SCRIPTS_FAILED',
      message: String(error),
      workingDir: props.workingDir,
    })
  }
}

const handleCommand = (command: string) => {
  const fullCommand = buildProjectScriptCommand(command, commandPrefix.value || 'npm run ')
  emit('run-script', {
    scriptName: command,
    command: fullCommand,
  })
}

watch(
  () => props.workingDir,
  () => {
    void loadScripts()
  },
)

watch(
  () => props.autoLoad,
  (value) => {
    if (value) {
      void loadScripts()
      return
    }
    hasPackageJson.value = false
    scripts.value = []
  },
)

onMounted(() => {
  void loadScripts()
})
</script>

<style scoped>
.run-project-container {
  display: flex;
  align-items: center;
}

.script-name {
  font-weight: bold;
}

.script-group-title {
  color: #64748b;
  font-size: 12px;
  pointer-events: none;
}
</style>

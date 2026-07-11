<template>
  <el-tab-pane
    v-for="tab in commonConfigTabs"
    :key="tab.name"
    :label="tab.label"
    :name="tab.name"
  >
    <el-form v-if="tab.name === 'basic'" label-width="120px">
      <el-form-item :label="t('platform.settings.basic.themeMode')">
        <el-select v-model="basicConfig.themeMode" style="width: 220px">
          <el-option :label="t('platform.settings.basic.themeMode.system')" value="system" />
          <el-option :label="t('platform.settings.basic.themeMode.light')" value="light" />
          <el-option :label="t('platform.settings.basic.themeMode.dark')" value="dark" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('platform.settings.basic.themeAccent')">
        <el-select v-model="basicConfig.themeAccent" style="width: 220px">
          <el-option
            v-for="option in themeAccentOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('platform.settings.basic.launchAtStartup')">
        <el-checkbox v-model="basicConfig.launchAtStartup">{{ t('platform.settings.basic.launchAtStartup.label') }}</el-checkbox>
      </el-form-item>

      <el-form-item :label="t('platform.settings.basic.locale')">
        <div class="w-220px">
          <el-select v-model="basicConfig.locale" style="width: 220px">
            <el-option
              v-for="option in localeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <div
            v-if="basicConfig.locale === 'system'"
            class="mt-6px text-12px"
            style="color: var(--el-text-color-secondary); line-height: 1.4;"
          >
            {{ t('platform.settings.basic.locale.currentSystem', { language: currentResolvedLocaleLabel }) }}
          </div>
        </div>
      </el-form-item>
    </el-form>

    <el-form v-else-if="tab.name === 'ai'" label-width="120px">
      <el-form-item :label="t('platform.settings.ai.provider')">
        <el-select v-model="aiConfig.provider" style="width: 220px">
          <el-option :label="t('platform.settings.ai.provider.openai')" value="openai" />
          <el-option :label="t('platform.settings.ai.provider.aliyun')" :value="AI_PROVIDER_ALIYUN_BAILIAN" />
          <el-option :label="t('platform.settings.ai.provider.ollama')" value="ollama" />
          <el-option :label="t('platform.settings.ai.provider.azure')" value="azure" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('platform.settings.ai.baseUrl')">
        <el-input v-model="aiConfig.baseUrl" :placeholder="baseUrlPlaceholder">
          <template #append v-if="showAliyunRegionSelect">
            <el-select
              class="base-url-region-select"
              :model-value="selectedAliyunRegionBaseUrl"
              :placeholder="t('platform.settings.ai.baseUrl.regionPlaceholder')"
              @change="handleAliyunRegionChange"
            >
              <el-option
                v-for="region in aliyunRegionOptions"
                :key="region.value"
                :label="region.label"
                :value="region.value"
              />
            </el-select>
          </template>
          <template #append v-else-if="showOllamaBaseUrlSelect">
            <el-select
              class="base-url-region-select"
              :model-value="selectedOllamaBaseUrl"
              :placeholder="t('platform.settings.ai.baseUrl.ollamaSelectorPlaceholder')"
              @change="handleOllamaBaseUrlChange"
            >
              <el-option
                v-for="option in ollamaBaseUrlOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item :label="t('platform.settings.ai.apiKey')">
        <el-input v-model="aiConfig.apiKey" type="password" show-password :placeholder="t('platform.settings.ai.apiKey.optional')" />
      </el-form-item>

      <el-form-item :label="t('platform.settings.ai.model')">
        <el-input v-model="aiConfig.model" :placeholder="t('platform.settings.ai.model.placeholder')" />
      </el-form-item>
    </el-form>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { ElMessage } from 'element-plus';
import { computed, ref, watch } from 'vue';
import { t } from '@/platform/i18n';
import { applyThemeSettings } from '@/utils/appTheme';
import { applyLocaleSettings, resolveLocaleSetting } from '@/platform/i18n';
import {
  ALIYUN_BAILIAN_REGION_OPTIONS,
  AI_PROVIDER_ALIYUN_BAILIAN,
  DEFAULT_BASIC_SETTINGS,
  LOCALE_OPTIONS,
  OTOOLS_GLOBAL_AI_SETTINGS_KEY,
  OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
  mergeAiSettings,
  mergeBasicSettings,
  type AiSettings,
  type BasicSettings,
} from './common';

interface Props {
  fallbackAiSettings?: Partial<AiSettings>;
}

const props = withDefaults(defineProps<Props>(), {
  fallbackAiSettings: () => ({}),
});

const aiConfig = ref<AiSettings>(mergeAiSettings(props.fallbackAiSettings));
const basicConfig = ref<BasicSettings>(mergeBasicSettings());
const loadedLaunchAtStartup = ref(DEFAULT_BASIC_SETTINGS.launchAtStartup);
const commonConfigTabs = computed(() => [
  {
    name: 'basic',
    label: t('platform.settings.tabs.basic'),
  },
  {
    name: 'ai',
    label: t('platform.settings.tabs.ai'),
  },
]);
const themeAccentOptions = computed(() => [
  { value: 'classic', label: t('platform.settings.basic.themeAccent.classic') },
  { value: 'violet', label: t('platform.settings.basic.themeAccent.violet') },
  { value: 'emerald', label: t('platform.settings.basic.themeAccent.emerald') },
  { value: 'amber', label: t('platform.settings.basic.themeAccent.amber') },
  { value: 'pink', label: t('platform.settings.basic.themeAccent.pink') },
]);
const localeOptions = computed(() => [
  {
    value: 'system',
    label: t('platform.settings.basic.locale.system'),
  },
  ...LOCALE_OPTIONS,
]);
const localeLabelMap = computed(() =>
  new Map(LOCALE_OPTIONS.map((option) => [option.value, option.label]))
);
const currentResolvedLocaleLabel = computed(() => {
  const resolved = resolveLocaleSetting(basicConfig.value);
  return localeLabelMap.value.get(resolved) || resolved;
});
const showAliyunRegionSelect = computed(
  () => aiConfig.value.provider === AI_PROVIDER_ALIYUN_BAILIAN
);
const showOllamaBaseUrlSelect = computed(() => aiConfig.value.provider === 'ollama');
const aliyunRegionOptions = computed(() =>
  ALIYUN_BAILIAN_REGION_OPTIONS.map((item) => ({
    ...item,
    label: (() => {
      switch (item.value) {
        case 'https://dashscope.aliyuncs.com/compatible-mode/v1':
          return t('platform.settings.ai.baseUrl.aliyunRegion.cnBeijing');
        case 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1':
          return t('platform.settings.ai.baseUrl.aliyunRegion.singapore');
        case 'https://dashscope-us.aliyuncs.com/compatible-mode/v1':
          return t('platform.settings.ai.baseUrl.aliyunRegion.usVirginia');
        default:
          return item.label;
      }
    })(),
  }))
);
const baseUrlPlaceholder = computed(() =>
  showAliyunRegionSelect.value
    ? t('platform.settings.ai.baseUrl.aliyunPlaceholder')
    : t('platform.settings.ai.baseUrl.defaultPlaceholder')
);
const ollamaBaseUrlOptions = computed(() => [
  {
    label: t('platform.settings.ai.baseUrl.ollama.localDefault'),
    value: 'http://127.0.0.1:11434/v1',
  },
]);
const selectedAliyunRegionBaseUrl = computed(() => {
  const normalized = aiConfig.value.baseUrl?.trim() || '';
  const matched = aliyunRegionOptions.value.find((item) => item.value === normalized);
  return matched?.value || '';
});
const selectedOllamaBaseUrl = computed(() => {
  const normalized = aiConfig.value.baseUrl?.trim() || '';
  const matched = ollamaBaseUrlOptions.value.find((item) => item.value === normalized);
  return matched?.value || '';
});

const getAiSettings = (): AiSettings => mergeAiSettings(aiConfig.value);
const getBasicSettings = (): BasicSettings => {
  const settings = mergeBasicSettings(basicConfig.value);
  return {
    ...settings,
    resolvedLocale: resolveLocaleSetting(settings),
  };
};

const handleAliyunRegionChange = (value: string) => {
  aiConfig.value.baseUrl = value || '';
};
const handleOllamaBaseUrlChange = (value: string) => {
  aiConfig.value.baseUrl = value || '';
};

watch(
  () => aiConfig.value.provider,
  (provider) => {
    if (provider !== AI_PROVIDER_ALIYUN_BAILIAN) {
      return;
    }
    if (aiConfig.value.baseUrl?.trim()) {
      return;
    }
    aiConfig.value.baseUrl = ALIYUN_BAILIAN_REGION_OPTIONS[0]?.value || '';
  }
);

const load = async () => {
  try {
    const globalBasic = await invoke<Partial<BasicSettings> | null>('get_otools_config_value', {
      key: OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
    });
    basicConfig.value = mergeBasicSettings(globalBasic);

    try {
      const enabled = await invoke<boolean>('otools_get_launch_at_startup');
      basicConfig.value.launchAtStartup = !!enabled;
      loadedLaunchAtStartup.value = !!enabled;
    } catch (error) {
      console.error('读取开机启动状态失败:', error);
      loadedLaunchAtStartup.value = !!basicConfig.value.launchAtStartup;
    }
  } catch (error) {
    console.error('读取全局基础配置失败:', error);
    basicConfig.value = mergeBasicSettings(DEFAULT_BASIC_SETTINGS);
    loadedLaunchAtStartup.value = !!basicConfig.value.launchAtStartup;
  }

  try {
    const globalAi = await invoke<Partial<AiSettings> | null>('get_otools_config_value', {
      key: OTOOLS_GLOBAL_AI_SETTINGS_KEY,
    });

    if (globalAi) {
      aiConfig.value = mergeAiSettings(globalAi);
      applyThemeSettings(basicConfig.value);
      applyLocaleSettings(basicConfig.value);
      return;
    }

  } catch (error) {
    console.error('读取全局 AI 配置失败:', error);
  }

  aiConfig.value = mergeAiSettings(props.fallbackAiSettings);
  applyThemeSettings(basicConfig.value);
  applyLocaleSettings(basicConfig.value);
};

const save = async () => {
  aiConfig.value = mergeAiSettings(aiConfig.value);
  const desiredBasicSettings = getBasicSettings();
  const persistedBasicSettings: BasicSettings = {
    ...desiredBasicSettings,
    launchAtStartup: loadedLaunchAtStartup.value,
  };

  // Avoid parallel read-modify-write races on the same config file.
  await invoke('save_otools_config_value', {
    key: OTOOLS_GLOBAL_AI_SETTINGS_KEY,
    value: aiConfig.value,
  });

  const startupChanged = desiredBasicSettings.launchAtStartup !== loadedLaunchAtStartup.value;
  if (startupChanged) {
    try {
      const enabled = await invoke<boolean>('otools_set_launch_at_startup', {
        enabled: !!desiredBasicSettings.launchAtStartup,
      });
      persistedBasicSettings.launchAtStartup = !!enabled;
      loadedLaunchAtStartup.value = !!enabled;
    } catch (error) {
      console.error('保存开机启动设置失败:', error);
      ElMessage.error(String(error || '保存开机启动设置失败'));
    }
  }

  await invoke('save_otools_config_value', {
    key: OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
    value: persistedBasicSettings,
  });

  basicConfig.value = persistedBasicSettings;
  applyThemeSettings(persistedBasicSettings);
  applyLocaleSettings(persistedBasicSettings);
};

defineExpose({
  load,
  save,
  getAiSettings,
  getBasicSettings,
});
</script>

<style scoped>
.base-url-region-select {
  width: 200px;
}
</style>

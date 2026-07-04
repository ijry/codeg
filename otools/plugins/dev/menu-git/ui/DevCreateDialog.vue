<template>
  <el-dialog
    :model-value="visible"
    :title="t('title')"
    width="680px"
    destroy-on-close
    top="20px"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" size="small">
      <el-row :gutter="14">
        <el-col :span="12">
          <el-form-item label="Pack ID" prop="packid">
            <el-input v-model="form.packid" clearable :placeholder="t('packidPlaceholder')" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('displayName')" prop="displayName">
            <el-input v-model="form.displayName" clearable :placeholder="t('displayNamePlaceholder')" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="14">
        <el-col :span="12">
          <el-form-item :label="t('displayNameCN')" prop="displayNameCN">
            <el-input v-model="form.displayNameCN" clearable :placeholder="t('displayNameCNPlaceholder')" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('developerName')" prop="developerName">
            <el-input v-model="form.developerName" clearable :placeholder="t('developerNamePlaceholder')" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="14">
        <el-col :span="12">
          <el-form-item :label="t('version')" prop="version">
            <el-input v-model="form.version" clearable :placeholder="t('versionPlaceholder')" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item :label="t('icon')" prop="icon">
        <el-input v-model="form.icon" clearable :placeholder="t('iconPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('devUrl')" prop="devUrl">
        <el-input v-model="form.devUrl" clearable :placeholder="t('devUrlPlaceholder')" />
      </el-form-item>

      <el-row :gutter="14">
        <el-col :span="12">
          <el-form-item :label="t('hasAd')">
            <el-switch v-model="form.hasAd" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('inAppPurchase')">
            <el-switch v-model="form.inPluginPurchase" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item :label="t('summary')" prop="summary">
        <el-input v-model="form.summary" type="textarea" :rows="3" :placeholder="t('summaryPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('screenshots')" prop="screenshots">
        <div class="screenshots-field flex">
          <div class="screenshots-list flex-1">
            <el-input
              v-for="(item, index) in form.screenshots"
              :key="index"
              v-model="form.screenshots[index]"
              clearable
              :placeholder="t('screenshotPlaceholder', { index: index + 1 })"
            />
          </div>
          <div class="screenshots-actions">
            <el-button
              class="screenshot-add-btn"
              :disabled="form.screenshots.length >= screenshotSlotMax"
              @click="addScreenshotInput"
            >
              +
            </el-button>
            <el-button
              class="screenshot-add-btn"
              :disabled="form.screenshots.length <= 1"
              @click="removeScreenshotInput"
            >
              -
            </el-button>
          </div>
        </div>
        <div class="screenshots-empty w-fulls">{{ t('screenshotsHint') }}</div>
      </el-form-item>

      <div class="agreement-alert">
        <div class="agreement-title">{{ t('agreementTitle') }}</div>
        <el-scrollbar max-height="100px" class="agreement-scroll">
          <div class="agreement-content">
            <section
              v-for="section in agreementSections"
              :key="section.title"
              class="agreement-section"
            >
              <div class="agreement-section-title">{{ section.title }}</div>
              <p
                v-for="paragraph in section.paragraphs"
                :key="paragraph"
                class="agreement-paragraph"
              >
                {{ paragraph }}
              </p>
            </section>
          </div>
        </el-scrollbar>
      </div>

      <el-form-item prop="agreementAccepted">
        <el-checkbox v-model="form.agreementAccepted">{{ t('agreementAccepted') }}</el-checkbox>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button size="small" @click="emit('update:visible', false)">{{ t('cancel') }}</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="submit">{{ t('confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { type FormInstance, type FormRules } from 'element-plus';
import { useI18nScope } from '@/platform/i18n';
import type { DevPluginInput } from './types';

const props = defineProps<{
  visible: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'submit', value: DevPluginInput): void;
}>();
const { t } = useI18nScope('dev.create');

const agreementSections = [
  {
    title: t('agreement1Title'),
    paragraphs: [
      t('agreement1P1'),
      t('agreement1P2')
    ]
  },
  {
    title: t('agreement2Title'),
    paragraphs: [
      t('agreement2P1'),
      t('agreement2P2')
    ]
  },
  {
    title: t('agreement3Title'),
    paragraphs: [
      t('agreement3P1'),
      t('agreement3P2')
    ]
  },
  {
    title: t('agreement4Title'),
    paragraphs: [
      t('agreement4P1'),
      t('agreement4P2')
    ]
  },
  {
    title: t('agreement5Title'),
    paragraphs: [
      t('agreement5P1'),
      t('agreement5P2')
    ]
  },
  {
    title: t('agreement6Title'),
    paragraphs: [
      t('agreement6P1'),
      t('agreement6P2')
    ]
  },
  {
    title: t('agreement7Title'),
    paragraphs: [
      t('agreement7P1'),
      t('agreement7P2')
    ]
  },
  {
    title: t('agreement8Title'),
    paragraphs: [
      t('agreement8P1'),
      t('agreement8P2')
    ]
  }
] as const;

const screenshotSlotMax = 5;

const createScreenshotSlots = (count = 1) => Array.from({ length: Math.max(1, Math.min(count, screenshotSlotMax)) }, () => '');

const isHttpsImageUrl = (value: string) => {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') {
      return false;
    }
    return /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/i.test(url.pathname);
  } catch {
    return false;
  }
};

const isShortTextIcon = (value: string) => {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return false;
  }
  return Array.from(text).length <= 4;
};

const isValidPluginIcon = (value: string) => {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (text.startsWith('@builtin:')) {
    return true;
  }
  return isHttpsImageUrl(text) || isShortTextIcon(text);
};

const compactScreenshotSlots = (value: string[] = []) =>
  value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, screenshotSlotMax);

const createDefaultForm = (): DevPluginInput => ({
  packid: '',
  displayName: '',
  displayNameCN: '',
  developerName: '',
  summary: '',
  screenshots: createScreenshotSlots(),
  version: '0.1.0',
  icon: '',
  devUrl: '',
  hasAd: false,
  inPluginPurchase: false,
  agreementAccepted: false
});

const formRef = ref<FormInstance>();
const form = reactive<DevPluginInput>(createDefaultForm());

const validateHttpsImageIcon = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  const text = String(value || '').trim();
  if (!text) {
    callback(new Error(t('iconRequired')));
    return;
  }
  if (!isValidPluginIcon(text)) {
    callback(new Error(t('iconInvalid')));
    return;
  }
  callback();
};

const validateHttpsImageScreenshots = (_rule: unknown, value: string[], callback: (error?: Error) => void) => {
  const items = compactScreenshotSlots(Array.isArray(value) ? value : []);
  const invalid = items.find((item) => !isHttpsImageUrl(item));
  if (invalid) {
    callback(new Error(t('screenshotInvalid', { value: invalid })));
    return;
  }
  callback();
};

const rules: FormRules<DevPluginInput> = {
  packid: [{ required: true, message: t('packidRequired'), trigger: 'blur' }],
  displayName: [{ required: true, message: t('displayNameRequired'), trigger: 'blur' }],
  developerName: [{ required: true, message: t('developerNameRequired'), trigger: 'blur' }],
  icon: [{ validator: validateHttpsImageIcon, trigger: 'blur' }],
  screenshots: [{ validator: validateHttpsImageScreenshots, trigger: 'blur' }],
  agreementAccepted: [{
    validator: (_rule, value, callback) => {
      if (value) {
        callback();
        return;
      }
      callback(new Error(t('agreementRequired')));
    },
    trigger: 'change'
  }]
};

const resetForm = () => {
  Object.assign(form, createDefaultForm());
  formRef.value?.clearValidate();
};

const addScreenshotInput = () => {
  if (form.screenshots.length >= screenshotSlotMax) {
    return;
  }
  form.screenshots.push('');
};

const removeScreenshotInput = () => {
  if (form.screenshots.length <= 1) {
    return;
  }
  form.screenshots.pop();
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetForm();
    }
  }
);

const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  emit('submit', {
    packid: form.packid.trim(),
    displayName: form.displayName.trim(),
    displayNameCN: String(form.displayNameCN || '').trim(),
    developerName: form.developerName.trim(),
    summary: form.summary.trim(),
    screenshots: compactScreenshotSlots(form.screenshots),
    version: form.version.trim(),
    icon: form.icon.trim(),
    devUrl: form.devUrl.trim(),
    hasAd: Boolean(form.hasAd),
    inPluginPurchase: Boolean(form.inPluginPurchase),
    agreementAccepted: Boolean(form.agreementAccepted)
  });
};
</script>

<style scoped lang="scss">
:deep(.el-form-item--small) {
  margin-bottom: 12px;
}
:deep(.is-error.el-form-item--small) {
  margin-bottom: 18px;
}
.screenshots-field {
  width: 100%;
  gap: 8px;
}

.screenshots-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.screenshots-actions {
  display: flex;
  align-items: center;
}

.screenshot-add-btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}

.screenshots-tip {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agreement-alert {
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.agreement-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agreement-scroll {
  padding-right: 6px;
}

.agreement-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agreement-section-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agreement-paragraph {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--el-text-color-regular);
}
</style>

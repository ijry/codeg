<template>
  <el-dialog
    :model-value="visible"
    :title="t('title')"
    width="620px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" size="small">
      <el-form-item :label="t('version')" prop="version">
        <el-input v-model="form.version" clearable :placeholder="t('versionPlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('changelog')" prop="changelog">
        <el-input
          v-model="form.changelog"
          type="textarea"
          :rows="5"
          :placeholder="t('changelogPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('downloadUrl')" prop="downloadUrl">
        <el-input
          v-model="form.downloadUrl"
          clearable
          :placeholder="t('downloadUrlPlaceholder')"
        />
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
import type { DevPublishVersionInput } from './types';

const props = defineProps<{
  visible: boolean;
  saving?: boolean;
  uuid: string;
  defaultVersion?: string;
}>();

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'submit', value: DevPublishVersionInput): void;
}>();
const { t } = useI18nScope('dev.publish');

const formRef = ref<FormInstance>();
const form = reactive<DevPublishVersionInput>({
  uuid: '',
  version: '',
  changelog: '',
  downloadUrl: ''
});

const rules: FormRules<DevPublishVersionInput> = {
  version: [{ required: true, message: t('versionRequired'), trigger: 'blur' }],
  changelog: [{ required: true, message: t('changelogRequired'), trigger: 'blur' }],
  downloadUrl: [{ required: true, message: t('downloadUrlRequired'), trigger: 'blur' }]
};

const resetForm = () => {
  form.uuid = props.uuid || '';
  form.version = props.defaultVersion || '';
  form.changelog = '';
  form.downloadUrl = '';
  formRef.value?.clearValidate();
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
    uuid: props.uuid,
    version: form.version.trim(),
    changelog: form.changelog.trim(),
    downloadUrl: form.downloadUrl.trim()
  });
};
</script>

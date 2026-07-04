<template>
  <el-drawer
    :modal="false"
    :model-value="visible"
    size="58%"
    @close="emit('update:visible', false)"
  >
    <template #header>
      <div v-if="item" class="drawer-title">
        <span class="drawer-title-icon">
            <img
              v-if="isImageIcon(resolveIcon(item.icon))"
              :src="resolveIcon(item.icon)"
              :alt="resolvePluginDisplayName(item)"
            />
            <span v-else>{{ resolveIcon(item.icon) || '🧩' }}</span>
          </span>
        <div class="drawer-title-main">
          <div class="drawer-title-name">{{ resolvePluginDisplayName(item) }}</div>
          <div class="drawer-title-packid">Pack ID: {{ item.packid }}</div>
        </div>
      </div>
      <span v-else>{{ t('empty') }}</span>
    </template>

    <div v-if="item" class="drawer-body">
      <div class="meta-row">
        <el-tag size="small" :type="item.official ? 'success' : 'info'" effect="plain">
          {{ item.official ? t('officialPlugin') : t('thirdPartyPlugin') }}
        </el-tag>
        <el-tag size="small" type="primary" effect="plain">v{{ item.version }}</el-tag>
        <el-tag v-if="item.installed" size="small" type="success" effect="dark">{{ t('installed') }}</el-tag>
        <el-tag v-if="item.updateAvailable" size="small" type="warning" effect="plain">{{ t('updateAvailable') }}</el-tag>
        <el-tag
          v-if="item.minOToolsVersion"
          size="small"
          :type="item.meetsMinOToolsVersion ? 'info' : 'danger'"
          effect="plain"
        >
          {{ t('minOToolsVersion', { value: item.minOToolsVersion }) }}
        </el-tag>
      </div>

      <div class="summary">{{ item.summary }}</div>
      <div class="author">{{ t('author', { value: item.developerName || '-' }) }}</div>
      <div v-if="item.installedVersion" class="author">{{ t('installedVersion', { value: item.installedVersion }) }}</div>
      <div v-if="currentOtoolsVersion" class="author">{{ t('currentOToolsVersion', { value: currentOtoolsVersion }) }}</div>
      <div v-if="item.minOToolsVersion && !item.meetsMinOToolsVersion" class="version-warning">
        {{ t('versionBlocked', { required: item.minOToolsVersion, current: currentOtoolsVersion || '-' }) }}
      </div>

      <div class="section-title mt-14px">{{ t('osSupport') }}</div>
      <div class="support-icons">
        <span
          class="os-icon"
          :class="{ supported: isSupported(item.supportMacos), disabled: !isSupported(item.supportMacos) }"
          title="macOS"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M16.365 13.552c-.02-2.05 1.67-3.02 1.747-3.07-0.95-1.39-2.43-1.58-2.95-1.6-1.25-.13-2.45.73-3.08.73-.63 0-1.6-.72-2.63-.7-1.36.02-2.6.8-3.3 2.03-1.42 2.46-.36 6.12 1.02 8.11.68.98 1.49 2.08 2.55 2.04 1.03-.04 1.42-.67 2.66-.67 1.23 0 1.59.67 2.65.65 1.09-.02 1.78-.99 2.45-1.98.78-1.15 1.1-2.26 1.12-2.32-.02-.01-2.15-.83-2.18-3.19zM14.58 4.5c.56-.68.94-1.63.83-2.58-.8.03-1.77.53-2.34 1.21-.52.6-.97 1.58-.85 2.5.89.07 1.8-.45 2.36-1.13z"
            />
          </svg>
        </span>
        <span
          class="os-icon"
          :class="{ supported: isSupported(item.supportWindows), disabled: !isSupported(item.supportWindows) }"
          title="Windows"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="2" width="9" height="9" rx="1" />
            <rect x="13" y="2" width="9" height="9" rx="1" />
            <rect x="2" y="13" width="9" height="9" rx="1" />
            <rect x="13" y="13" width="9" height="9" rx="1" />
          </svg>
        </span>
        <span
          class="os-icon"
          :class="{ supported: isSupported(item.supportLinux), disabled: !isSupported(item.supportLinux) }"
          title="Linux"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="9" r="4.2" />
            <circle cx="10.5" cy="8.5" r="0.8" />
            <circle cx="13.5" cy="8.5" r="0.8" />
            <ellipse cx="12" cy="16.5" rx="5" ry="4.2" />
            <path d="M12 10.5l1.6 1.6-1.6 1.6-1.6-1.6 1.6-1.6z" />
          </svg>
        </span>
      </div>

      <div class="section-title">{{ t('screenshots') }}</div>
      <el-carousel
        v-if="item.screenshots.length > 0"
        class="shot-carousel"
        height="250px"
        trigger="click"
        indicator-position="outside"
      >
        <el-carousel-item v-for="shot in item.screenshots" :key="shot">
          <div class="shot-item">
            <img :src="shot" :alt="t('screenshotAlt')" />
          </div>
        </el-carousel-item>
      </el-carousel>
      <el-empty v-else :description="t('emptyScreenshots')" :image-size="72" />

      <div class="section-title mt-14px">{{ t('ratingReviews') }}</div>
      <div class="rating-row">
        <el-rate :model-value="item.rating" disabled show-score score-template="{value} / 5" />
        <span class="rating-count">{{ t('ratingCount', { count: item.ratingCount }) }}</span>
      </div>

      <el-scrollbar class="review-scroll">
        <div v-if="item.reviews.length > 0" class="review-list">
          <div v-for="review in item.reviews" :key="`${review.user}-${review.date}-${review.content}`" class="review-item">
            <div class="review-head">
              <span class="user">{{ review.user }}</span>
              <span class="date">{{ review.date }}</span>
            </div>
            <el-rate :model-value="review.rating" disabled size="small" />
            <p class="content">{{ review.content }}</p>
          </div>
        </div>
        <el-empty v-else :description="t('emptyReviews')" :image-size="72" />
      </el-scrollbar>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button size="small" @click="emit('update:visible', false)">{{ t('close') }}</el-button>
        <el-button
          v-if="item?.installed"
          type="danger"
          plain
          size="small"
          :loading="uninstalling"
          @click="item && emit('uninstall', item)"
        >
          {{ t('uninstall') }}
        </el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!item || !item.installable"
          :loading="installing"
          @click="item && emit('install', item)"
        >
          {{ item?.updateAvailable ? t('update') : item?.installed ? t('reinstall') : t('install') }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { currentLocaleRef, useI18nScope } from '@/platform/i18n';
import { resolveToolPluginIcon, type ToolPlugin } from '@/platform/ui/tools/plugins';
import type { ParkCatalogItem } from './types';
const { t } = useI18nScope('park.drawer');

const resolveIcon = (value?: string) =>
  resolveToolPluginIcon({ icon: String(value || '') } as ToolPlugin);
const resolvePluginDisplayName = (item: Pick<ParkCatalogItem, 'displayName' | 'displayNameCN'>) =>
  currentLocaleRef.value === 'zh-CN'
    ? String(item.displayNameCN || item.displayName || '').trim()
    : String(item.displayName || item.displayNameCN || '').trim();
const isImageIcon = (value?: string) =>
  /^(https?:\/\/|data:image\/|asset:\/\/|tauri:\/\/)/i.test(String(value || '').trim());
const isSupported = (value?: boolean) => value !== false;

defineProps<{
  visible: boolean;
  item: ParkCatalogItem | null;
  installing: boolean;
  uninstalling: boolean;
  currentOtoolsVersion: string;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  install: [item: ParkCatalogItem];
  uninstall: [item: ParkCatalogItem];
}>();
</script>

<style scoped lang="scss">
.drawer-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-title-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.drawer-title-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.drawer-title-icon span {
  font-size: 18px;
  line-height: 1;
}

.drawer-title-main {
  min-width: 0;
}

.drawer-title-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.drawer-title-packid {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary {
  font-size: 14px;
  color: var(--el-text-color-primary);
  line-height: 1.7;
}

.author {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.version-warning {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-danger);
}

.support-icons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.os-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  color: var(--el-text-color-regular);
}

.os-icon svg {
  width: 15px;
  height: 15px;
  display: block;
  fill: currentColor;
}

.os-icon.supported {
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
}

.os-icon.disabled {
  opacity: 0.4;
  filter: grayscale(1);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.shot-carousel {
  width: 100%;
}

.shot-item {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
}

.shot-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rating-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rating-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.review-scroll {
  max-height: 280px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 10px;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-item {
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.review-head .user {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.review-head .date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.review-item .content {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.drawer-footer {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

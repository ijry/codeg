<template>
  <el-config-provider size="small">
    <div class="park-container">
      <div class="park-layout">
        <aside class="left-panel">
          <div class="left-header">
            <div class="left-header-main">
              <h3 class="panel-title">{{ t('title') }}</h3>
              <p class="panel-subtitle">{{ t('subtitle') }}</p>
            </div>
            <el-button :icon="RefreshRight" :loading="loading" circle @click="loadWorkspace()" />
          </div>

          <div class="left-note">
            <div class="offline-title">{{ t('offlineTitle') }}</div>
            <el-button
              type="primary"
              plain
              :icon="Upload"
              :loading="offlineInstalling"
              @click="installOfflinePlugin"
            >
              {{ t('loadOffline') }}
            </el-button>
            <div class="offline-tip">
              {{ t('offlineTip') }}
            </div>
            <div v-if="workspace?.note" class="offline-tip">{{ workspace.note }}</div>
          </div>

          <el-scrollbar class="left-menu-scroll">
            <div class="left-menu-items">
              <div
                v-for="category in categories"
                :key="category.key"
                class="left-menu-item"
                :class="{ active: activeCategory === category.key }"
                @click="switchCategory(category.key)"
              >
                <div class="left-menu-item-title">{{ resolveCategoryLabel(category) }}</div>
                <div class="left-menu-item-meta">{{ t('pluginCount', { count: category.count }) }}</div>
              </div>
            </div>
          </el-scrollbar>
        </aside>

        <section class="right-panel">
          <el-card shadow="never" class="list-card">
            <template #header>
              <div class="card-header">
                <div class="header-title">{{ activeCategoryLabel }}</div>
                <div class="header-actions">
                  <el-input
                    v-model="keyword"
                    clearable
                    class="search-input"
                    :placeholder="t('searchPlaceholder')"
                  />
                  <el-button :icon="FolderOpened" @click="openDir(workspace?.downloadsDir)">{{ t('downloadDir') }}</el-button>
                  <el-button :icon="FolderOpened" @click="openDir(workspace?.pluginsDir)">{{ t('pluginsDir') }}</el-button>
                  <el-button :icon="RefreshRight" :loading="loading" @click="loadWorkspace()">{{ t('refresh') }}</el-button>
                </div>
              </div>
            </template>

            <el-table
              :data="filteredItems"
              border
              stripe
              height="100%"
              v-loading="loading"
              row-key="uuid"
              @row-click="openDrawer"
            >
              <el-table-column :label="t('columnPlugin')" min-width="320" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="name-col items-center">
                    <div class="name-main">
                      <div class="icon">
                        <img
                          v-if="isImageIcon(resolveIcon(row.icon))"
                          :src="resolveIcon(row.icon)"
                          :alt="resolvePluginDisplayName(row)"
                        />
                        <span v-else>{{ resolveIcon(row.icon) || '🧩' }}</span>
                      </div>
                    </div>
                    <div>
                      <div class="flex items-center">
                        <span class="name mr-3px">{{ resolvePluginDisplayName(row) }}</span>
                        <el-tag v-if="row.official" size="small" type="success" effect="plain">{{ t('official') }}</el-tag>
                        <el-tag v-if="row.hasAd" size="small" type="danger" effect="plain">{{ t('ad') }}</el-tag>
                        <el-tag v-if="row.inPluginPurchase" size="small" type="danger" effect="plain">{{ t('inAppPurchase') }}</el-tag>
                        <el-tag v-if="row.updateAvailable" size="small" type="warning" effect="plain">{{ t('updateAvailable') }}</el-tag>
                        <el-tag
                          v-if="row.minOToolsVersion"
                          size="small"
                          :type="row.meetsMinOToolsVersion ? 'info' : 'danger'"
                          effect="plain"
                        >
                          {{ t('minVersionShort', { version: row.minOToolsVersion }) }}
                        </el-tag>
                      </div>
                      <div class="name-sub">{{ row.packid }} · v{{ row.version }}</div>
                      <div v-if="row.installedVersion && row.updateAvailable" class="name-sub">
                        {{ t('installedVersion', { version: row.installedVersion }) }}
                      </div>
                      <div
                        v-if="row.minOToolsVersion && !row.meetsMinOToolsVersion"
                        class="name-sub text-danger"
                      >
                        {{ t('versionBlockedShort', { required: row.minOToolsVersion, current: workspace?.currentOToolsVersion || '-' }) }}
                      </div>
                      <div class="name-sub mt-5px text-gray-2">{{ row.summary }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('columnRating')" width="220">
                <template #default="{ row }">
                  <div class="rating-cell">
                    <el-rate :model-value="row.rating" disabled />
                    <span class="rating-text">{{ row.rating.toFixed(1) }} ({{ row.ratingCount }})</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('columnOsSupport')" width="200">
                <template #default="{ row }">
                  <div class="support-icons">
                    <span
                      class="os-icon"
                      :class="{
                        supported: isSupported(row.supportMacos),
                        disabled: !isSupported(row.supportMacos),
                      }"
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
                      :class="{
                        supported: isSupported(row.supportWindows),
                        disabled: !isSupported(row.supportWindows),
                      }"
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
                      :class="{
                        supported: isSupported(row.supportLinux),
                        disabled: !isSupported(row.supportLinux),
                      }"
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
                </template>
              </el-table-column>
              <!-- <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.installed ? 'success' : 'info'" effect="plain">
                    {{ row.installed ? '已安装' : '未安装' }}
                  </el-tag>
                </template>
              </el-table-column> -->
              <el-table-column :label="t('columnActions')" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click.stop="openDrawer(row)">{{ t('detail') }}</el-button>
                  <el-button
                    link
                    type="success"
                    :disabled="!row.installable"
                    :loading="installingId === row.uuid"
                    @click.stop="installPlugin(row)"
                  >
                    {{ actionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="row.installed"
                    link
                    type="danger"
                    :loading="uninstallingId === row.uuid"
                    @click.stop="uninstallPlugin(row)"
                  >
                    {{ t('uninstall') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </section>
      </div>

      <ParkPluginDrawer
        v-model:visible="drawerVisible"
        :item="drawerItem"
        :installing="installingId === drawerItem?.uuid"
        :uninstalling="uninstallingId === drawerItem?.uuid"
        :current-otools-version="workspace?.currentOToolsVersion || ''"
        @install="installPlugin"
        @uninstall="uninstallPlugin"
      />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ElMessage, ElMessageBox } from 'element-plus';
import { FolderOpened, RefreshRight, Upload } from '@element-plus/icons-vue';
import { currentLocaleRef, useI18nScope } from '@/platform/i18n';
import { openHostFsWindow } from '@/platform/ui/fsWindow';
import ParkPluginDrawer from './ParkPluginDrawer.vue';
import type {
  ParkCatalogItem,
  ParkCategory,
  ParkInstallResult,
  ParkUninstallResult,
  ParkWorkspace
} from './types';
import { resolveToolPluginIcon, type ToolPlugin } from '@/platform/ui/tools/plugins';
const { t } = useI18nScope('park');

const workspace = ref<ParkWorkspace | null>(null);
const loading = ref(false);
const installingId = ref('');
const uninstallingId = ref('');
const offlineInstalling = ref(false);
const activeCategory = ref('hot');
const keyword = ref('');
const drawerVisible = ref(false);
const drawerItem = ref<ParkCatalogItem | null>(null);

const resolvePluginDisplayName = (item: Pick<ParkCatalogItem, 'displayName' | 'displayNameCN'>) =>
  currentLocaleRef.value === 'zh-CN'
    ? String(item.displayNameCN || item.displayName || '').trim()
    : String(item.displayName || item.displayNameCN || '').trim();

const categories = computed<ParkCategory[]>(() => workspace.value?.categories || []);
const resolveCategoryLabel = (category: Pick<ParkCategory, 'key' | 'label'>) => {
  const key = String(category.key || '').trim().toLowerCase();
  if (key === 'hot' || key === 'latest' || key === 'featured' || key === 'official' || key === 'installed') {
    return t(`categories.${key}`);
  }
  return category.label;
};
const activeCategoryLabel = computed(() => {
  const found = categories.value.find((item) => item.key === activeCategory.value);
  return found ? resolveCategoryLabel(found) : t('pluginList');
});

const resolveIcon = (value?: string) =>
  resolveToolPluginIcon({ icon: String(value || '') } as ToolPlugin);
const isImageIcon = (value?: string) =>
  /^(https?:\/\/|data:image\/|asset:\/\/|tauri:\/\/)/i.test(String(value || '').trim());
const isSupported = (value?: boolean) => value !== false;
const actionLabel = (item: ParkCatalogItem) => {
  if (item.updateAvailable) return t('update');
  return item.installed ? t('reinstall') : t('install');
};

const filteredItems = computed<ParkCatalogItem[]>(() => {
  const source = workspace.value?.items || [];
  const search = keyword.value.trim().toLowerCase();

  const filtered = source.filter((item) => {
    if (!search) {
      return true;
    }
    const haystack = `${resolvePluginDisplayName(item)} ${item.summary} ${item.developerName} ${item.packid}`.toLowerCase();
    return haystack.includes(search);
  });

  return filtered.sort((a, b) => {
    if (a.installed !== b.installed) {
      return a.installed ? -1 : 1;
    }
    return b.rating - a.rating;
  });
});

const loadWorkspace = async (categoryKey = activeCategory.value) => {
  loading.value = true;
  try {
    activeCategory.value = categoryKey;
    const result = await invoke<ParkWorkspace>('park_get_workspace', {
      cate: categoryKey
    });
    workspace.value = result;
    if (!categories.value.some((item) => item.key === activeCategory.value)) {
      activeCategory.value = categories.value[0]?.key || 'hot';
    }
    if (drawerItem.value) {
      const next = workspace.value.items.find((item) => item.uuid === drawerItem.value?.uuid);
      if (next) {
        drawerItem.value = next;
      }
    }
  } catch (error) {
    ElMessage.error(t('loadWorkspaceFailed', { message: String(error) }));
  } finally {
    loading.value = false;
  }
};

const switchCategory = async (categoryKey: string) => {
  if (categoryKey === activeCategory.value && workspace.value) {
    return;
  }
  await loadWorkspace(categoryKey);
};

const openDrawer = (item: ParkCatalogItem) => {
  drawerItem.value = item;
  drawerVisible.value = true;
};

const installPlugin = async (item: ParkCatalogItem) => {
  if (!item.meetsMinOToolsVersion) {
    ElMessage.warning(
      t('versionBlocked', {
        name: resolvePluginDisplayName(item),
        required: item.minOToolsVersion || '-',
        current: workspace.value?.currentOToolsVersion || '-'
      })
    );
    return;
  }
  if (!item.installable) {
    ElMessage.warning(t('notInstallable', { name: resolvePluginDisplayName(item) }));
    return;
  }

  installingId.value = item.uuid;
  try {
    const result = await invoke<ParkInstallResult>('park_install_plugin', {
      input: { item }
    });
    await invoke('otools_reload_all_plugins');
    await loadWorkspace(activeCategory.value);
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('installFailed', { message: String(error) }));
  } finally {
    installingId.value = '';
  }
};

const installOfflinePlugin = async () => {
  try {
    const selected = await open({
      title: t('selectOfflineTitle'),
      multiple: false,
      directory: false
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }

    offlineInstalling.value = true;
    const result = await invoke<ParkInstallResult>('park_install_offline_plugin', {
      filePath: selected
    });
    await invoke('otools_reload_all_plugins');
    await loadWorkspace('installed');
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('installOfflineFailed', { message: String(error) }));
  } finally {
    offlineInstalling.value = false;
  }
};

const uninstallPlugin = async (item: ParkCatalogItem) => {
  if (!item.installed) {
    return;
  }

  const displayName = resolvePluginDisplayName(item) || item.packid;
  try {
    await ElMessageBox.confirm(
      t('uninstallConfirm', { name: displayName }),
      t('uninstallTitle'),
      {
        type: 'warning',
        confirmButtonText: t('uninstall'),
        cancelButtonText: t('cancel')
      }
    );
  } catch {
    return;
  }

  uninstallingId.value = item.uuid;
  try {
    const result = await invoke<ParkUninstallResult>('park_uninstall_plugin', {
      input: { item }
    });
    await invoke('otools_reload_all_plugins');
    if (drawerItem.value?.uuid === item.uuid) {
      drawerItem.value = null;
      drawerVisible.value = false;
    }
    await loadWorkspace(activeCategory.value);
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('uninstallFailed', { message: String(error) }));
  } finally {
    uninstallingId.value = '';
  }
};

const openDir = async (path?: string) => {
  const target = String(path || '').trim();
  if (!target) {
    return;
  }
  try {
    await openHostFsWindow(target);
  } catch (error) {
    ElMessage.error(t('openDirFailed', { message: String(error) }));
  }
};

onMounted(() => {
  void loadWorkspace();
});
</script>

<style scoped lang="scss">
.park-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
}

.park-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel {
  width: 248px;
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-sizing: border-box;
  gap: 10px;
}

.left-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.left-header-main {
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.panel-subtitle {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.left-note {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 8px;
}

.offline-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.offline-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.left-menu-scroll {
  flex: 1;
}

.left-menu-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.left-menu-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 10px 10px 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
  background: var(--el-fill-color-blank);
}

.left-menu-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.left-menu-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.left-menu-item-title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.2;
  margin-bottom: 4px;
}

.left-menu-item-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.right-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  padding: 12px;
  box-sizing: border-box;
}

.list-card {
  width: 100%;
  height: 100%;
}

:deep(.list-card .el-card__body) {
  height: calc(100% - 58px);
}

:deep(.list-card .el-table) {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-input {
  width: 240px;
}

.name-col {
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.name-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.name-main .icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.name-main .icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.name-main .icon span {
  font-size: 18px;
  line-height: 1;
}

.name-main .name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.name-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.text-danger {
  color: var(--el-color-danger);
}

.rating-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rating-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.support-icons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.os-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  color: var(--el-text-color-regular);
}

.os-icon svg {
  width: 14px;
  height: 14px;
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

@media (max-width: 980px) {
  .park-layout {
    flex-direction: column;
  }

  .left-panel {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--el-border-color-light);
    max-height: 240px;
  }

  .search-input {
    width: 100%;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>

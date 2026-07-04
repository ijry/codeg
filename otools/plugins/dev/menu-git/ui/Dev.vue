<template>
  <el-config-provider size="small">
    <div class="dev-page">
      <div class="dev-layout">
        <aside class="dev-sidebar">
          <div class="sidebar-header">
            <div>
              <h2 class="sidebar-title">{{ t('title') }}</h2>
              <p class="sidebar-subtitle">{{ t('subtitle') }}</p>
            </div>
            <div class="sidebar-actions">
              <el-button
                :icon="Tools"
                circle
                :type="showStandaloneBuild ? 'primary' : 'default'"
                @click="showStandaloneBuild = !showStandaloneBuild"
              />
              <el-button :icon="RefreshRight" :loading="loading" circle @click="loadWorkspace" />
            </div>
          </div>

          <button class="create-plugin-button" type="button" @click="createDialogVisible = true">
            <span class="create-plugin-icon">+</span>
            <span>{{ t('createPlugin') }}</span>
          </button>

          <el-scrollbar class="plugin-list-scroll">
            <div v-if="workspace?.items.length" class="plugin-list">
              <button
                v-for="item in pluginItems"
                :key="item.uuid"
                type="button"
                class="plugin-list-item"
                :class="{ active: selectedUuid === item.uuid }"
                @click="selectedUuid = item.uuid"
              >
                <div class="plugin-list-head">
                  <div class="plugin-list-title">
                    <div class="plugin-list-icon">
                      <img v-if="isImageIcon(item.resolvedIcon)" :src="item.resolvedIcon" :alt="resolvePluginDisplayName(item)" />
                      <span v-else>{{ item.resolvedIcon }}</span>
                    </div>
                    <span class="plugin-list-name">{{ resolvePluginDisplayName(item) }}</span>
                  </div>
                  <el-tag :type="item.directoryBound ? 'success' : 'warning'" effect="plain">
                    {{ item.directoryBound ? t('boundDirectory') : t('unboundDirectory') }}
                  </el-tag>
                </div>
                <div class="plugin-list-id">{{ item.packid }}</div>
                <div class="plugin-list-meta">
                  <span>v{{ item.version }}</span>
                  <span>{{ item.debugEnabled ? t('debugging') : t('notDebugging') }}</span>
                </div>
              </button>
            </div>
            <el-empty v-else :description="t('emptyPlugins')" />
          </el-scrollbar>

          <div class="dev-resources">
            <!-- <div class="dev-resources-title">开发者资源</div> -->
            <div class="dev-resources-links">
              <el-link type="default" :underline="false" @click="openDocs">
                {{ t('developerDocs') }}
              </el-link>
              <el-link type="default" :underline="false" @click="weixinDialogVisible = true">
                {{ t('developerGroup') }}
              </el-link>
            </div>
          </div>
        </aside>

        <section class="dev-content">
          <DevStandaloneNativeBuild v-if="showStandaloneBuild" />

          <div v-if="selectedItem" class="detail-shell">
            <div class="detail-header">
              <div>
                <h3 class="detail-title">
                  <span class="detail-icon">
                    <img
                      v-if="isImageIcon(selectedResolvedIcon)"
                      :src="selectedResolvedIcon"
                      :alt="resolvePluginDisplayName(selectedItem)"
                    />
                    <span v-else>{{ selectedResolvedIcon }}</span>
                  </span>
                  <span>{{ resolvePluginDisplayName(selectedItem) }}</span>
                </h3>
                <p class="detail-subtitle">{{ selectedItem.packid }} · {{ selectedItem.developerName }}</p>
              </div>
              <div class="detail-header-tags">
                <el-tag effect="plain">v{{ selectedItem.version }}</el-tag>
                <el-tag :type="selectedItem.debugEnabled ? 'success' : 'info'" effect="plain">
                  {{ selectedItem.debugEnabled ? t('debugRegistered') : t('debugUnregistered') }}
                </el-tag>
              </div>
            </div>

            <el-tabs v-model="activeTab" class="detail-tabs">
              <el-tab-pane :label="t('tabs.basic')" name="basic">
                <div class="basic-tab">
                  <div class="path-strip">
                    <div class="path-item">
                      <span class="path-label">{{ t('path.boundDirectory') }}</span>
                      <span class="path-value">
                        {{ selectedItem.directoryBound ? selectedItem.boundDirectoryPath : t('unbound') }}
                        <el-link class="text-12px" type="pramry" :loading="actionLoading === 'bind'" @click="bindDirectory">
                          {{ selectedItem.directoryBound ? t('actions.rebindDirectory') : t('actions.bindDirectory') }}
                        </el-link>
                      </span>
                    </div>
                    <div class="path-item">
                      <span class="path-label">plugin.json</span>
                      <span class="path-value">
                        {{ selectedItem.pluginManifestPath || t('path.pluginManifestUnavailable') }}
                      </span>
                    </div>
                    <div class="path-item">
                      <span class="path-label">{{ t('path.packFile') }}</span>
                      <span class="path-value">{{ selectedItem.packFilePath }}</span>
                    </div>
                  </div>

                  <el-form ref="detailFormRef" :model="detailForm" :rules="detailRules" label-width="110px" class="detail-form">
                    <el-row :gutter="14">
                      <el-col :span="12">
                        <el-form-item label="Pack ID" prop="packid">
                          <el-input v-model="detailForm.packid" clearable />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item :label="t('fields.displayName')" prop="displayName">
                          <el-input v-model="detailForm.displayName" clearable />
                        </el-form-item>
                      </el-col>
                    </el-row>

                    <el-row :gutter="14">
                      <el-col :span="12">
                        <el-form-item :label="t('fields.displayNameCN')" prop="displayNameCN">
                          <el-input v-model="detailForm.displayNameCN" clearable />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item :label="t('fields.developerName')" prop="developerName">
                          <el-input v-model="detailForm.developerName" clearable />
                        </el-form-item>
                      </el-col>
                    </el-row>

                    <el-row :gutter="14">
                      <el-col :span="12">
                        <el-form-item :label="t('fields.version')" prop="version">
                          <el-input v-model="detailForm.version" clearable />
                        </el-form-item>
                      </el-col>
                    </el-row>

                    <el-form-item :label="t('fields.icon')" prop="icon">
                      <el-input v-model="detailForm.icon" clearable :placeholder="t('fields.iconPlaceholder')" />
                    </el-form-item>

                    <el-form-item :label="t('fields.devUrl')" prop="devUrl">
                      <el-input v-model="detailForm.devUrl" clearable />
                    </el-form-item>

                    <el-row :gutter="14">
                      <el-col :span="12">
                        <el-form-item :label="t('fields.hasAd')">
                          <el-switch v-model="detailForm.hasAd" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item :label="t('fields.inAppPurchase')">
                          <el-switch v-model="detailForm.inPluginPurchase" />
                        </el-form-item>
                      </el-col>
                    </el-row>

                    <el-form-item :label="t('fields.summary')">
                      <el-input v-model="detailForm.summary" type="textarea" :rows="4" />
                    </el-form-item>

                    <el-form-item :label="t('fields.screenshots')" prop="screenshots">
                      <div class="screenshots-editor flex">
                        <div class="screenshots-grid">
                          <el-input
                            v-for="(item, index) in detailForm.screenshots"
                            :key="index"
                            v-model="detailForm.screenshots[index]"
                            clearable
                            :placeholder="t('fields.screenshotPlaceholder', { index: index + 1 })"
                          />
                        </div>
                        <div class="screenshots-actions">
                          <el-button
                            class="screenshot-add-btn"
                            :disabled="detailForm.screenshots.length >= screenshotSlotMax"
                            @click="addDetailScreenshotInput"
                          >
                            +
                          </el-button>
                          <el-button
                            class="screenshot-add-btn"
                            :disabled="detailForm.screenshots.length <= 1"
                            @click="removeDetailScreenshotInput"
                          >
                            -
                          </el-button>
                        </div>
                      </div>
                      <div class="screenshots-empty w-fulls">{{ t('fields.screenshotsHint') }}</div>
                    </el-form-item>

                    <el-form-item :label="t('fields.agreement')">
                      <el-tag type="success" effect="plain">
                        {{ detailForm.agreementAccepted ? t('agreementAccepted') : t('agreementNotAccepted') }}
                      </el-tag>
                    </el-form-item>
                  </el-form>

                  <div class="action-bar">
                    <el-button type="primary" :loading="saveLoading" @click="saveCurrentMeta">{{ t('actions.saveBasic') }}</el-button>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane :label="t('tabs.dev')" name="dev">
                <div v-if="runRepoPath" class="run-tab-shell">
                  <div class="dev-section-switch">
                    <button
                      type="button"
                      class="dev-section-button"
                      :class="{ active: devSection === 'web' }"
                      @click="devSection = 'web'"
                    >
                      <span class="dev-section-name">WEB</span>
                      <span class="dev-section-tip">{{ t('run.webTitle') }}</span>
                    </button>
                    <button
                      type="button"
                      class="dev-section-button"
                      :class="{ active: devSection === 'rust' }"
                      @click="devSection = 'rust'"
                    >
                      <span class="dev-section-name">RUST</span>
                      <span class="dev-section-tip">{{ t('run.nativeTitle') }}</span>
                    </button>
                  </div>

                  <template v-if="devSection === 'web'">
                    <div class="run-toolbar">
                      <div class="run-toolbar-section">
                        <div class="run-toolbar-title">{{ t('run.webTitle') }}</div>
                        <div class="run-toolbar-actions">
                          <el-button :loading="actionLoading === 'init'" @click="initializeVueProject">{{ t('actions.initializeVue') }}</el-button>
                          <el-button :loading="actionLoading === 'vscode'" @click="openInVsCode">{{ t('actions.openInVsCode') }}</el-button>
                          <ProjectRunButton
                            :working-dir="runRepoPath"
                            :button-text="t('actions.runProject')"
                            @run-script="handleRunScript"
                            @load-error="handleRunProjectLoadError"
                          />
                          <el-button
                            type="success"
                            :loading="actionLoading === 'debug'"
                            @click="enableDebug"
                          >
                            {{ t('actions.enableDebug') }}
                          </el-button>
                          <el-button
                            size="small"
                            type="danger"
                            :loading="actionLoading === 'disable-debug'"
                            :disabled="!selectedItem?.debugEnabled"
                            @click="disableDebug"
                          >
                            {{ t('actions.disableDebug') }}
                          </el-button>
                          <el-button type="warning" :loading="actionLoading === 'pack'" @click="packPlugin">{{ t('actions.pack') }}</el-button>
                        </div>
                      </div>
                    </div>

                    <div class="run-terminal-shell">
                      <ProjectTerminalPanel
                        :key="selectedItem?.uuid || 'dev-run'"
                        ref="devRunTermPanelRef"
                        :working-dir="runRepoPath"
                        :empty-text="t('terminal.empty')"
                        :default-theme-label="t('terminal.defaultTheme')"
                      />
                    </div>
                  </template>

                  <template v-else>
                    <div class="run-toolbar">
                      <div class="run-toolbar-section">
                        <div class="run-toolbar-title">{{ t('run.nativeTitle') }}</div>
                        <div class="run-toolbar-actions">
                          <el-button :loading="actionLoading === 'init-native'" @click="initializeNativeProject">{{ t('actions.initializeNative') }}</el-button>
                          <el-button :loading="actionLoading === 'build-native'" @click="buildNativePlugin">
                            {{ t('actions.buildNative') }}
                          </el-button>
                          <el-button :loading="actionLoading === 'reload-native'" @click="reloadNativePlugin">{{ t('actions.reloadNative') }}</el-button>
                        </div>
                      </div>
                    </div>

                    <div class="native-panel">
                      <div class="native-panel-header">
                        <div>
                          <div class="native-panel-title">{{ t('native.title') }}</div>
                          <div class="native-panel-subtitle">{{ t('native.subtitle') }}</div>
                        </div>
                        <div class="native-panel-actions">
                          <div class="native-panel-toggle">
                            <span>{{ t('native.enabled') }}</span>
                            <el-switch
                              v-model="nativeEnabled"
                              :disabled="nativeEnabledLoading"
                              @change="handleNativeEnabledChange"
                            />
                          </div>
                          <el-button size="small" :loading="nativeProbeLoading" @click="probeNative">{{ t('actions.probe') }}</el-button>
                          <el-button
                            size="small"
                            type="primary"
                            :loading="nativeInvokeLoading"
                            :disabled="!nativeEnabled"
                            @click="invokeNative"
                          >
                            {{ t('actions.invoke') }}
                          </el-button>
                          <el-button
                            size="small"
                            :loading="nativeArtifactsLoading"
                            @click="refreshNativeArtifacts"
                          >
                            {{ t('actions.checkArtifacts') }}
                          </el-button>
                        </div>
                      </div>

                      <el-form label-width="70px" class="native-form">
                        <el-form-item :label="t('native.method')">
                          <el-input v-model="nativeInvokeMethod" :placeholder="t('native.methodPlaceholder')" />
                        </el-form-item>
                        <el-form-item :label="t('native.payload')">
                          <el-input
                            v-model="nativeInvokePayload"
                            type="textarea"
                            :rows="3"
                            :placeholder="t('native.payloadPlaceholder')"
                          />
                        </el-form-item>
                      </el-form>

                      <div class="native-panel-body">
                        <div class="native-panel-block">
                          <div class="native-panel-label">{{ t('native.probeResult') }}</div>
                          <pre class="native-panel-output">{{ nativeProbeText }}</pre>
                        </div>
                        <div class="native-panel-block">
                          <div class="native-panel-label">{{ t('native.invokeResult') }}</div>
                          <pre class="native-panel-output">{{ nativeInvokeText }}</pre>
                        </div>
                      </div>

                      <div class="native-release">
                        <div class="native-release-header">
                          <div class="native-panel-title">{{ t('release.title') }}</div>
                          <div class="native-release-subtitle">
                            {{ t('release.subtitle') }}
                          </div>
                        </div>
                        <div class="native-release-path">
                          {{ t('release.outputDir') }}
                          <span>{{ nativeLibDir || t('release.notGenerated') }}</span>
                        </div>
                        <div class="native-release-list">
                          <div class="native-release-item">
                            <span>macOS.dylib</span>
                            <el-tag :type="nativeArtifacts.mac ? 'success' : 'info'" effect="plain">
                              {{ nativeArtifacts.mac ? t('generated') : t('notGenerated') }}
                            </el-tag>
                          </div>
                          <div class="native-release-item">
                            <span>Windows.dll</span>
                            <el-tag :type="nativeArtifacts.windows ? 'success' : 'info'" effect="plain">
                              {{ nativeArtifacts.windows ? t('generated') : t('notGenerated') }}
                            </el-tag>
                          </div>
                          <div class="native-release-item">
                            <span>Linux.so</span>
                            <el-tag :type="nativeArtifacts.linux ? 'success' : 'info'" effect="plain">
                              {{ nativeArtifacts.linux ? t('generated') : t('notGenerated') }}
                            </el-tag>
                          </div>
                        </div>
                        <div class="native-release-tip">
                          {{ t('release.tip') }}
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
                <div v-else class="editor-empty">
                  <el-empty :description="t('emptyRunRepo')" />
                </div>
              </el-tab-pane>

              <el-tab-pane :label="t('tabs.editor')" name="editor">
                <div v-if="editorRepo" class="editor-tab-shell">
                  <RepositoryEditor :repo="editorRepo" />
                </div>
                <div v-else class="editor-empty">
                  <el-empty :description="t('emptyEditorRepo')" />
                </div>
              </el-tab-pane>

              <el-tab-pane :label="t('tabs.versions')" name="versions">
                <div class="versions-tab">
                  <div class="versions-header">
                    <div>
                      <div class="versions-title">{{ t('versions.title') }}</div>
                      <div class="versions-subtitle">{{ t('versions.subtitle') }}</div>
                    </div>
                    <el-button type="primary" @click="openPublishDialog">{{ t('actions.publishNewVersion') }}</el-button>
                  </div>

                  <el-table
                    :data="selectedItem.versionRecords"
                    border
                    stripe
                    height="calc(100% - 64px)"
                  >
                    <el-table-column prop="version" :label="t('versions.version')" width="120" />
                    <el-table-column :label="t('versions.status')" width="110">
                      <template #default="{ row }">
                        <el-tag :type="row.status === 'published' ? 'success' : 'info'" effect="plain">
                          {{ row.status === 'published' ? t('versions.published') : t('versions.mock') }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('versions.publishedAt')" min-width="180">
                      <template #default="{ row }">
                        {{ formatTime(row.publishedAt) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="downloadUrl" :label="t('versions.downloadUrl')" min-width="280" show-overflow-tooltip />
                    <el-table-column prop="changelog" :label="t('versions.changelog')" min-width="320" show-overflow-tooltip />
                  </el-table>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>

          <div v-else class="detail-empty">
            <el-empty :description="t('emptySelection')" />
          </div>
        </section>
      </div>

      <DevCreateDialog
        v-model:visible="createDialogVisible"
        :saving="createLoading"
        @submit="createPlugin"
      />

      <DevPublishVersionDialog
        v-model:visible="publishDialogVisible"
        :saving="publishLoading"
        :uuid="selectedItem?.uuid || ''"
        :default-version="selectedItem?.version || ''"
        @submit="publishVersion"
      />

      <el-dialog
        v-model="weixinDialogVisible"
        :title="t('developerGroup')"
        width="360px"
        align-center
      >
        <div class="weixin-dialog">
          <img :src="weixinQrUrl" :alt="t('developerGroupQrAlt')" />
          <div class="weixin-dialog-tip">{{ t('developerGroupQrTip') }}</div>
        </div>
      </el-dialog>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { homeDir, join } from '@/utils/remotePath';
import { listHostDir, type HostDirEntry } from '@/utils/hostFs';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { RefreshRight, Tools } from '@element-plus/icons-vue';
import { resolveToolPluginIcon, type ToolPlugin } from '@/platform/ui/tools/plugins';
import ProjectRunButton from '@/platform/ui/common/project-runner/ProjectRunButton.vue';
import ProjectTerminalPanel from '@/platform/ui/common/project-runner/ProjectTerminalPanel.vue';
import {
  getProjectEditorErrorMessage,
  openProjectInEditor,
} from '@/platform/services/project-editor/editorOpener';
import type {
  ProjectBuiltinTerminalHandle,
  ProjectRunLoadError,
} from '@/platform/services/project-runner/types';
import {
  getProjectRunErrorMessage,
  runProjectCommand,
} from '@/platform/services/project-runner/commandRunner';
import RepositoryEditor from '../../../../plugins/otools-git/src/RepositoryEditor.vue';
import DevCreateDialog from './DevCreateDialog.vue';
import DevPublishVersionDialog from './DevPublishVersionDialog.vue';
import DevStandaloneNativeBuild from './DevStandaloneNativeBuild.vue';
import { currentLocaleRef, useI18nScope } from '@/platform/i18n';
import type {
  DevPluginActionResult,
  DevPluginInput,
  DevPluginRecord,
  DevPublishVersionInput,
  DevWorkspace
} from './types';

interface EditorRepoInfo {
  id: number;
  label: string;
  path: string;
  isRoot?: boolean;
}

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
interface DevNativeConfig {
  enabled: boolean;
  manifestPath: string;
}

const screenshotSlotMax = 5;
const { t } = useI18nScope('dev.main');

const resolvePluginDisplayName = (item: Pick<DevPluginRecord, 'displayName' | 'displayNameCN'>) =>
  currentLocaleRef.value === 'zh-CN'
    ? String(item.displayNameCN || item.displayName || '').trim()
    : String(item.displayName || item.displayNameCN || '').trim();

const createScreenshotSlots = (count = 1) =>
  Array.from({ length: Math.max(1, Math.min(count, screenshotSlotMax)) }, () => '');

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

const resolvePluginIcon = (icon: string) => resolveToolPluginIcon({ icon } as ToolPlugin);

const isImageIcon = (icon: string) =>
  /^https?:\/\//.test(icon) || icon.startsWith('tauri://') || icon.includes('/');

const normalizeScreenshotSlots = (value: string[] = []) => {
  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, screenshotSlotMax);
  return normalized.length ? normalized : createScreenshotSlots();
};

const compactScreenshotSlots = (value: string[] = []) =>
  value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, screenshotSlotMax);

const workspace = ref<DevWorkspace | null>(null);
const loading = ref(false);
const createLoading = ref(false);
const saveLoading = ref(false);
const publishLoading = ref(false);
const actionLoading = ref('');
const createDialogVisible = ref(false);
const publishDialogVisible = ref(false);
const selectedUuid = ref('');
const activeTab = ref('basic');
const devSection = ref<'web' | 'rust'>('web');
const detailFormRef = ref<FormInstance>();
const devRunTermPanelRef = ref<ProjectTerminalPanelExpose | null>(null);
const showStandaloneBuild = ref(false);
const weixinDialogVisible = ref(false);
const weixinQrUrl = 'https://uview-plus.jiangruyi.com/weixin.jpg';

const pluginItems = computed(() =>
  (workspace.value?.items || []).map((item) => ({
    ...item,
    resolvedIcon: resolvePluginIcon(item.icon)
  }))
);

const createEmptyForm = (): DevPluginInput => ({
  packid: '',
  displayName: '',
  displayNameCN: '',
  developerName: '',
  summary: '',
  screenshots: createScreenshotSlots(),
  version: '0.1.0',
  icon: '',
  devUrl: 'http://127.0.0.1:5173',
  hasAd: false,
  inPluginPurchase: false,
  agreementAccepted: true
});

const detailForm = reactive<DevPluginInput>(createEmptyForm());

const validateHttpsImageIcon = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  const text = String(value || '').trim();
  if (!text) {
    callback(new Error(t('validation.iconRequired')));
    return;
  }
  if (!isValidPluginIcon(text)) {
    callback(new Error(t('validation.iconInvalid')));
    return;
  }
  callback();
};

const validateHttpsImageScreenshots = (_rule: unknown, value: string[], callback: (error?: Error) => void) => {
  const items = compactScreenshotSlots(Array.isArray(value) ? value : []);
  const invalid = items.find((item) => !isHttpsImageUrl(item));
  if (invalid) {
    callback(new Error(t('validation.screenshotInvalid', { value: invalid })));
    return;
  }
  callback();
};

const detailRules: FormRules<DevPluginInput> = {
  packid: [{ required: true, message: t('validation.packidRequired'), trigger: 'blur' }],
  displayName: [{ required: true, message: t('validation.displayNameRequired'), trigger: 'blur' }],
  developerName: [{ required: true, message: t('validation.developerNameRequired'), trigger: 'blur' }],
  icon: [{ validator: validateHttpsImageIcon, trigger: 'blur' }],
  screenshots: [{ validator: validateHttpsImageScreenshots, trigger: 'blur' }]
};

const selectedItem = computed<DevPluginRecord | null>(() => {
  const items = workspace.value?.items || [];
  return items.find((item) => item.uuid === selectedUuid.value) || null;
});

const selectedResolvedIcon = computed(() => {
  const item = selectedItem.value;
  return item ? resolvePluginIcon(item.icon) : '';
});

const editorRepo = computed<EditorRepoInfo | null>(() => {
  const item = selectedItem.value;
  if (!item?.directoryBound) {
    return null;
  }
  return {
    id: 1,
    label: resolvePluginDisplayName(item),
    path: item.boundDirectoryPath,
    isRoot: true
  };
});

const runRepoPath = computed(() => {
  const item = selectedItem.value;
  if (!item?.directoryBound) {
    return '';
  }
  return item.boundDirectoryPath || '';
});

const nativeEnabled = ref(false);
const nativeEnabledLoading = ref(false);
const nativeArtifactsLoading = ref(false);
const nativeLibDir = ref('');
const nativeArtifacts = reactive({
  mac: false,
  windows: false,
  linux: false,
  checked: false,
});
const nativeProbeLoading = ref(false);
const nativeInvokeLoading = ref(false);
const nativeProbeInfo = ref<NativePluginProbe | null>(null);
const nativeInvokeMethod = ref('ping');
const nativeInvokePayload = ref('{"message":"hello"}');
const nativeInvokeOutput = ref('');

const stringifyNative = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
};

const nativeProbeText = computed(() => {
  if (!nativeProbeInfo.value) {
    return t('native.emptyProbeResult');
  }
  return stringifyNative(nativeProbeInfo.value);
});

const nativeInvokeText = computed(() => {
  if (!nativeInvokeOutput.value) {
    return t('native.emptyInvokeResult');
  }
  return nativeInvokeOutput.value;
});

const assignDetailForm = (item: DevPluginRecord | null) => {
  if (!item) {
    Object.assign(detailForm, createEmptyForm());
    return;
  }
  Object.assign(detailForm, {
    packid: item.packid,
    displayName: item.displayName,
    displayNameCN: item.displayNameCN || '',
    developerName: item.developerName,
    summary: item.summary,
    screenshots: normalizeScreenshotSlots(item.screenshots || []),
    version: item.version,
    icon: item.icon,
    devUrl: item.devUrl,
    hasAd: item.hasAd ?? false,
    inPluginPurchase: item.inPluginPurchase ?? false,
    agreementAccepted: item.agreementAccepted
  });
  detailFormRef.value?.clearValidate();
};

const addDetailScreenshotInput = () => {
  if (detailForm.screenshots.length >= screenshotSlotMax) {
    return;
  }
  detailForm.screenshots.push('');
};

const removeDetailScreenshotInput = () => {
  if (detailForm.screenshots.length <= 1) {
    return;
  }
  detailForm.screenshots.pop();
};

watch(
  selectedItem,
  (item) => {
    assignDetailForm(item);
    devSection.value = 'web';
    nativeProbeInfo.value = null;
    nativeInvokeOutput.value = '';
    nativeInvokeMethod.value = 'ping';
    nativeInvokePayload.value = '{"message":"hello"}';
    nativeEnabled.value = false;
    nativeArtifacts.mac = false;
    nativeArtifacts.windows = false;
    nativeArtifacts.linux = false;
    nativeArtifacts.checked = false;
    nativeLibDir.value = '';
    if (item) {
      void loadNativeEnabled();
      void refreshNativeArtifacts();
    }
  },
  { immediate: true }
);

const loadWorkspace = async (preferredUuid?: string) => {
  loading.value = true;
  try {
    const result = await invoke<DevWorkspace>('dev_get_workspace');
    workspace.value = result;
    const items = result.items || [];
    if (preferredUuid && items.some((item) => item.uuid === preferredUuid)) {
      selectedUuid.value = preferredUuid;
    } else if (selectedUuid.value && items.some((item) => item.uuid === selectedUuid.value)) {
      selectedUuid.value = selectedUuid.value;
    } else {
      selectedUuid.value = items[0]?.uuid || '';
    }
  } catch (error) {
    ElMessage.error(t('messages.loadWorkspaceFailed', { message: String(error) }));
  } finally {
    loading.value = false;
  }
};

const createPlugin = async (payload: DevPluginInput) => {
  createLoading.value = true;
  try {
    const result = await invoke<DevPluginActionResult>('dev_create_plugin', { input: payload });
    createDialogVisible.value = false;
    await loadWorkspace(result.item.uuid);
    activeTab.value = 'basic';
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('messages.createPluginFailed', { message: String(error) }));
  } finally {
    createLoading.value = false;
  }
};

const saveCurrentMeta = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  const valid = await detailFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  saveLoading.value = true;
  try {
    const result = await invoke<DevPluginActionResult>('dev_update_plugin', {
      input: {
        uuid: current.uuid,
        meta: {
          packid: detailForm.packid.trim(),
          displayName: detailForm.displayName.trim(),
          displayNameCN: String(detailForm.displayNameCN || '').trim(),
          developerName: detailForm.developerName.trim(),
          summary: detailForm.summary.trim(),
          screenshots: compactScreenshotSlots(detailForm.screenshots),
          version: detailForm.version.trim(),
          icon: detailForm.icon.trim(),
          devUrl: detailForm.devUrl.trim(),
          hasAd: Boolean(detailForm.hasAd),
          inPluginPurchase: Boolean(detailForm.inPluginPurchase),
          agreementAccepted: Boolean(detailForm.agreementAccepted)
        }
      }
    });
    await loadWorkspace(result.item.uuid);
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('messages.saveFailed', { message: String(error) }));
  } finally {
    saveLoading.value = false;
  }
};

const withActionLoading = async (key: string, runner: () => Promise<void>, errorPrefix: string) => {
  actionLoading.value = key;
  try {
    await runner();
  } catch (error) {
    ElMessage.error(`${errorPrefix}: ${String(error)}`);
  } finally {
    actionLoading.value = '';
  }
};

const bindDirectory = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  await withActionLoading('bind', async () => {
    const selected = await openDialog({
      title: t('dialogs.selectDevDirectory'),
      multiple: false,
      directory: true
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }
    const result = await invoke<DevPluginActionResult>('dev_bind_plugin_directory', {
      input: {
        uuid: current.uuid,
        directoryPath: selected
      }
    });
    await loadWorkspace(result.item.uuid);
    ElMessage.success(result.message);
  }, t('messages.bindDirectoryFailed'));
};

const enableDebug = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  await withActionLoading('debug', async () => {
    const message = await invoke<string>('dev_enable_debug', { uuid: current.uuid });
    await invoke('otools_reload_all_plugins');
    await loadWorkspace(current.uuid);
    ElMessage.success(message);
  }, t('messages.enableDebugFailed'));
};

const sanitizeTabIdentifier = (value?: string) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9\-/:_]/g, '-');

const buildDevDebugWindowLabel = (uuid: string) => `tools-tab-plugin-${sanitizeTabIdentifier(uuid)}`;

const disableDebug = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  await withActionLoading('disable-debug', async () => {
    const message = await invoke<string>('dev_disable_debug', { uuid: current.uuid });
    const windowLabel = buildDevDebugWindowLabel(current.uuid);
    try {
      await invoke('close_tools_tab_window', { label: windowLabel });
      ElMessage.success(message || t('messages.disableDebugSuccess'));
    } catch (error) {
      ElMessage.warning(t('messages.disableDebugCloseWindowFailed', { message: String(error) }));
    }
    await invoke('otools_reload_all_plugins');
    await loadWorkspace(current.uuid);
  }, t('messages.disableDebugFailed'));
};

const openInVsCode = async () => {
  const current = selectedItem.value;
  if (!current?.directoryBound) {
    ElMessage.warning(t('messages.bindDirectoryFirst'));
    return;
  }
  actionLoading.value = 'vscode';
  try {
    await openProjectInEditor(current.boundDirectoryPath, 'vscode');
  } catch (error) {
    ElMessage.error(`${t('messages.openVsCodeFailed')}: ${getProjectEditorErrorMessage(error)}`);
  } finally {
    actionLoading.value = '';
  }
};

const openDocs = async () => {
  const url = String(workspace.value?.docsUrl || '').trim();
  if (!url) {
    return;
  }
  await withActionLoading('docs', async () => {
    try {
      await openExternal(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, t('messages.openDocsFailed'));
};

const initializeVueProject = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  await withActionLoading('init', async () => {
    const message = await invoke<string>('dev_initialize_vue_project', { uuid: current.uuid });
    ElMessage.success(message);
  }, t('messages.initVueFailed'));
};

const initializeNativeProject = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  devSection.value = 'rust';
  await withActionLoading('init-native', async () => {
    const message = await invoke<string>('dev_initialize_native_project', { uuid: current.uuid });
    ElMessage.success(message);
  }, t('messages.initNativeFailed'));
};

const buildNativePlugin = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  devSection.value = 'rust';
  const terminalPanel = devRunTermPanelRef.value;
  let buildTabId = '';
  if (terminalPanel?.openTab) {
    buildTabId = terminalPanel.openTab(
      `${t('terminal.nativeBuild')} · ${resolvePluginDisplayName(current) || current.packid || current.uuid}`,
      runRepoPath.value
    );
    await terminalPanel.appendOutput?.(buildTabId, `[OTools] ${t('terminal.nativeBuildStarted', { time: new Date().toLocaleTimeString() })}\n`);
  }
  await withActionLoading('build-native', async () => {
    const started = await invoke<DevNativeBuildJobStart>('dev_start_native_plugin_build', { uuid: current.uuid });
    let lastLogLength = 0;
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const snapshot = await invoke<DevNativeBuildJobSnapshot>('dev_get_native_build_job', { jobId: started.jobId });
      const log = String(snapshot.log || '');
      if (buildTabId && terminalPanel?.appendOutput && log.length > lastLogLength) {
        await terminalPanel.appendOutput(buildTabId, log.slice(lastLogLength));
      }
      lastLogLength = log.length;
      if (snapshot.running) {
        continue;
      }
      if (snapshot.success) {
        try {
          await invoke('native_plugin_reload', { uuid: current.uuid });
        } catch {
          // ignore reload errors
        }
        await refreshNativeArtifacts();
        ElMessage.success(snapshot.message || t('terminal.nativeBuild'));
        return;
      }
      throw new Error(snapshot.error || t('messages.buildNativeFailed'));
    }
  }, t('messages.buildNativeFailed'));
};
const reloadNativePlugin = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  devSection.value = 'rust';
  await withActionLoading('reload-native', async () => {
    const message = await invoke<string>('native_plugin_reload', { uuid: current.uuid });
    await refreshNativeArtifacts();
    ElMessage.success(message);
  }, t('messages.reloadNativeFailed'));
};

const loadNativeEnabled = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  nativeEnabledLoading.value = true;
  try {
    const result = await invoke<DevNativeConfig>('dev_get_native_config', { uuid: current.uuid });
    nativeEnabled.value = Boolean(result?.enabled);
  } catch (error) {
    nativeEnabled.value = false;
  } finally {
    nativeEnabledLoading.value = false;
  }
};

const resolveNativeLibDir = async () => {
  const current = selectedItem.value;
  if (!current) {
    nativeLibDir.value = '';
    return '';
  }
  if (current.directoryBound && current.boundDirectoryPath) {
    const libDir = await join(current.boundDirectoryPath, 'lib');
    nativeLibDir.value = libDir;
    return libDir;
  }
  const home = await homeDir();
  const libDir = await join(home, '.otools', 'plugins', current.uuid, 'lib');
  nativeLibDir.value = libDir;
  return libDir;
};

const refreshNativeArtifacts = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  nativeArtifactsLoading.value = true;
  try {
    const libDir = nativeLibDir.value || (await resolveNativeLibDir());
    const entries = await listHostDir(libDir) as HostDirEntry[];
    const names = new Set(
      entries.filter((item) => item.kind === 'file').map((item) => item.name)
    );
    nativeArtifacts.mac = names.has('macOS.dylib');
    nativeArtifacts.windows = names.has('Windows.dll');
    nativeArtifacts.linux = names.has('Linux.so');
    nativeArtifacts.checked = true;
  } catch {
    nativeArtifacts.mac = false;
    nativeArtifacts.windows = false;
    nativeArtifacts.linux = false;
    nativeArtifacts.checked = true;
  } finally {
    nativeArtifactsLoading.value = false;
  }
};

const handleNativeEnabledChange = async (value: boolean) => {
  const current = selectedItem.value;
  if (!current) {
    nativeEnabled.value = false;
    return;
  }
  nativeEnabledLoading.value = true;
  try {
    const message = await invoke<string>('dev_set_native_enabled', {
      uuid: current.uuid,
      enabled: value,
    });
    nativeEnabled.value = value;
    ElMessage.success(message);
    await refreshNativeArtifacts();
    await probeNative();
  } catch (error) {
    nativeEnabled.value = !value;
    ElMessage.error(t('messages.updateNativeFailed', { message: String(error) }));
  } finally {
    nativeEnabledLoading.value = false;
  }
};

const parseNativePayload = () => {
  const text = nativeInvokePayload.value.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(t('messages.parsePayloadFailed', { message: String(error) }));
  }
};

const probeNative = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  devSection.value = 'rust';
  nativeProbeLoading.value = true;
  try {
    nativeProbeInfo.value = await window.otools.probeNativePlugin(current.uuid);
    if (typeof nativeProbeInfo.value?.enabled === 'boolean') {
      nativeEnabled.value = nativeProbeInfo.value.enabled;
    }
    ElMessage.success(t('messages.probeSuccess'));
  } catch (error) {
    nativeProbeInfo.value = null;
    ElMessage.error(t('messages.probeFailed', { message: String(error) }));
  } finally {
    nativeProbeLoading.value = false;
  }
};

const invokeNative = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  devSection.value = 'rust';
  nativeInvokeLoading.value = true;
  try {
    const method = nativeInvokeMethod.value.trim() || 'ping';
    const payload = parseNativePayload();
    const result = await window.otools.invokeNativePluginRaw(current.uuid, method, payload);
    nativeInvokeOutput.value = stringifyNative(result);
    ElMessage.success(t('messages.invokeSuccess'));
  } catch (error) {
    nativeInvokeOutput.value = t('messages.invokeFailed', { message: String(error) });
    ElMessage.error(t('messages.invokeFailed', { message: String(error) }));
  } finally {
    nativeInvokeLoading.value = false;
  }
};

const packPlugin = async () => {
  const current = selectedItem.value;
  if (!current) {
    return;
  }
  await withActionLoading('pack', async () => {
    const result = await invoke<DevPluginActionResult>('dev_pack_plugin', { uuid: current.uuid });
    await loadWorkspace(result.item.uuid);
    ElMessage.success(result.message);
  }, t('messages.packFailed'));
};

const openPublishDialog = () => {
  if (!selectedItem.value) {
    ElMessage.warning(t('messages.selectPluginFirst'));
    return;
  }
  ElMessage.info(t('messages.publishNotAvailable'));
};

const publishVersion = async (payload: DevPublishVersionInput) => {
  publishLoading.value = true;
  try {
    const result = await invoke<DevPluginActionResult>('dev_publish_version', {
      input: payload
    });
    publishDialogVisible.value = false;
    await loadWorkspace(result.item.uuid);
    activeTab.value = 'versions';
    ElMessage.success(result.message);
  } catch (error) {
    ElMessage.error(t('messages.publishVersionFailed', { message: String(error) }));
  } finally {
    publishLoading.value = false;
  }
};

const handleRunProjectLoadError = (payload: ProjectRunLoadError) => {
  ElMessage.error(t('messages.runProjectLoadFailed', { message: payload.message }));
};

const prepareDevBuiltinTerminal = async (): Promise<ProjectBuiltinTerminalHandle | null> => {
  activeTab.value = 'dev';
  devSection.value = 'web';
  await nextTick();
  return devRunTermPanelRef.value;
};

const handleRunScript = async (payload: { scriptName: string; command: string }) => {
  if (!payload?.command) {
    return;
  }
  if (!runRepoPath.value) {
    ElMessage.warning(t('messages.bindDirectoryFirst'));
    return;
  }

  try {
    const result = await runProjectCommand({
      target: 'builtin-terminal',
      command: payload.command,
      workingDir: runRepoPath.value,
      prepareBuiltinTerminal: prepareDevBuiltinTerminal,
    });
    if (result.code === 'BUILTIN_TERMINAL_EXECUTED') {
      ElMessage.success(t('messages.runInTerminal', { command: payload.command }));
    }
  } catch (error) {
    console.error('在 Dev 终端执行命令失败:', error);
    const detail = getProjectRunErrorMessage(error);
    ElMessage.error(t('messages.runCommandFailed', { message: detail }));
  }
};

const formatTime = (value: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return value || '-';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

onMounted(() => {
  void loadWorkspace();
});
</script>

<style scoped lang="scss">
.dev-page {
  height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.08), transparent 22%),
    radial-gradient(circle at bottom right, rgba(45, 212, 191, 0.08), transparent 20%),
    var(--el-bg-color);
}

.dev-layout {
  height: 100%;
  display: flex;
  overflow: hidden;
}

.dev-sidebar {
  width: 292px;
  border-right: 1px solid var(--el-border-color-light);
  padding: 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: color-mix(in srgb, var(--el-fill-color-blank) 82%, transparent);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.sidebar-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.1;
  color: var(--el-text-color-primary);
}

.sidebar-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.create-plugin-button {
  width: 100%;
  min-height: 72px;
  border: 1px dashed var(--el-border-color);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(45, 212, 191, 0.08));
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
}

.create-plugin-button:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-1px);
}

.create-plugin-icon {
  font-size: 22px;
  line-height: 1;
}

.sidebar-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
  word-break: break-all;
}

.plugin-list-scroll {
  flex: 1;
}

.dev-resources {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: var(--el-fill-color-blank);
}

.dev-resources-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.dev-resources-links {
  display: flex;
  justify-content: space-around;
  gap: 6px;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.plugin-list-item {
  text-align: left;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 12px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.plugin-list-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.plugin-list-item.active {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary-light-9) 78%, transparent);
}

.plugin-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plugin-list-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.plugin-list-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  flex: 0 0 28px;
}

.plugin-list-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plugin-list-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-list-id {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.plugin-list-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dev-content {
  flex: 1;
  min-width: 0;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}


.detail-shell,
.detail-empty {
  flex: 1;
  min-height: 0;
}

.detail-shell {
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.detail-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  flex: 0 0 34px;
}

.detail-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.detail-header-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-tabs :deep(.el-tab-pane) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.basic-tab {
  height: 100%;
  overflow: auto;
  padding-right: 6px;
}

.path-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.path-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 12px;
  background: var(--el-fill-color-light);
}

.path-label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.path-value {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--el-text-color-primary);
}

.detail-form {
  padding-bottom: 8px;
}

.screenshots-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.screenshots-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.screenshots-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.screenshot-add-btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}

.screenshots-empty {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 0 4px;
}

.editor-tab-shell,
.editor-empty {
  height: calc(100vh - 210px);
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  overflow: hidden;
  background: var(--el-fill-color-blank);
}

.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.run-tab-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 6px;
}

.dev-section-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dev-section-button {
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: var(--el-fill-color-blank);
  padding: 12px 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.dev-section-button:hover {
  border-color: var(--el-color-primary-light-5);
  // transform: translateY(1px);
}

.dev-section-button.active {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary-light-9) 78%, transparent);
}

.dev-section-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: 0.04em;
}

.dev-section-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.run-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  background: var(--el-fill-color-light);
}

.run-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.run-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.run-toolbar-section {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.run-toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 120px;
  padding-top: 6px;
}

.run-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.run-terminal-shell {
  flex: 1;
  min-height: 260px;
}

.run-terminal-shell :deep(.git-term-panel) {
  height: 100%;
  border-radius: 14px;
}

.weixin-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.weixin-dialog img {
  width: 240px;
  height: 240px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.weixin-dialog-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.native-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.native-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.native-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.native-panel-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.native-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.native-panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
}

.native-form {
  padding: 6px 0 0;
}

.native-panel-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.native-panel-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.native-panel-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.native-panel-output {
  margin: 0;
  min-height: 120px;
  padding: 10px 12px;
  border-radius: 10px;
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

.native-release {
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.native-release-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.native-release-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.native-release-path {
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.native-release-path span {
  color: var(--el-text-color-primary);
}

.native-release-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.native-release-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.native-release-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.versions-tab {
  height: calc(100vh - 210px);
}

.versions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.versions-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.versions-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 980px) {
  .dev-layout {
    flex-direction: column;
  }

  .dev-sidebar {
    width: 100%;
    height: 320px;
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-light);
  }

  .path-strip {
    grid-template-columns: 1fr;
  }

  .run-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .dev-section-switch {
    grid-template-columns: 1fr;
  }

  .run-toolbar-actions {
    justify-content: flex-start;
  }
}
</style>

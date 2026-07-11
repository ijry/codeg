<template>
  <div class="o-tabs" :class="[`o-tabs--${resolvedType}`, { 'o-tabs--with-side': hasSideTools }]">
    <div class="o-tabs__main">
      <button
        v-show="showScrollControls"
        class="o-tabs__scroll-btn"
        :class="{ 'is-disabled': !canScrollLeft }"
        type="button"
        aria-label="向左滚动标签"
        @click="scrollTabs('left')"
      >
        <el-icon><ArrowLeftBold /></el-icon>
      </button>

      <div
        ref="viewportRef"
        class="o-tabs__viewport"
        @scroll.passive="syncScrollState"
        @wheel="handleViewportWheel"
      >
        <div ref="listRef" class="o-tabs__list" @click="handleListClick">
          <button
            v-for="tab in tabs"
            :key="tab.name"
            class="o-tabs__item"
            :class="{
              'is-active': modelValue === tab.name,
              'is-locked': !!tab.locked,
              'is-disabled': !!tab.disabled,
            }"
            type="button"
            :data-tab-name="tab.name"
            @click="handleTabClick(tab)"
            @keydown.enter.prevent="handleTabClick(tab)"
            @keydown.space.prevent="handleTabClick(tab)"
          >
            <span class="o-tabs__item-main">
              <el-icon v-if="tab.locked" class="o-tabs__lock"><Lock /></el-icon>
              <span class="o-tabs__label" :title="tab.label">{{ tab.label }}</span>
            </span>

            <span
              v-if="isTabRemovable(tab)"
              class="o-tabs__close"
              role="button"
              tabindex="0"
              aria-label="关闭标签"
              @click.stop="handleTabRemove(tab.name)"
              @keydown.enter.prevent.stop="handleTabRemove(tab.name)"
              @keydown.space.prevent.stop="handleTabRemove(tab.name)"
            >
              <el-icon><Close /></el-icon>
            </span>
          </button>

          <button
            v-if="showAdd"
            class="o-tabs__add-btn o-tabs__add-inline"
            :class="{ 'is-expandable': addExpandable }"
            type="button"
            :disabled="addDisabled"
            :aria-label="addLabel"
            @click="handleAddClick"
          >
            <el-icon><Plus /></el-icon>
            <span v-if="addExpandable" class="o-tabs__add-label">{{ addLabel }}</span>
          </button>
        </div>
      </div>

      <button
        v-show="showScrollControls"
        class="o-tabs__scroll-btn"
        :class="{ 'is-disabled': !canScrollRight }"
        type="button"
        aria-label="向右滚动标签"
        @click="scrollTabs('right')"
      >
        <el-icon><ArrowRightBold /></el-icon>
      </button>
    </div>

    <div v-if="hasSideTools" class="o-tabs__side">
      <slot name="actions" />

      <el-dropdown v-if="showMenu" trigger="click" placement="bottom-end" @command="handleMenuCommand">
        <button class="o-tabs__menu-btn" type="button" aria-label="标签菜单">
          <el-icon><MoreFilled /></el-icon>
        </button>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="close-all" :disabled="removableTabs.length === 0">
              {{ closeAllText }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <slot name="right" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useSlots, watch } from 'vue';
import { ArrowLeftBold, ArrowRightBold, Close, Lock, MoreFilled, Plus } from '@element-plus/icons-vue';
import type { OTabsItem, OTabsType } from './otabs';

type ScrollDirection = 'left' | 'right';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    tabs: OTabsItem[];
    closeAllText?: string;
    type?: OTabsType;
    showMenu?: boolean;
    showAdd?: boolean;
    addLabel?: string;
    addDisabled?: boolean;
    addExpandable?: boolean;
  }>(),
  {
    closeAllText: '关闭所有（保留锁定）',
    type: 'card',
    showMenu: true,
    showAdd: false,
    addLabel: '新增',
    addDisabled: false,
    addExpandable: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'tab-remove', name: string): void;
  (e: 'close-all', names: string[]): void;
  (e: 'tab-click', name: string): void;
  (e: 'add'): void;
}>();

const viewportRef = ref<HTMLDivElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);
const showScrollControls = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const slots = useSlots();
let resizeObserver: ResizeObserver | null = null;
let suppressNextListClick = false;

const resolvedType = computed(() => {
  const type = props.type || 'card';
  if (type === 'toolbar') {
    return 'tools';
  }
  if (type === 'terminal') {
    return 'git-term';
  }
  return type;
});

const isTabRemovable = (tab: OTabsItem) => !!tab.closable && !tab.locked;

const removableTabs = computed(() => props.tabs.filter((tab) => isTabRemovable(tab)));
const hasSideTools = computed(() => props.showMenu || !!slots.actions || !!slots.right);

const syncScrollState = () => {
  const viewport = viewportRef.value;
  if (!viewport) {
    showScrollControls.value = false;
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }

  const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const currentScrollLeft = Math.max(0, viewport.scrollLeft);
  const hasOverflow = maxScrollLeft > 1;

  showScrollControls.value = hasOverflow;
  canScrollLeft.value = hasOverflow && currentScrollLeft > 1;
  canScrollRight.value = hasOverflow && currentScrollLeft < maxScrollLeft - 1;
};

const scheduleSyncScrollState = () => {
  requestAnimationFrame(() => {
    syncScrollState();
  });
};

const resolveTabSelector = (name: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(name);
  }
  return name.replace(/["\\]/g, '\\$&');
};

const scrollActiveTabIntoView = () => {
  const list = listRef.value;
  if (!list) {
    return;
  }
  const selector = resolveTabSelector(props.modelValue);
  const activeElement = list.querySelector<HTMLElement>(`[data-tab-name="${selector}"]`);
  if (!activeElement) {
    return;
  }

  activeElement.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest',
  });
};

const scrollTabs = (direction: ScrollDirection) => {
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }

  const delta = direction === 'left' ? -180 : 180;
  viewport.scrollBy({
    left: delta,
    behavior: 'smooth',
  });
  window.setTimeout(syncScrollState, 180);
};

const handleViewportWheel = (event: WheelEvent) => {
  const viewport = viewportRef.value;
  if (!viewport) {
    return;
  }

  const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  if (maxScrollLeft <= 1) {
    return;
  }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (Math.abs(delta) < 0.1) {
    return;
  }

  const previousScrollLeft = viewport.scrollLeft;
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, previousScrollLeft + delta));
  if (nextScrollLeft === previousScrollLeft) {
    return;
  }

  viewport.scrollLeft = nextScrollLeft;
  event.preventDefault();
  syncScrollState();
};

const handleTabClick = (tab: OTabsItem) => {
  if (tab.disabled) {
    return;
  }
  suppressNextListClick = true;
  emit('update:modelValue', tab.name);
  emit('tab-click', tab.name);
};

const handleListClick = (event: MouseEvent) => {
  if (suppressNextListClick) {
    suppressNextListClick = false;
    return;
  }
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  const button = target.closest('button[data-tab-name]');
  if (!button) {
    return;
  }
  const name = button.getAttribute('data-tab-name') || '';
  if (!name) {
    return;
  }
  const tab = props.tabs.find((item) => item.name === name);
  if (!tab) {
    return;
  }
  handleTabClick(tab);
};

const handleTabRemove = (name: string) => {
  emit('tab-remove', name);
};

const handleMenuCommand = (command: string | number | object) => {
  if (command !== 'close-all') {
    return;
  }

  emit(
    'close-all',
    removableTabs.value.map((tab) => tab.name)
  );
};

const handleAddClick = () => {
  if (props.addDisabled) {
    return;
  }
  emit('add');
};

watch(
  () => props.modelValue,
  async () => {
    await nextTick();
    scrollActiveTabIntoView();
    scheduleSyncScrollState();
  }
);

watch(
  () => props.tabs,
  async () => {
    await nextTick();
    scrollActiveTabIntoView();
    scheduleSyncScrollState();
  },
  { deep: true }
);

onMounted(() => {
  syncScrollState();
  window.addEventListener('resize', scheduleSyncScrollState);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      syncScrollState();
    });

    if (viewportRef.value) {
      resizeObserver.observe(viewportRef.value);
    }
    if (listRef.value) {
      resizeObserver.observe(listRef.value);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', scheduleSyncScrollState);
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.o-tabs {
  --o-tabs-gap: 8px;
  --o-tabs-main-gap: 8px;
  --o-tabs-side-gap: 8px;
  --o-tabs-item-gap: 8px;
  --o-tabs-item-height: 34px;
  --o-tabs-item-max-width: 240px;
  --o-tabs-item-padding: 0 12px;
  --o-tabs-item-border: 1px solid var(--layout-border-color);
  --o-tabs-item-radius: 10px 10px 0 0;
  --o-tabs-item-border-bottom-color: transparent;
  --o-tabs-item-bg: var(--el-fill-color-light);
  --o-tabs-item-hover-bg: var(--el-fill-color);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-bg-color);
  --o-tabs-item-active-color: var(--el-text-color-primary);
  --o-tabs-item-active-border-color: var(--layout-border-color);
  --o-tabs-item-active-border-bottom-color: var(--el-bg-color);
  --o-tabs-item-active-shadow: none;
  --o-tabs-close-size: 18px;
  --o-tabs-close-hover-bg: var(--el-fill-color);
  --o-tabs-close-hover-color: var(--el-text-color-primary);
  --o-tabs-button-size: 30px;
  --o-tabs-button-radius: 8px;
  --o-tabs-button-border: 1px solid var(--layout-border-color);
  --o-tabs-button-bg: var(--el-bg-color);
  --o-tabs-button-hover-bg: var(--el-fill-color-light);
  --o-tabs-button-color: var(--el-text-color-secondary);
  --o-tabs-button-hover-color: var(--el-text-color-primary);
  --o-tabs-scroll-btn-offset-y: -1px;
  --o-tabs-lock-color: var(--el-text-color-secondary);
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--o-tabs-gap);
}

.o-tabs__main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--o-tabs-main-gap);
}

.o-tabs__side {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--o-tabs-side-gap);
}

.o-tabs__viewport {
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.o-tabs__viewport::-webkit-scrollbar {
  display: none;
}

.o-tabs__list {
  width: max-content;
  min-width: 100%;
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.o-tabs__item {
  min-width: 0;
  max-width: var(--o-tabs-item-max-width);
  height: var(--o-tabs-item-height);
  display: inline-flex;
  align-items: center;
  gap: var(--o-tabs-item-gap);
  padding: var(--o-tabs-item-padding);
  border: var(--o-tabs-item-border);
  border-bottom-color: var(--o-tabs-item-border-bottom-color);
  border-radius: var(--o-tabs-item-radius);
  background: var(--o-tabs-item-bg);
  color: var(--o-tabs-item-color);
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.o-tabs__item:hover {
  background: var(--o-tabs-item-hover-bg);
}

.o-tabs__item.is-active {
  background: var(--o-tabs-item-active-bg);
  color: var(--o-tabs-item-active-color);
  border-color: var(--o-tabs-item-active-border-color);
  border-bottom-color: var(--o-tabs-item-active-border-bottom-color);
  box-shadow: var(--o-tabs-item-active-shadow);
}

.o-tabs__item.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.o-tabs__item-main {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.o-tabs__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.o-tabs__lock,
.o-tabs__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--o-tabs-lock-color);
}

.o-tabs__close {
  width: var(--o-tabs-close-size);
  height: var(--o-tabs-close-size);
  border-radius: 50%;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.o-tabs__close:hover {
  background: var(--o-tabs-close-hover-bg);
  color: var(--o-tabs-close-hover-color);
}

.o-tabs__scroll-btn,
.o-tabs__menu-btn,
.o-tabs__add-btn {
  width: var(--o-tabs-button-size);
  height: var(--o-tabs-button-size);
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  line-height: 1;
  border: var(--o-tabs-button-border);
  border-radius: var(--o-tabs-button-radius);
  background: var(--o-tabs-button-bg);
  color: var(--o-tabs-button-color);
  transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease;
}

.o-tabs__scroll-btn {
  position: relative;
  top: var(--o-tabs-scroll-btn-offset-y);
}

.o-tabs__scroll-btn .el-icon,
.o-tabs__menu-btn .el-icon,
.o-tabs__add-btn .el-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.o-tabs__scroll-btn:hover,
.o-tabs__menu-btn:hover,
.o-tabs__add-btn:hover {
  background: var(--o-tabs-button-hover-bg);
  color: var(--o-tabs-button-hover-color);
}

.o-tabs__add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.o-tabs__add-inline {
  flex: 0 0 auto;
}

.o-tabs__add-btn.is-expandable {
  width: auto;
  min-width: var(--o-tabs-button-size);
  padding: 0 8px;
  overflow: hidden;
}

.o-tabs__add-label {
  max-width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  transition: max-width 0.2s ease, margin-left 0.2s ease, opacity 0.15s ease;
}

.o-tabs__add-btn.is-expandable:hover .o-tabs__add-label,
.o-tabs__add-btn.is-expandable:focus-visible .o-tabs__add-label {
  max-width: 120px;
  margin-left: 6px;
  opacity: 1;
}

.o-tabs__scroll-btn.is-disabled {
  opacity: 0.45;
  cursor: default;
}

.o-tabs--tools {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 8px;
  --o-tabs-item-height: 28px;
  --o-tabs-item-padding: 0 10px;
  --o-tabs-item-radius: 6px;
  --o-tabs-item-border: 1px solid var(--tools-tab-border-color);
  --o-tabs-item-border-bottom-color: var(--tools-tab-border-color);
  --o-tabs-item-bg: var(--tools-tab-bg);
  --o-tabs-item-hover-bg: var(--tools-tab-hover-bg);
  --o-tabs-item-color: var(--tools-tab-color);
  --o-tabs-item-active-bg: var(--tools-tab-active-bg);
  --o-tabs-item-active-color: var(--tools-tab-active-color);
  --o-tabs-item-active-border-color: var(--tools-tab-active-border-color);
  --o-tabs-item-active-border-bottom-color: var(--tools-tab-active-border-color);
  --o-tabs-item-max-width: 260px;
  --o-tabs-button-size: 26px;
  --o-tabs-button-radius: 6px;
  --o-tabs-button-border: 1px solid var(--tools-tab-button-border-color);
  --o-tabs-button-bg: var(--tools-shell-bg);
  --o-tabs-button-hover-bg: var(--tools-tab-hover-bg);
  --o-tabs-button-color: var(--tools-tab-button-color);
  --o-tabs-button-hover-color: var(--tools-tab-active-color);
  --o-tabs-close-hover-color: var(--tools-tab-close-hover-color);
  --o-tabs-lock-color: var(--tools-tab-muted-color);
}

.o-tabs--tools .o-tabs__label {
  font-size: 12px;
}

.o-tabs--worktree {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 4px;
  --o-tabs-side-gap: 4px;
  --o-tabs-item-height: 26px;
  --o-tabs-item-padding: 0 10px;
  --o-tabs-item-radius: 999px;
  --o-tabs-item-border: 1px solid transparent;
  --o-tabs-item-border-bottom-color: transparent;
  --o-tabs-item-bg: var(--el-bg-color);
  --o-tabs-item-hover-bg: var(--el-bg-color);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-bg-color);
  --o-tabs-item-active-color: var(--el-text-color-primary);
  --o-tabs-item-active-border-color: var(--layout-border-color);
  --o-tabs-item-active-border-bottom-color: var(--layout-border-color);
  --o-tabs-item-max-width: 220px;
  --o-tabs-button-size: 24px;
  --o-tabs-button-radius: 999px;
  --o-tabs-button-border: 0 solid transparent;
  --o-tabs-button-bg: transparent;
  --o-tabs-button-hover-bg: var(--el-fill-color-light);
  --o-tabs-button-color: var(--el-text-color-secondary);
  --o-tabs-button-hover-color: var(--el-text-color-primary);
  padding: 4px 0 6px;
  border: none;
  border-radius: 0;
  background: var(--el-bg-color);
}

.o-tabs--worktree .o-tabs__label {
  font-size: 13px;
}

.o-tabs--git-term {
  --o-tabs-gap: 0;
  --o-tabs-main-gap: 0;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 30px;
  --o-tabs-item-padding: 0 10px;
  --o-tabs-item-radius: 0;
  --o-tabs-item-border: 0 solid transparent;
  --o-tabs-item-border-bottom-color: transparent;
  --o-tabs-item-bg: #f1f5f9;
  --o-tabs-item-hover-bg: #e8edf5;
  --o-tabs-item-color: #475569;
  --o-tabs-item-active-bg: #ffffff;
  --o-tabs-item-active-color: #111827;
  --o-tabs-item-active-border-bottom-color: transparent;
  --o-tabs-item-max-width: 240px;
  --o-tabs-button-size: 26px;
  --o-tabs-button-radius: 0;
  --o-tabs-button-border: 0 solid transparent;
  --o-tabs-button-bg: transparent;
}

.dark .o-tabs--git-term {
  --o-tabs-item-bg: var(--layout-border-color);
  --o-tabs-item-hover-bg: var(--el-fill-color-light);
  --o-tabs-item-color: var(--el-color-primary);
  --o-tabs-item-active-bg: var(--el-bg-color);
  --o-tabs-item-active-color: var(--el-text-color-primary);
}

.o-tabs--git-term .o-tabs__item {
  border-right: 1px solid #e2e8f0;
}

.dark .o-tabs--git-term .o-tabs__item {
  border-right: 1px solid var(--layout-border-color);
}

.o-tabs--pill {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 30px;
  --o-tabs-item-padding: 0 14px;
  --o-tabs-item-radius: 999px;
  --o-tabs-item-border: 1px solid var(--layout-border-color);
  --o-tabs-item-border-bottom-color: var(--layout-border-color);
  --o-tabs-item-bg: var(--el-fill-color-light);
  --o-tabs-item-hover-bg: var(--el-fill-color);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-color-primary-light-9);
  --o-tabs-item-active-color: var(--el-color-primary);
  --o-tabs-item-active-border-color: var(--el-color-primary-light-7);
  --o-tabs-item-active-border-bottom-color: var(--el-color-primary-light-7);
  --o-tabs-button-size: 28px;
}

.o-tabs--segmented {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 26px;
  --o-tabs-item-padding: 0 10px;
  --o-tabs-item-radius: 8px;
  --o-tabs-item-border: 1px solid var(--layout-border-color);
  --o-tabs-item-border-bottom-color: var(--layout-border-color);
  --o-tabs-item-bg: var(--el-fill-color-blank);
  --o-tabs-item-hover-bg: var(--el-fill-color-light);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-color-primary);
  --o-tabs-item-active-color: #fff;
  --o-tabs-item-active-border-color: var(--el-color-primary);
  --o-tabs-item-active-border-bottom-color: var(--el-color-primary);
  --o-tabs-button-size: 24px;
}

.o-tabs--segmented .o-tabs__label {
  font-size: 12px;
}

.o-tabs--mqtt {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 32px;
  --o-tabs-item-padding: 0 12px;
  --o-tabs-item-radius: 10px;
  --o-tabs-item-border: 1px solid var(--layout-border-color);
  --o-tabs-item-border-bottom-color: var(--layout-border-color);
  --o-tabs-item-bg: var(--el-bg-color);
  --o-tabs-item-hover-bg: var(--el-fill-color-light);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-color-primary-light-9);
  --o-tabs-item-active-color: var(--el-color-primary);
  --o-tabs-item-active-border-color: var(--el-color-primary-light-7);
  --o-tabs-item-active-border-bottom-color: var(--el-color-primary-light-7);
  --o-tabs-item-max-width: 240px;
  --o-tabs-button-size: 26px;
  --o-tabs-button-radius: 8px;
  --o-tabs-button-border: 1px solid var(--layout-border-color);
  --o-tabs-button-bg: var(--el-bg-color);
}

.dark .o-tabs--mqtt {
  --o-tabs-item-bg: var(--layout-border-color);
  --o-tabs-item-hover-bg: var(--el-fill-color-light);
  --o-tabs-item-active-bg: var(--el-color-primary-light-9);
  --o-tabs-item-active-color: var(--el-text-color-primary);
  --o-tabs-button-bg: var(--layout-border-color);
}

.o-tabs--ghost {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 30px;
  --o-tabs-item-padding: 0 12px;
  --o-tabs-item-radius: 6px;
  --o-tabs-item-border: 1px solid transparent;
  --o-tabs-item-bg: transparent;
  --o-tabs-item-hover-bg: var(--el-fill-color-light);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-fill-color-blank);
  --o-tabs-item-active-color: var(--el-text-color-primary);
  --o-tabs-item-active-border-color: var(--layout-border-color);
  --o-tabs-item-active-border-bottom-color: var(--layout-border-color);
}

.o-tabs--underline {
  --o-tabs-gap: 6px;
  --o-tabs-main-gap: 6px;
  --o-tabs-side-gap: 6px;
  --o-tabs-item-height: 30px;
  --o-tabs-item-padding: 0 12px;
  --o-tabs-item-radius: 0;
  --o-tabs-item-border: 0 solid transparent;
  --o-tabs-item-bg: var(--el-fill-color-light);
  --o-tabs-item-hover-bg: var(--el-color-primary-light-9);
  --o-tabs-item-color: var(--el-text-color-regular);
  --o-tabs-item-active-bg: var(--el-bg-color);
  --o-tabs-item-active-color: var(--el-color-primary);
  --o-tabs-item-active-border-color: transparent;
  --o-tabs-item-active-border-bottom-color: var(--el-color-primary);
  --o-tabs-button-size: 28px;
  --o-tabs-button-radius: 6px;
  --o-tabs-button-border: 1px solid var(--layout-border-color);
  --o-tabs-button-bg: var(--toolbar-bg-color, var(--el-bg-color));
}

.o-tabs--underline .o-tabs__item {
  border-bottom: 2px solid transparent;
}

.o-tabs--underline .o-tabs__item.is-active {
  border-bottom-color: var(--el-color-primary);
}

.o-tabs--underline .o-tabs__label {
  font-size: 13px;
}

.o-tabs--underline .o-tabs__close:hover {
  background: transparent;
}
</style>

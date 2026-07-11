import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import FsWindow from './common/FsWindow.vue';
import { t } from '../i18n';
import { isRemoteServiceRuntime } from '../runtime';
import { invoke } from '../transport/invoke';

export const showFsWindow = (request = {}) => {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  const container = document.createElement('div');
  document.body.appendChild(container);

  const cleanup = () => {
    window.setTimeout(() => {
      app.unmount();
      container.remove();
    }, 0);
  };

  const app = createApp(FsWindow, {
    request,
    onClose: cleanup,
    onError: (reason) => {
      console.error('showFsWindow failed:', reason);
    },
  });

  app.use(ElementPlus);
  app.mount(container);

  return Promise.resolve();
};

export const openHostFsWindow = async (path, options = {}) => {
  const target = String(path || '').trim();

  if (isRemoteServiceRuntime()) {
    return showFsWindow({
      title: options.title || t('platform.fsWindow.title'),
      defaultPath: target || undefined,
    });
  }

  if (!target) {
    return;
  }

  await invoke('open_directory', { path: target });
};

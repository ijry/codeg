import { ElMessage } from 'element-plus';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '../../tauri-plugin-notification-shim';
import { isNativeTauriRuntime } from './runtime';

const fallbackToMessage = (title, body) => {
  ElMessage.info(`${title}${body ? `: ${body}` : ''}`);
};

const sendBrowserNotification = async (title, body) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    fallbackToMessage(title, body);
    return;
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    fallbackToMessage(title, body);
    return;
  }

  new Notification(title, {
    body,
  });
};

export const sendNativeNotification = async (title, body) => {
  try {
    if (isNativeTauriRuntime()) {
      const permission = await isPermissionGranted();

      if (!permission) {
        const result = await requestPermission();
        if (result !== 'granted') {
          fallbackToMessage(title, body);
          return;
        }
      }

      await sendNotification({ title, body });
      return;
    }

    await sendBrowserNotification(title, body);
  } catch (error) {
    console.error('发送通知时出错:', error);
    fallbackToMessage(title, body);
  }
};

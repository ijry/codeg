import { ElMessage as t } from "element-plus";
import { isPermissionGranted as o, requestPermission as s, sendNotification as a } from "../../tauri-plugin-notification-shim.js";
import { isNativeTauriRuntime as f } from "../platform/transport/hostBridge.js";
const e = (n, i) => {
  t.info(`${n}${i ? `: ${i}` : ""}`);
}, c = async (n, i) => {
  if (typeof window > "u" || typeof Notification > "u") {
    e(n, i);
    return;
  }
  let r = Notification.permission;
  if (r !== "granted" && (r = await Notification.requestPermission()), r !== "granted") {
    e(n, i);
    return;
  }
  new Notification(n, {
    body: i
  });
}, N = async (n, i) => {
  try {
    if (f()) {
      if (!await o() && await s() !== "granted") {
        e(n, i);
        return;
      }
      await a({ title: n, body: i });
      return;
    }
    await c(n, i);
  } catch (r) {
    console.error("发送通知时出错:", r), e(n, i);
  }
};
export {
  N as sendNativeNotification
};
//# sourceMappingURL=notification.js.map

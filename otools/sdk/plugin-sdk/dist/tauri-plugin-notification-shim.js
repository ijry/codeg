async function n() {
  return typeof window > "u" || typeof Notification > "u" ? !1 : Notification.permission === "granted";
}
async function e() {
  return typeof window > "u" || typeof Notification > "u" ? "denied" : Notification.requestPermission();
}
async function t(i) {
  typeof window > "u" || typeof Notification > "u" || Notification.permission === "granted" && new Notification(i.title, { body: i.body });
}
export {
  n as isPermissionGranted,
  e as requestPermission,
  t as sendNotification
};
//# sourceMappingURL=tauri-plugin-notification-shim.js.map

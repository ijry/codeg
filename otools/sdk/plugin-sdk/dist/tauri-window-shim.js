import { ensurePopupManager as n } from "./popup-manager.js";
function t() {
  return {
    label: "current",
    async close() {
      n().closeCurrent(), typeof window < "u" && window.parent === window && window.close();
    },
    async hide() {
    },
    async show() {
      typeof window < "u" && window.focus();
    },
    async setFocus() {
      typeof window < "u" && window.focus();
    },
    async minimize() {
    },
    async toggleMaximize() {
    },
    async isMaximized() {
      return !1;
    },
    async innerSize() {
      return typeof window > "u" ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight };
    },
    async outerSize() {
      return typeof window > "u" ? { width: 0, height: 0 } : { width: window.outerWidth, height: window.outerHeight };
    },
    async setAlwaysOnTop(e) {
    },
    async setVisibleOnAllWorkspaces(e) {
    },
    async setPosition(e) {
    },
    async setSize(e) {
    },
    async setTitle(e) {
      typeof document < "u" && (document.title = e);
    },
    async onResized(e) {
      return () => {
      };
    }
  };
}
export {
  t as getCurrentWindow
};
//# sourceMappingURL=tauri-window-shim.js.map

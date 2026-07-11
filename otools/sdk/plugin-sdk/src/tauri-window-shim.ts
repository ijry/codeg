import { ensurePopupManager } from "./popup-manager";

type UnlistenFn = () => void;

type WindowShim = {
  label: string;
  close(): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  setFocus(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  innerSize(): Promise<{ width: number; height: number }>;
  outerSize(): Promise<{ width: number; height: number }>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  setVisibleOnAllWorkspaces(visible: boolean): Promise<void>;
  setPosition(position: unknown): Promise<void>;
  setSize(size: unknown): Promise<void>;
  setTitle(title: string): Promise<void>;
  onResized(handler: () => void): Promise<UnlistenFn>;
};

export function getCurrentWindow(): WindowShim {
  return {
    label: "current",
    async close() {
      ensurePopupManager().closeCurrent();
      if (typeof window !== "undefined" && window.parent === window) {
        window.close();
      }
    },
    async hide() {},
    async show() {
      if (typeof window !== "undefined") {
        window.focus();
      }
    },
    async setFocus() {
      if (typeof window !== "undefined") {
        window.focus();
      }
    },
    async minimize() {},
    async toggleMaximize() {},
    async isMaximized() {
      return false;
    },
    async innerSize() {
      if (typeof window === "undefined") {
        return { width: 0, height: 0 };
      }
      return { width: window.innerWidth, height: window.innerHeight };
    },
    async outerSize() {
      if (typeof window === "undefined") {
        return { width: 0, height: 0 };
      }
      return { width: window.outerWidth, height: window.outerHeight };
    },
    async setAlwaysOnTop(_alwaysOnTop: boolean) {},
    async setVisibleOnAllWorkspaces(_visible: boolean) {},
    async setPosition(_position: unknown) {},
    async setSize(_size: unknown) {},
    async setTitle(title: string) {
      if (typeof document !== "undefined") {
        document.title = title;
      }
    },
    async onResized(_handler: () => void) {
      return () => {};
    },
  };
}

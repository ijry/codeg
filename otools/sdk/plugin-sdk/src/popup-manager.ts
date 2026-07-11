const MANAGER_KEY = "__OTOOLS_POPUP_MANAGER__";
const POPUP_ID_ATTR = "data-otools-popup-id";
const POPUP_TARGET_ATTR = "data-otools-popup-target";

type PopupRecord = {
  root: HTMLDivElement;
};

function resolvePopupUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  try {
    return new URL(path).toString();
  } catch {
    return new URL(path, window.location.href).toString();
  }
}

class PopupManager {
  private sequence = 0;

  private readonly popups = new Map<string, PopupRecord>();

  open(path: string, command?: string, _payload?: unknown) {
    if (typeof window === "undefined") {
      return;
    }

    const popupId = `otools-popup-${++this.sequence}`;
    const doc = window.document;
    const root = doc.createElement("div");
    root.setAttribute(POPUP_ID_ATTR, popupId);
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(15,23,42,0.45)",
      "backdrop-filter:blur(6px)",
    ].join(";");

    const panel = doc.createElement("div");
    panel.style.cssText = [
      "position:relative",
      "display:flex",
      "flex-direction:column",
      "width:min(1120px,100%)",
      "height:min(760px,100%)",
      "overflow:hidden",
      "border-radius:16px",
      "border:1px solid rgba(148,163,184,0.28)",
      "background:#ffffff",
      "box-shadow:0 24px 80px rgba(15,23,42,0.28)",
    ].join(";");

    const closeButton = doc.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "z-index:2",
      "border:0",
      "border-radius:999px",
      "padding:8px 12px",
      "background:rgba(15,23,42,0.72)",
      "color:#ffffff",
      "cursor:pointer",
    ].join(";");
    closeButton.addEventListener("click", () => {
      this.close(popupId);
    });

    const iframe = doc.createElement("iframe");
    iframe.setAttribute(POPUP_TARGET_ATTR, command ?? "popup");
    iframe.dataset.otoolsPopupId = popupId;
    iframe.src = resolvePopupUrl(path);
    iframe.style.cssText = [
      "width:100%",
      "height:100%",
      "border:0",
      "background:#ffffff",
    ].join(";");

    panel.append(closeButton, iframe);
    root.append(panel);
    doc.body.append(root);

    this.popups.set(popupId, { root });
  }

  close(popupId: string) {
    const popup = this.popups.get(popupId);
    if (!popup) {
      return;
    }
    popup.root.remove();
    this.popups.delete(popupId);
  }

  closeCurrent() {
    if (typeof window === "undefined") {
      return;
    }

    const frame = window.frameElement;
    const popupId =
      frame instanceof HTMLIFrameElement ? frame.dataset.otoolsPopupId : null;
    if (popupId && window.parent !== window) {
      const parentWindow = window.parent as Window & {
        [MANAGER_KEY]?: PopupManager;
      };
      parentWindow[MANAGER_KEY]?.close(popupId);
      return;
    }

    const popupIds = Array.from(this.popups.keys());
    const latestPopupId = popupIds[popupIds.length - 1];
    if (latestPopupId) {
      this.close(latestPopupId);
    }
  }
}

export function ensurePopupManager() {
  const target = window as Window & { [MANAGER_KEY]?: PopupManager };
  if (!target[MANAGER_KEY]) {
    target[MANAGER_KEY] = new PopupManager();
  }
  return target[MANAGER_KEY];
}

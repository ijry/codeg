declare class PopupManager {
    private sequence;
    private readonly popups;
    open(path: string, command?: string, _payload?: unknown): void;
    close(popupId: string): void;
    closeCurrent(): void;
}
export declare function ensurePopupManager(): PopupManager;
export {};

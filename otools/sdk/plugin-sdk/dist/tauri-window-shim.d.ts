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
    innerSize(): Promise<{
        width: number;
        height: number;
    }>;
    outerSize(): Promise<{
        width: number;
        height: number;
    }>;
    setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
    setVisibleOnAllWorkspaces(visible: boolean): Promise<void>;
    setPosition(position: unknown): Promise<void>;
    setSize(size: unknown): Promise<void>;
    setTitle(title: string): Promise<void>;
    onResized(handler: () => void): Promise<UnlistenFn>;
};
export declare function getCurrentWindow(): WindowShim;
export {};

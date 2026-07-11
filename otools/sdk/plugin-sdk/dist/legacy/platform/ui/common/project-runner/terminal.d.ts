export interface ProjectTerminalViewInstance {
    reconnect: () => void | Promise<void>;
    disconnect: () => void | Promise<void>;
    refreshLayout?: () => void | Promise<void>;
    executeCommand?: (command: string) => void | Promise<void>;
    writeOutput?: (output: string) => void;
}
export interface ProjectTerminalTab {
    id: string;
    name: string;
    sessionId: string;
    workingDir: string;
}
export interface ProjectTerminalPanelExpose {
    runCommand: (command: string, workingDir?: string) => Promise<void> | void;
    openTab: (name?: string, workingDir?: string) => string;
    appendOutput: (tabId: string, output: string) => Promise<void> | void;
}
export type ProjectTerminalTarget = 'builtin-terminal' | 'system-terminal';

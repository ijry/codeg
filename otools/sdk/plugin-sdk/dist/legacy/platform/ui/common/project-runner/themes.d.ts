export type ProjectTerminalTheme = Record<string, string>;
export declare const ACCENT_LIGHT_THEME = "accent-light";
export declare const projectTerminalThemes: Record<string, ProjectTerminalTheme>;
export declare const getProjectTerminalTheme: (name: string) => ProjectTerminalTheme;
export declare const getProjectTerminalContainerStyle: (name: string) => Record<string, string>;

import { ThemeAccent, ThemeMode } from '../platform/ui/tools/common';
type ApplyThemeOptions = {
    skipChildWebviewSync?: boolean;
    resolvedThemeOverride?: 'light' | 'dark';
};
export declare const applyThemeMode: (mode: ThemeMode, options?: ApplyThemeOptions) => void;
export declare const applyThemeAccent: (accent: ThemeAccent, options?: ApplyThemeOptions) => void;
export declare const applyThemeSettings: (settings: {
    themeMode?: ThemeMode;
    themeAccent?: ThemeAccent;
}, options?: ApplyThemeOptions) => void;
export declare const readCachedThemeMode: () => ThemeMode | null;
export declare const readCachedThemeAccent: () => ThemeAccent | null;
export {};

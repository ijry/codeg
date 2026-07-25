import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, nativeTheme, screen, shell } from './electron-shim';
type RemoteShim = {
    getCurrentWindow: () => unknown;
    getCurrentWebContents: () => unknown;
    require?: (specifier: string) => unknown;
};
declare const remote: RemoteShim;
export { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, nativeTheme, screen, shell, };
export declare const getCurrentWindow: () => unknown;
export declare const getCurrentWebContents: () => unknown;
export declare const require: (specifier: string) => unknown;
export default remote;

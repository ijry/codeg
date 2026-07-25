import electron, {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
} from "./electron-shim";

type RemoteShim = {
  getCurrentWindow: () => unknown;
  getCurrentWebContents: () => unknown;
  require?: (specifier: string) => unknown;
};

const remote = (
  electron.remote && typeof electron.remote === "object"
    ? electron.remote
    : {
        app,
        BrowserWindow,
        clipboard,
        dialog,
        getCurrentWindow: () => BrowserWindow.getFocusedWindow(),
        getCurrentWebContents: () =>
          BrowserWindow.getFocusedWindow().webContents,
        Menu,
        nativeImage,
        nativeTheme,
        require: (specifier: string) =>
          (window as Window & {
            __OTOOLS_NODER__?: { require?: (specifier: string) => unknown };
          }).__OTOOLS_NODER__?.require?.(specifier),
        screen,
        shell,
      }
) as RemoteShim;

export {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
};

export const getCurrentWindow = () => remote.getCurrentWindow();
export const getCurrentWebContents = () => remote.getCurrentWebContents();
export const require = (specifier: string) => remote.require?.(specifier);

export default remote;

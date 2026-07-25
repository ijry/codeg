export type OToolsPlatform = "macos" | "windows" | "linux" | "unknown";

export interface OToolsDialogFilter {
  name: string;
  extensions: string[];
}

export interface OToolsDialogButtons {
  ok?: string;
}

export interface OToolsDialogOpenOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  defaultPath?: string;
  filters?: OToolsDialogFilter[];
}

export interface OToolsDialogSaveOptions {
  title?: string;
  defaultPath?: string;
  filters?: OToolsDialogFilter[];
}

export interface OToolsDialogMessageOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  buttons?: OToolsDialogButtons;
}

export interface OToolsDialogConfirmOptions
  extends OToolsDialogMessageOptions {
  cancelLabel?: string;
}

export interface OToolsDialogAPI {
  open(
    options?: OToolsDialogOpenOptions,
  ): Promise<string | string[] | null>;
  save(options?: OToolsDialogSaveOptions): Promise<string | null>;
  message(
    messageText: string,
    options?: string | OToolsDialogMessageOptions,
  ): Promise<void>;
  confirm(
    messageText: string,
    options?: string | OToolsDialogConfirmOptions,
  ): Promise<boolean>;
  ask(
    messageText: string,
    options?: string | OToolsDialogConfirmOptions,
  ): Promise<boolean>;
}

export interface OToolsShellAPI {
  open?(path: string, openWith?: string): Promise<void>;
  openPath?(fullPath: string): Promise<void>;
  showItemInFolder?(fullPath: string): Promise<void>;
  trashItem?(fullPath: string): Promise<void>;
  openExternal?(url: string): Promise<void>;
  beep?(): Promise<void>;
}

export interface OToolsFeature {
  code?: string;
  cmd?: string;
  id?: string;
  explain?: string;
  icon?: string;
  platform?: string[];
  [key: string]: unknown;
}

export interface OToolsPluginEnterAction {
  code?: string;
  type?: string;
  payload?: unknown;
  option?: unknown;
  [key: string]: unknown;
}

export interface OToolsSubInputEvent {
  text: string;
  value?: string;
  toString(): string;
}

export interface OToolsSubInputOptions {
  placeholder?: string;
  text?: string;
  isFocus?: boolean;
  focus?: boolean;
  onChange?(event: OToolsSubInputEvent): void;
  callback?(event: OToolsSubInputEvent): void;
  search?(event: OToolsSubInputEvent): void;
}

export interface OToolsDbStorageAPI {
  readonly length: number;
  key(index: number): string | null;
  getItem<T = unknown>(key: string): T | null;
  setItem(key: string, value: unknown): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface OToolsDbResult {
  ok: boolean;
  id?: string;
  rev?: string;
  error?: string;
}

export interface OToolsDbAllDocsResult<T = unknown> {
  total_rows: number;
  offset: number;
  rows: Array<{
    id: string;
    key: string;
    value: { rev?: unknown };
    doc: T;
  }>;
}

export interface OToolsDbAPI {
  get<T = unknown>(id: string): T | null;
  put(doc: Record<string, unknown>): OToolsDbResult;
  post(doc: Record<string, unknown>): OToolsDbResult;
  remove(docOrId: string | Record<string, unknown>): OToolsDbResult;
  bulkDocs(docsOrRequest: unknown[] | { docs?: unknown[] }): OToolsDbResult[];
  allDocs<T = unknown>(): OToolsDbAllDocsResult<T>;
  changes?(): {
    on(event: string, handler?: (...args: unknown[]) => void): unknown;
    once(event: string, handler?: (...args: unknown[]) => void): unknown;
    off(event: string, handler?: (...args: unknown[]) => void): unknown;
    cancel(): void;
  };
  compact?(): { ok: boolean };
  info?(): Record<string, unknown>;
  replicate?: {
    from(...args: unknown[]): Promise<unknown>;
    to(...args: unknown[]): Promise<unknown>;
    sync(...args: unknown[]): Promise<unknown>;
  };
  promises?: {
    get<T = unknown>(id: string): Promise<T | null>;
    put(doc: Record<string, unknown>): Promise<OToolsDbResult>;
    post(doc: Record<string, unknown>): Promise<OToolsDbResult>;
    remove(docOrId: string | Record<string, unknown>): Promise<OToolsDbResult>;
    bulkDocs(
      docsOrRequest: unknown[] | { docs?: unknown[] },
    ): Promise<OToolsDbResult[]>;
    allDocs<T = unknown>(): Promise<OToolsDbAllDocsResult<T>>;
    changes?(): Promise<unknown>;
    compact?(): Promise<unknown>;
    info?(): Promise<Record<string, unknown>>;
  };
}

export interface OToolsRuntimeAPI {
  dialog?: OToolsDialogAPI | null;
  shell?: OToolsShellAPI | null;
  isNoder?: boolean;
  isNativeTauri?: boolean;
  hasHostBridge?: boolean;
  platform?: OToolsPlatform | string;
  appName?: string;
  appVersion?: string;
  pluginUuid?: string;
  env?: OToolsEnv;
  permissionsRestricted?: boolean;
  permissions?: string[];
  hasPermission?(name: string): boolean;
  versions?: Record<string, string>;
  fs?: unknown;
  path?: { sep?: string; delimiter?: string } | null;
  os?: unknown;
  process?: unknown;
  childProcess?: unknown;
  require?: (specifier: string) => unknown;
  createRequire?: (specifier?: string) => (specifier: string) => unknown;
  builtinModules?: string[];
}

export interface OToolsNoderRuntimeAPI {
  builtinRequire?(specifier: string): unknown;
  require: ((specifier: string) => unknown) & {
    cache?: unknown;
    resolve?: (specifier: string) => string;
  };
  createRequire?(
    filename?: string,
  ): ((specifier: string) => unknown) & {
    cache?: unknown;
    resolve?: (specifier: string) => string;
  };
  getSdkModules?(): {
    runtime?: OToolsRuntimeAPI;
    dialog?: OToolsDialogAPI | null;
    shell?: OToolsShellAPI | null;
    [key: string]: unknown;
  };
}

export interface OToolsEnv {
  runtime?: string;
  appName?: string;
  appVersion?: string;
  nativeId?: string;
  pluginUuid?: string;
  platform?: OToolsPlatform | string;
  isDev?: boolean;
  currentFolderPath?: string;
  currentBrowserUrl?: string;
  paths?: Record<string, string>;
  pluginPermissions?: string[];
  processEnv?: Record<string, string>;
  noderBridgeAuthToken?: string;
  noderBridgeBaseUrl?: string;
}

export interface OToolsAPI {
  isDev(): boolean;
  isMacOS(): boolean;
  isMacOs?(): boolean;
  isWindows(): boolean;
  isLinux(): boolean;
  getAppName?(): string;
  getAppVersion?(): string;
  getPluginUuid?(): string;
  showMainWindow?(): void;
  hideMainWindow?(): void;
  outPlugin?(): void;
  setExpendHeight?(height: number): void;
  isDarkColors?(): boolean;
  isDarkMode?(): boolean;
  getUser?(): unknown;
  fetchUser?(): Promise<unknown>;
  fetchUserServerTemporaryToken?(): Promise<unknown>;
  isPurchasedUser?(): boolean;
  userPayments?(): unknown[];
  screenColorPick?(callback?: (color: string | null) => void): Promise<string | null>;
  simulateKeyboardTap?(key?: string, modifier?: string | string[]): boolean;
  simulateKeyboard?(key?: string, modifier?: string | string[]): boolean;
  simulateMouseClick?(button?: string): boolean;
  getCursorScreenPoint?(): { x: number; y: number };
  getSubInputValue?(): string;
  getIdleUBrowser?(): unknown;
  getIdleUBrowsers?(): unknown[];
  ubrowser?: unknown;
  getEnterAction?(): OToolsPluginEnterAction;
  getFeatures?(): OToolsFeature[];
  setFeature?(feature: OToolsFeature): boolean;
  removeFeature?(code: string): boolean;
  redirect?(label: string, payload?: unknown): boolean;
  setSubInput?(
    callback?: ((event: OToolsSubInputEvent) => void) | OToolsSubInputOptions,
    placeholder?: string,
    isFocus?: boolean,
  ): boolean;
  removeSubInput?(): boolean;
  hideSubInput?(): boolean;
  setSubInputValue?(value: string): boolean;
  onPluginReady?(callback: () => void): void;
  onPluginEnter?(callback: (action: OToolsPluginEnterAction) => void): void;
  onPluginOut?(callback: () => void): void;
  onDbPull?(callback: (payload?: unknown) => void): void;
  showOpenDialog?(
    options?: OToolsDialogOpenOptions,
    callback?: (result: string | string[] | null) => void,
  ): Promise<string | string[] | null>;
  showSaveDialog?(
    options?: OToolsDialogSaveOptions,
    callback?: (result: string | null) => void,
  ): Promise<string | null>;
  dbStorage?: OToolsDbStorageAPI;
  db?: OToolsDbAPI;
  invokeNative<T = unknown>(method: string, payload?: unknown): Promise<T>;
  invokeNativePlugin?<T = unknown>(
    uuid: string,
    method: string,
    payload?: unknown,
  ): Promise<T>;
  invokeNativePluginRaw?<T = unknown>(
    uuid: string,
    method: string,
    payload?: unknown,
  ): Promise<T>;
  invokeNativeRaw<T = unknown>(method: string, payload?: unknown): Promise<T>;
  reloadNative(): Promise<unknown>;
  reloadNativePlugin?(uuid: string): Promise<unknown>;
  probeNative(): Promise<unknown>;
  probeNativePlugin?(uuid: string): Promise<unknown>;
  shellOpen?(path: string, openWith?: string): Promise<void>;
  shellOpenExternal(url: string): void;
  shellOpenPath(fullPath: string): void;
  shellTrashItem?(fullPath: string): void;
  shellShowItemInFolder?(fullPath: string): void;
  shellBeep?(): void;
  listHostDir?(path: string): Promise<unknown>;
  readHostFile?(path: string): Promise<unknown>;
  writeHostFile?(request: {
    path?: string;
    dataBase64?: string;
    data?: string;
    content?: string;
  }): Promise<void>;
  copyText?(text: string): boolean;
  copyFile?(file: string | string[]): boolean;
  copyImage?(image: unknown): boolean;
  getCopyedFiles?(): string[];
  getCopiedFiles?(): string[];
  showNotification?(body: string, clickFeatureCode?: string | null): void;
  hostRunWingetInstall?(
    packageName: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  hostRunPackageAction?(
    packageName: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  hostGetPackageStatus?(
    packageName: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  hostGetPackagesStatus?(
    packageNames: string[],
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  aiGenerateText?(request?: Record<string, unknown>): Promise<unknown>;
  hostRepairJsonText?(rawText: string): Promise<string>;
  hostListListenProcesses?(): Promise<unknown[]>;
  hostKillProcess?(pid: number): Promise<void>;
  hostScanStorageCatalog?(catalog: unknown[]): Promise<unknown>;
  hostCleanStorageItems?(catalog: unknown[], ids: string[]): Promise<unknown>;
  hostCleanStoragePaths?(entriesOrPaths: unknown[]): Promise<unknown>;
  statusBarAttach?(payload?: Record<string, unknown>): Promise<unknown>;
  getNativeId?(): string;
  getPath?(name: string): string;
  getFileIcon?(filePath: string): string;
  readCurrentFolderPath?(): string;
  readCurrentBrowserUrl?(): string;
  listenNative?(
    handler: (
      event:
        | {
            event?: string;
            id?: number;
            payload?: {
              topic?: string;
              payload?: unknown;
            };
          }
        | unknown,
    ) => void,
    options?: unknown,
  ): Promise<() => Promise<void> | void>;
  listenNativePlugin?(
    uuid: string,
    handler: (
      event:
        | {
            event?: string;
            id?: number;
            payload?: {
              topic?: string;
              payload?: unknown;
            };
          }
        | unknown,
    ) => void,
    options?: unknown,
  ): Promise<() => Promise<void> | void>;
  getPluginLocalState<T = unknown>(
    plugin?: string,
    scheme?: string | null,
  ): Promise<T | null>;
  savePluginLocalState(
    plugin?: string,
    state?: unknown,
    scheme?: string | null,
  ): Promise<void>;
  getPluginLocalStateValue<T = unknown>(
    plugin?: string,
    key?: string,
    scheme?: string | null,
  ): Promise<T | null>;
  savePluginLocalStateValue(
    plugin?: string,
    key?: string,
    value?: unknown,
    scheme?: string | null,
  ): Promise<void>;
  patchPluginLocalState(
    plugin?: string,
    patch?: Record<string, unknown>,
    scheme?: string | null,
  ): Promise<void>;
  getPluginSyncState<T = unknown>(
    plugin?: string,
    scheme?: string | null,
  ): Promise<T | null>;
  savePluginSyncState(
    plugin?: string,
    state?: unknown,
    scheme?: string | null,
  ): Promise<void>;
  getPluginSyncStateValue<T = unknown>(
    plugin?: string,
    key?: string,
    scheme?: string | null,
  ): Promise<T | null>;
  savePluginSyncStateValue(
    plugin?: string,
    key?: string,
    value?: unknown,
    scheme?: string | null,
  ): Promise<void>;
  patchPluginSyncState(
    plugin?: string,
    patch?: Record<string, unknown>,
    scheme?: string | null,
  ): Promise<void>;
  runtime?: OToolsRuntimeAPI;
  dialog?: OToolsDialogAPI;
  shell?: OToolsShellAPI;
}

export interface TauriInternals {
  invoke<T = unknown>(
    command: string,
    payload?: Record<string, unknown>,
    options?: unknown,
  ): Promise<T>;
  transformCallback?(
    callback: (response: { payload?: unknown } | unknown) => void,
    once?: boolean,
  ): number;
  unregisterCallback?(id: number): void;
  convertFileSrc?(filePath: string, protocol?: string): string;
}

export interface TauriEventPluginInternals {
  unregisterListener(event: string, eventId: number): void;
}

declare global {
  interface Window {
    otools?: OToolsAPI;
    utools?: OToolsAPI;
    __OToolsEnv?: OToolsEnv;
    __OTOOLS_NODER__?: OToolsNoderRuntimeAPI;
    __TAURI_INTERNALS__?: TauriInternals;
    __TAURI_EVENT_PLUGIN_INTERNALS__: TauriEventPluginInternals;
    __TAURI_REMOTE_SERVICE__?: boolean;
    __OTOOLS_REMOTE_SERVICE__?: boolean;
  }
}

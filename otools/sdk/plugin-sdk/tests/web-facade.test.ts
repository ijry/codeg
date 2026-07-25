import { beforeEach, describe, expect, it } from "vitest";
import {
  createOtoolsWebFacade,
  installOtoolsWebRuntime,
} from "../src/remote-service-otools-web-shim";

const createEventClient = () => ({
  listen: async () => async () => undefined,
  close: () => undefined,
  getConnectionState: () => "idle" as const,
});

describe("otools web facade", () => {
  beforeEach(() => {
    delete (window as Window & { __OToolsEnv?: unknown }).__OToolsEnv;
    delete (
      window as Window & { __OTOOLS_REMOTE_SERVICE__?: unknown }
    ).__OTOOLS_REMOTE_SERVICE__;
    delete (
      window as Window & { __TAURI_REMOTE_SERVICE__?: unknown }
    ).__TAURI_REMOTE_SERVICE__;
    delete (window as Window & { __OTOOLS_NODER__?: unknown }).__OTOOLS_NODER__;
    delete (window as Window & { otools?: unknown }).otools;
    delete (window as Window & { utools?: unknown }).utools;
    localStorage.clear();
  });

  it("normalizes plugin uuid and platform metadata", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      appName: "Codeg",
      appVersion: "1.2.3",
      eventClient: createEventClient(),
      platform: "win32",
      pluginUuid: "dev-debug:sample-plugin",
      postJson: async (path, body) => {
        calls.push({ path, body });
        return { ok: true };
      },
    });

    expect(facade.getPluginUuid?.()).toBe("sample-plugin");
    expect(facade.isWindows()).toBe(true);
    expect(facade.runtime?.pluginUuid).toBe("sample-plugin");
    expect(facade.runtime?.platform).toBe("windows");
    expect(facade.runtime?.hasHostBridge).toBe(true);
    expect(facade.runtime?.permissionsRestricted).toBe(false);
    expect(facade.runtime?.hasPermission?.("fs")).toBe(true);
    expect(facade.runtime?.env?.pluginPermissions).toBeUndefined();

    await facade.invokeNative("sample_load", { page: 1 });
    await facade.probeNativePlugin?.("market:other-plugin");
    await facade.reloadNativePlugin?.("dev-workspace:other-plugin");
    expect(calls).toEqual([
      {
        path: "/api/native_plugin_invoke",
        body: {
          uuid: "sample-plugin",
          method: "sample_load",
          payload: { page: 1 },
        },
      },
      {
        path: "/api/native_plugin_probe",
        body: {
          uuid: "other-plugin",
        },
      },
      {
        path: "/api/native_plugin_reload",
        body: {
          uuid: "other-plugin",
        },
      },
    ]);
  });

  it("installs env metadata used by noder permission checks", () => {
    const facade = installOtoolsWebRuntime({
      appName: "Codeg",
      appVersion: "1.2.3",
      eventClient: createEventClient(),
      pluginPermissions: ["fs", "shell"],
      pluginUuid: "market:sample-plugin",
      postJson: async () => null,
      token: "secret-token",
    });

    expect(window.otools).toBe(facade);
    expect(window.utools).toBe(facade);
    expect(window.__OToolsEnv).toMatchObject({
      appName: "Codeg",
      appVersion: "1.2.3",
      noderBridgeAuthToken: "secret-token",
      pluginPermissions: ["fs", "shell"],
      pluginUuid: "sample-plugin",
      runtime: "web",
    });
    expect(facade.runtime?.permissionsRestricted).toBe(true);
    expect(facade.runtime?.hasPermission?.("fs")).toBe(true);
    expect(facade.runtime?.hasPermission?.("dialog")).toBe(false);
  });

  it("delegates runtime require APIs to installed noder runtime", () => {
    const facade = createOtoolsWebFacade({
      eventClient: createEventClient(),
      postJson: async () => null,
    });
    expect(facade.runtime?.isNoder).toBe(false);
    expect(facade.runtime?.builtinModules).toEqual([]);
    expect(() => facade.runtime?.require?.("buffer")).toThrow(
      "Node require is unavailable",
    );

    const requireFn = Object.assign(
      (specifier: string) => ({ specifier, from: "noder" }),
      {
        cache: { "/app/preload.js": {} },
        resolve: (specifier: string) => `/resolved/${specifier}`,
      },
    );
    const scopedRequire = Object.assign(
      (specifier: string) => ({ specifier, from: "scoped" }),
      {
        resolve: (specifier: string) => `/scoped/${specifier}`,
      },
    );
    (
      window as Window & {
        __OTOOLS_NODER__?: {
          createRequire(filename?: string): typeof scopedRequire;
          getSdkModules(): { runtime: { builtinModules: string[] } };
          require: typeof requireFn;
        };
      }
    ).__OTOOLS_NODER__ = {
      createRequire: () => scopedRequire,
      getSdkModules: () => ({
        runtime: {
          builtinModules: ["buffer", "process"],
        },
      }),
      require: requireFn,
    };

    expect(facade.runtime?.isNoder).toBe(true);
    expect(facade.runtime?.require?.("buffer")).toEqual({
      specifier: "buffer",
      from: "noder",
    });
    expect(
      facade.runtime?.createRequire?.("/app/preload.js")("process"),
    ).toEqual({
      specifier: "process",
      from: "scoped",
    });
    expect(
      (
        facade.runtime?.require as
          | (((specifier: string) => unknown) & {
              resolve?: (specifier: string) => string;
            })
          | undefined
      )?.resolve?.("buffer"),
    ).toBe("/resolved/buffer");
    expect(facade.runtime?.builtinModules).toEqual(["buffer", "process"]);
  });

  it("normalizes state plugin ids across web transport calls", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      eventClient: createEventClient(),
      pluginUuid: "market:default-plugin",
      postJson: async (path, body) => {
        calls.push({ path, body });
        return null;
      },
    });

    await facade.getPluginLocalState(undefined, "cache");
    await facade.savePluginLocalState("dev-workspace:other-plugin", { ok: true });

    expect(calls).toEqual([
      {
        path: "/api/get_otools_plugin_localstate_with_scheme",
        body: {
          plugin: "default-plugin",
          scheme: "cache",
        },
      },
      {
        path: "/api/save_otools_plugin_localstate_with_scheme",
        body: {
          plugin: "other-plugin",
          scheme: null,
          state: { ok: true },
        },
      },
    ]);
  });

  it("exposes desktop-compatible shell methods", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      eventClient: createEventClient(),
      postJson: async (path, body) => {
        calls.push({ path, body });
        return null;
      },
    });

    await facade.shell?.open?.("D:/repo", "code");
    await facade.shell?.trashItem?.("D:/old.txt");
    await facade.shell?.beep?.();
    await facade.shellOpen?.("https://example.test");
    facade.shellTrashItem?.("D:/later.txt");
    facade.shellBeep?.();

    expect(calls).toEqual([
      {
        path: "/api/remote_service_shell_open",
        body: {
          request: {
            path: "D:/repo",
            with: "code",
          },
        },
      },
      {
        path: "/api/otools_shell_trash_item",
        body: {
          path: "D:/old.txt",
        },
      },
      {
        path: "/api/otools_shell_beep",
        body: undefined,
      },
      {
        path: "/api/remote_service_shell_open",
        body: {
          request: {
            path: "https://example.test",
            with: undefined,
          },
        },
      },
      {
        path: "/api/otools_shell_trash_item",
        body: {
          path: "D:/later.txt",
        },
      },
      {
        path: "/api/otools_shell_beep",
        body: undefined,
      },
    ]);
  });

  it("exposes desktop-compatible host helper methods", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      currentBrowserUrl: "https://codeg.test/plugin",
      currentFolderPath: "D:/workspace",
      eventClient: createEventClient(),
      nativeId: "native-sample",
      paths: {
        home: "D:/Users/Ada",
      },
      postJson: async (path, body) => {
        calls.push({ path, body });
        return path === "/api/otools_get_copied_files"
          ? ["D:/cached.txt"]
          : null;
      },
    });

    await facade.listHostDir?.("D:/workspace");
    await facade.readHostFile?.("D:/workspace/a.txt");
    await facade.writeHostFile?.({
      path: "D:/workspace/a.txt",
      dataBase64: "SGk=",
    });
    expect(facade.copyText?.("hello")).toBe(true);
    expect(facade.copyFile?.(["D:/workspace/a.txt"])).toBe(true);
    expect(facade.copyImage?.({ dataBase64: "iVBORw0=", mime: "image/png" })).toBe(
      true,
    );
    expect(facade.getCopyedFiles?.()).toEqual(["D:/workspace/a.txt"]);
    facade.showNotification?.("Ready", "feature-code");
    await facade.hostRunWingetInstall?.("Git.Git", { silent: true });
    await facade.hostRunPackageAction?.("node", {
      action: "upgrade",
      manager: "brew",
      version: "22",
    });
    await facade.hostGetPackageStatus?.("node", { cask: false });
    await facade.hostGetPackagesStatus?.(["node", "git"], { manager: "brew" });
    await facade.statusBarAttach?.({ title: "Running" });
    expect(facade.getNativeId?.()).toBe("native-sample");
    expect(facade.getPath?.("home")).toBe("D:/Users/Ada");
    expect(facade.getFileIcon?.("D:/workspace/a.txt")).toBe("");
    expect(facade.readCurrentFolderPath?.()).toBe("D:/workspace");
    expect(facade.readCurrentBrowserUrl?.()).toBe("https://codeg.test/plugin");

    expect(calls).toEqual([
      {
        path: "/api/tools_webview_list_dir",
        body: { path: "D:/workspace" },
      },
      {
        path: "/api/tools_webview_read_file",
        body: { path: "D:/workspace/a.txt" },
      },
      {
        path: "/api/tools_webview_write_file",
        body: { path: "D:/workspace/a.txt", dataBase64: "SGk=" },
      },
      {
        path: "/api/otools_copy_text",
        body: { text: "hello" },
      },
      {
        path: "/api/otools_copy_file",
        body: { paths: ["D:/workspace/a.txt"] },
      },
      {
        path: "/api/otools_copy_image",
        body: { image: "data:image/png;base64,iVBORw0=" },
      },
      {
        path: "/api/otools_get_copied_files",
        body: undefined,
      },
      {
        path: "/api/otools_show_notification",
        body: { body: "Ready", clickFeatureCode: "feature-code" },
      },
      {
        path: "/api/otools_host_run_winget_install",
        body: { packageName: "Git.Git", options: { silent: true } },
      },
      {
        path: "/api/otools_host_run_package_action",
        body: {
          action: "upgrade",
          manager: "brew",
          packageName: "node",
          version: "22",
        },
      },
      {
        path: "/api/otools_host_get_package_status",
        body: { cask: false, manager: null, packageName: "node" },
      },
      {
        path: "/api/otools_host_get_packages_status",
        body: { cask: null, manager: "brew", packageNames: ["node", "git"] },
      },
      {
        path: "/api/otools_set_status_bar_state",
        body: { payload: { title: "Running" } },
      },
      {
        path: "/api/otools_get_file_icon",
        body: { path: "D:/workspace/a.txt" },
      },
    ]);
  });

  it("exposes sync-state and host utility methods", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      eventClient: createEventClient(),
      pluginUuid: "dev-debug:sample-plugin",
      postJson: async (path, body) => {
        calls.push({ path, body });
        return path === "/api/otools_host_repair_json_text" ? "{}" : null;
      },
    });

    await facade.getPluginSyncState?.(undefined, "sync");
    await facade.savePluginSyncState?.("market:other-plugin", { enabled: true });
    await facade.getPluginSyncStateValue?.("market:other-plugin", "enabled");
    await facade.savePluginSyncStateValue?.(
      "market:other-plugin",
      "enabled",
      false,
      "sync",
    );
    await facade.patchPluginSyncState?.("market:other-plugin", { count: 2 });
    await facade.aiGenerateText?.({ prompt: "hello" });
    await expect(facade.hostRepairJsonText?.("{bad")).resolves.toBe("{}");
    await facade.hostListListenProcesses?.();
    await facade.hostKillProcess?.(1234);
    await facade.hostScanStorageCatalog?.([{ id: "cache" }]);
    await facade.hostCleanStorageItems?.([{ id: "cache" }], ["a", "b"]);
    await facade.hostCleanStoragePaths?.(["D:/tmp/a.log"]);

    expect(calls).toEqual([
      {
        path: "/api/get_otools_plugin_syncstate_with_scheme",
        body: {
          plugin: "sample-plugin",
          scheme: "sync",
        },
      },
      {
        path: "/api/save_otools_plugin_syncstate_with_scheme",
        body: {
          plugin: "other-plugin",
          scheme: null,
          state: { enabled: true },
        },
      },
      {
        path: "/api/get_otools_plugin_syncstate_value_with_scheme",
        body: {
          plugin: "other-plugin",
          scheme: null,
          key: "enabled",
        },
      },
      {
        path: "/api/save_otools_plugin_syncstate_value_with_scheme",
        body: {
          plugin: "other-plugin",
          scheme: "sync",
          key: "enabled",
          value: false,
        },
      },
      {
        path: "/api/patch_otools_plugin_syncstate_with_scheme",
        body: {
          plugin: "other-plugin",
          scheme: null,
          patch: { count: 2 },
        },
      },
      {
        path: "/api/otools_ai_generate_text",
        body: { request: { prompt: "hello" } },
      },
      {
        path: "/api/otools_host_repair_json_text",
        body: { rawText: "{bad" },
      },
      {
        path: "/api/otools_host_list_listen_processes",
        body: undefined,
      },
      {
        path: "/api/otools_host_kill_process",
        body: { pid: 1234 },
      },
      {
        path: "/api/otools_host_scan_storage_catalog",
        body: { catalog: [{ id: "cache" }] },
      },
      {
        path: "/api/otools_host_clean_storage_items",
        body: { catalog: [{ id: "cache" }], ids: ["a", "b"] },
      },
      {
        path: "/api/otools_host_clean_storage_paths",
        body: {
          entries: [
            {
              itemId: "",
              itemName: "",
              path: "D:/tmp/a.log",
            },
          ],
        },
      },
    ]);
  });

  it("exposes utools-compatible storage, lifecycle, and UI aliases", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const facade = createOtoolsWebFacade({
      enterAction: {
        code: "initial",
        payload: { selected: "text" },
        type: "regex",
      },
      eventClient: createEventClient(),
      pluginUuid: "market:compat-plugin",
      postJson: async (path, body) => {
        calls.push({ path, body });
        return null;
      },
    });

    expect(facade.getEnterAction?.()).toMatchObject({
      code: "initial",
      payload: { selected: "text" },
      type: "regex",
    });

    let readyCount = 0;
    facade.onPluginReady?.(() => {
      readyCount += 1;
    });
    await Promise.resolve();
    expect(readyCount).toBe(1);

    const enterActions: unknown[] = [];
    facade.onPluginEnter?.((action) => enterActions.push(action));
    await Promise.resolve();
    expect(enterActions).toEqual([
      {
        code: "initial",
        option: null,
        payload: { selected: "text" },
        type: "regex",
      },
    ]);

    const subInputValues: unknown[] = [];
    expect(facade.setSubInput?.((event) => subInputValues.push(event))).toBe(
      true,
    );
    expect(facade.setSubInputValue?.("abc")).toBe(true);
    expect(subInputValues).toEqual([
      expect.objectContaining({ text: "abc", value: "abc" }),
    ]);
    expect(
      facade.setSubInput?.({
        onChange: (event) => subInputValues.push(event),
        placeholder: "Object search",
      }),
    ).toBe(true);
    window.dispatchEvent(
      new CustomEvent("otools:sub-input-change", {
        detail: { text: "from-event" },
      }),
    );
    expect(subInputValues.at(-1)).toEqual(
      expect.objectContaining({ text: "from-event", value: "from-event" }),
    );
    expect(facade.hideSubInput?.()).toBe(true);
    expect(facade.removeSubInput?.()).toBe(true);

    const dbPullPayloads: unknown[] = [];
    facade.onDbPull?.((payload) => dbPullPayloads.push(payload));
    window.dispatchEvent(
      new CustomEvent("otools:db-pull", { detail: { synced: true } }),
    );
    expect(dbPullPayloads).toEqual([{ synced: true }]);

    facade.dbStorage?.setItem("prefs", { theme: "dark" });
    expect(facade.dbStorage?.getItem("prefs")).toEqual({ theme: "dark" });
    expect(facade.dbStorage?.key(0)).toBe("prefs");
    expect(facade.dbStorage?.length).toBe(1);
    facade.dbStorage?.removeItem("prefs");
    expect(facade.dbStorage?.getItem("prefs")).toBeNull();

    const putResult = facade.db?.put({ _id: "doc-1", name: "Ada" });
    expect(putResult?.ok).toBe(true);
    expect(facade.db?.get("doc-1")).toMatchObject({
      _id: "doc-1",
      name: "Ada",
    });
    expect(facade.db?.allDocs().rows).toHaveLength(1);
    expect(await facade.db?.promises?.remove("doc-1")).toMatchObject({
      ok: true,
      id: "doc-1",
    });

    expect(facade.getFeatures?.()).toEqual([]);
    expect(facade.setFeature?.({ code: "search", explain: "Search" })).toBe(
      true,
    );
    expect(facade.getFeatures?.()).toEqual([
      { code: "search", explain: "Search" },
    ]);
    expect(facade.removeFeature?.("search")).toBe(true);

    expect(facade.isMacOs?.()).toBe(false);
    expect(facade.getSubInputValue?.()).toBe("");
    await expect(facade.fetchUser?.()).resolves.toBeNull();
    await expect(facade.fetchUserServerTemporaryToken?.()).resolves.toBeNull();
    expect(facade.isPurchasedUser?.()).toBe(false);
    expect(facade.userPayments?.()).toEqual([]);
    await expect(facade.screenColorPick?.()).resolves.toBeNull();
    expect(facade.simulateKeyboardTap?.("a")).toBe(false);
    expect(facade.simulateMouseClick?.("left")).toBe(false);
    expect(facade.getCursorScreenPoint?.()).toEqual({ x: 0, y: 0 });
    expect(facade.getIdleUBrowser?.()).toBeNull();
    expect(facade.getIdleUBrowsers?.()).toEqual([]);
    await expect(
      (
        facade.ubrowser as {
          goto(url: string): {
            evaluate(fn: () => string): {
              run(): Promise<string | null>;
            };
          };
        }
      )
        .goto("https://example.test")
        .evaluate(() => "ok")
        .run(),
    ).resolves.toBe("ok");
    expect(facade.db?.changes?.().on("change")).toBeTruthy();
    await expect(facade.db?.replicate?.to()).resolves.toMatchObject({
      ok: true,
    });

    expect(facade.redirect?.("search", { q: "abc" })).toBe(true);
    expect(facade.getEnterAction?.()).toMatchObject({
      code: "search",
      payload: { q: "abc" },
    });
    expect(enterActions.at(-1)).toMatchObject({
      code: "search",
      payload: { q: "abc" },
    });
    facade.showMainWindow?.();
    facade.hideMainWindow?.();
    facade.outPlugin?.();
    facade.setExpendHeight?.(520);

    expect(calls).toEqual([
      {
        path: "/api/save_otools_plugin_localstate_value_with_scheme",
        body: {
          plugin: "compat-plugin",
          scheme: "dbStorage",
          key: "prefs",
          value: { theme: "dark" },
        },
      },
      {
        path: "/api/save_otools_plugin_localstate_value_with_scheme",
        body: {
          plugin: "compat-plugin",
          scheme: "dbStorage",
          key: "prefs",
          value: null,
        },
      },
      {
        path: "/api/set_feature",
        body: { feature: { code: "search", explain: "Search" } },
      },
      {
        path: "/api/remove_feature",
        body: { code: "search" },
      },
      {
        path: "/api/redirect",
        body: { code: "search", payload: { q: "abc" } },
      },
      {
        path: "/api/show_main_window",
        body: undefined,
      },
      {
        path: "/api/hide_main_window",
        body: undefined,
      },
      {
        path: "/api/hide_main_window",
        body: undefined,
      },
      {
        path: "/api/set_expend_height",
        body: { height: 520 },
      },
    ]);
  });
});

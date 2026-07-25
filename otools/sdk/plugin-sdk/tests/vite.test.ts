import { describe, expect, it } from "vitest";
import { createOtoolsPluginSdkViteConfig } from "../src/vite";

describe("otools vite config helper", () => {
  it("creates a plugin config with shim aliases and dev server options", () => {
    const extraPlugin = { name: "extra-plugin" };
    const config = createOtoolsPluginSdkViteConfig({
      host: "localhost",
      port: 5173,
      extraPlugins: [extraPlugin],
    });

    expect(config.base).toBe("./");
    expect(config.build).toMatchObject({
      outDir: "dist",
      emptyOutDir: true,
      target: "esnext",
    });
    expect(config.server).toMatchObject({
      host: "localhost",
      port: 5173,
      strictPort: true,
    });
    expect(config.optimizeDeps).toMatchObject({
      exclude: ["otools-plugin-sdk", "tauri-remote-service"],
    });
    expect(config.resolve).toMatchObject({
      alias: {
        "@tauri-apps/api": "otools-plugin-sdk/tauri-api-shim",
        "@tauri-apps/api/core": "otools-plugin-sdk/tauri-core-shim",
        "@tauri-apps/api/dpi": "otools-plugin-sdk/tauri-dpi-shim",
        "@tauri-apps/api/webviewWindow":
          "otools-plugin-sdk/tauri-webview-window-shim",
        buffer: "otools-plugin-sdk/node-buffer-shim",
        events: "otools-plugin-sdk/node-events-shim",
        electron: "otools-plugin-sdk/electron-shim",
        "@electron/remote": "otools-plugin-sdk/electron-remote-shim",
        "@electron/remote/main":
          "otools-plugin-sdk/electron-remote-main-shim",
        path: "otools-plugin-sdk/node-path-shim",
        "path/posix": "otools-plugin-sdk/node-path-posix-shim",
        "path/win32": "otools-plugin-sdk/node-path-win32-shim",
        process: "otools-plugin-sdk/node-process-shim",
        "process/browser": "otools-plugin-sdk/node-process-shim",
        os: "otools-plugin-sdk/node-os-shim",
        querystring: "otools-plugin-sdk/node-querystring-shim",
        util: "otools-plugin-sdk/node-util-shim",
        "util/types": "otools-plugin-sdk/node-util-types-shim",
        "tauri-remote-service": "otools-plugin-sdk/remote-service-shim",
        "tauri-remote-service/otools-web/ws":
          "otools-plugin-sdk/remote-service-otools-web-ws-shim",
        "@/utils/fileSrc": "otools-plugin-sdk/legacy/utils/fileSrc",
        "@/utils/hostFs": "otools-plugin-sdk/legacy/utils/hostFs",
        "@/utils/notification":
          "otools-plugin-sdk/legacy/utils/notification",
        "@/utils/termThemes.js": "otools-plugin-sdk/legacy/utils/termThemes",
        "@/utils/appTheme": "otools-plugin-sdk/legacy/utils/appTheme",
        "@/utils/ai": "otools-plugin-sdk/legacy/utils/ai",
        "@/utils/dbm": "otools-plugin-sdk/legacy/utils/dbm",
        "@/utils/ftp": "otools-plugin-sdk/legacy/utils/ftp",
        "@/utils/http": "otools-plugin-sdk/legacy/utils/http",
        "@/utils/markdown": "otools-plugin-sdk/legacy/utils/markdown",
        "@/utils/mqtt": "otools-plugin-sdk/legacy/utils/mqtt",
        "@/utils/pakcap": "otools-plugin-sdk/legacy/utils/pakcap",
        "@/utils/tts": "otools-plugin-sdk/legacy/utils/tts",
        "@/assets/dbm": "otools-plugin-sdk/legacy/assets/dbm",
        "@/platform/runtime": "otools-plugin-sdk/legacy/platform/runtime",
        "@/platform/i18n": "otools-plugin-sdk/legacy/platform/i18n",
        "@/platform/services/project-runner/commandRunner":
          "otools-plugin-sdk/legacy/platform/services/project-runner/commandRunner",
        "@/platform/services/project-editor/editorOpener":
          "otools-plugin-sdk/legacy/platform/services/project-editor/editorOpener",
        "@/platform/ui/fsWindow":
          "otools-plugin-sdk/legacy/platform/ui/fsWindow",
        "@/platform/ui/common/taskLog":
          "otools-plugin-sdk/legacy/platform/ui/common/taskLog",
        "@/platform/ui/common/FsWindow.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/FsWindow",
        "@/platform/ui/common/ForegroundTaskDialog.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/ForegroundTaskDialog",
        "@/platform/ui/common/OTabs.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/OTabs",
        "@/platform/ui/common/otabs":
          "otools-plugin-sdk/legacy/platform/ui/common/otabs",
        "@/platform/ui/common/LocalTerminalView.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/LocalTerminalView",
        "@/platform/ui/common/CodeMirrorTextEditor.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/CodeMirrorTextEditor",
        "@/platform/ui/common/SshConnectionSettings.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/SshConnectionSettings",
        "@/platform/ui/common/VditorEditor.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/VditorEditor",
        "@/platform/ui/common/ai/AiChatPanel.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/ai/AiChatPanel",
        "@/platform/ui/common/project-runner/ProjectRunButton.vue":
          "otools-plugin-sdk/legacy/platform/ui/common/project-runner/ProjectRunButton",
        "@/plugins/term/ui/TerminalView.vue":
          "otools-plugin-sdk/legacy/plugins/term/ui/TerminalView",
        "@/platform/ui/tools/common":
          "otools-plugin-sdk/legacy/platform/ui/tools/common",
        "@/platform/ui/tools/Config.vue":
          "otools-plugin-sdk/legacy/platform/ui/tools/Config",
      },
    });
    expect(config.plugins).toEqual([
      expect.objectContaining({ name: "otools-tauri-shim" }),
      extraPlugin,
    ]);
  });

  it("keeps package root aliases after their subpath aliases", () => {
    const config = createOtoolsPluginSdkViteConfig();
    const aliasKeys = Object.keys(config.resolve?.alias ?? {});

    expect(aliasKeys.indexOf("@tauri-apps/api/core")).toBeLessThan(
      aliasKeys.indexOf("@tauri-apps/api"),
    );
    expect(aliasKeys.indexOf("tauri-remote-service/api/core")).toBeLessThan(
      aliasKeys.indexOf("tauri-remote-service"),
    );
    expect(aliasKeys.indexOf("electron/renderer")).toBeLessThan(
      aliasKeys.indexOf("electron"),
    );
    expect(aliasKeys.indexOf("@electron/remote/main")).toBeLessThan(
      aliasKeys.indexOf("@electron/remote"),
    );
    expect(aliasKeys.indexOf("path/posix")).toBeLessThan(
      aliasKeys.indexOf("path"),
    );
    expect(aliasKeys.indexOf("process/browser")).toBeLessThan(
      aliasKeys.indexOf("process"),
    );
    expect(aliasKeys.indexOf("util/types")).toBeLessThan(
      aliasKeys.indexOf("util"),
    );
  });
});

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: {
        aliases: "src/aliases.ts",
        index: "src/index.ts",
        vite: "src/vite.ts",
        runtime: "src/runtime.ts",
        "popup-manager": "src/popup-manager.ts",
        "native-event-bridge": "src/native-event-bridge.ts",
        dialog: "src/dialog.ts",
        "electron-shim": "src/electron-shim.ts",
        "electron-remote-shim": "src/electron-remote-shim.ts",
        "electron-remote-main-shim": "src/electron-remote-main-shim.ts",
        "node-buffer-shim": "src/node-buffer-shim.ts",
        "node-events-shim": "src/node-events-shim.ts",
        "node-os-shim": "src/node-os-shim.ts",
        "node-path-posix-shim": "src/node-path-posix-shim.ts",
        "node-path-shim": "src/node-path-shim.ts",
        "node-path-win32-shim": "src/node-path-win32-shim.ts",
        "node-process-shim": "src/node-process-shim.ts",
        "node-querystring-shim": "src/node-querystring-shim.ts",
        "node-util-types-shim": "src/node-util-types-shim.ts",
        "node-util-shim": "src/node-util-shim.ts",
        "tauri-api-shim": "src/tauri-api-shim.ts",
        "tauri-core-shim": "src/tauri-core-shim.ts",
        "tauri-event-shim": "src/tauri-event-shim.ts",
        "tauri-dpi-shim": "src/tauri-dpi-shim.ts",
        "tauri-window-shim": "src/tauri-window-shim.ts",
        "tauri-webview-shim": "src/tauri-webview-shim.ts",
        "tauri-webview-window-shim":
          "src/tauri-webview-window-shim.ts",
        "tauri-app-shim": "src/tauri-app-shim.ts",
        "tauri-plugin-dialog-shim": "src/tauri-plugin-dialog-shim.ts",
        "tauri-plugin-opener-shim": "src/tauri-plugin-opener-shim.ts",
        "tauri-plugin-shell-shim": "src/tauri-plugin-shell-shim.ts",
        "tauri-plugin-process-shim": "src/tauri-plugin-process-shim.ts",
        "tauri-plugin-updater-shim": "src/tauri-plugin-updater-shim.ts",
        "tauri-plugin-notification-shim":
          "src/tauri-plugin-notification-shim.ts",
        "remote-service-shim": "src/remote-service-shim.ts",
        "remote-service-otools-web-shim":
          "src/remote-service-otools-web-shim.ts",
        "remote-service-otools-web-ws-shim":
          "src/remote-service-otools-web-ws-shim.ts",
        "remote-service-runtime-shim": "src/remote-service-runtime-shim.ts",
        "remote-service-api-core-shim": "src/remote-service-api-core-shim.ts",
        "remote-service-api-event-shim":
          "src/remote-service-api-event-shim.ts",
        "remote-service-compat-file-shim":
          "src/remote-service-compat-file-shim.ts",
        "remote-service-compat-path-shim":
          "src/remote-service-compat-path-shim.ts",
        "remote-service-compat-shell-shim":
          "src/remote-service-compat-shell-shim.ts",
        "remote-service-host-fs-shim": "src/remote-service-host-fs-shim.ts",
        "remote-service-host-shell-shim":
          "src/remote-service-host-shell-shim.ts",
        "legacy/utils/remoteServiceBridge":
          "src/legacy/utils/remoteServiceBridge.ts",
        "legacy/utils/runtime": "src/legacy/utils/runtime.ts",
        "legacy/utils/fileSrc": "src/legacy/utils/fileSrc.ts",
        "legacy/utils/hostFs": "src/legacy/utils/hostFs.ts",
        "legacy/utils/hostPickers": "src/legacy/utils/hostPickers.ts",
        "legacy/utils/hostShell": "src/legacy/utils/hostShell.ts",
        "legacy/utils/notification": "src/legacy/utils/notification.js",
        "legacy/utils/remotePath": "src/legacy/utils/remotePath.ts",
        "legacy/utils/termThemes": "src/legacy/utils/termThemes.js",
        "legacy/utils/appTheme": "src/legacy/utils/appTheme.ts",
        "legacy/utils/ai": "src/legacy/utils/ai.ts",
        "legacy/utils/dbm": "src/legacy/utils/dbm.ts",
        "legacy/utils/markdown": "src/legacy/utils/markdown.ts",
        "legacy/platform/runtime": "src/legacy/platform/runtime.ts",
        "legacy/platform/transport/invoke":
          "src/legacy/platform/transport/invoke.ts",
        "legacy/platform/transport/hostBridge":
          "src/legacy/platform/transport/hostBridge.ts",
        "legacy/platform/host-services/fs":
          "src/legacy/platform/host-services/fs.ts",
        "legacy/platform/host-services/shell":
          "src/legacy/platform/host-services/shell.ts",
        "legacy/platform/i18n": "src/legacy/platform/i18n.ts",
        "legacy/platform/services/project-runner/commandRunner":
          "src/legacy/platform/services/project-runner/commandRunner.ts",
        "legacy/platform/services/project-runner/packageScripts":
          "src/legacy/platform/services/project-runner/packageScripts.ts",
        "legacy/platform/services/project-runner/types":
          "src/legacy/platform/services/project-runner/types.ts",
        "legacy/platform/services/project-editor/editorOpener":
          "src/legacy/platform/services/project-editor/editorOpener.ts",
        "legacy/platform/services/project-editor/types":
          "src/legacy/platform/services/project-editor/types.ts",
        "legacy/platform/ui/fsWindow": "src/legacy/platform/ui/fsWindow.js",
        "legacy/platform/ui/common/taskLog":
          "src/legacy/platform/ui/common/taskLog.ts",
        "legacy/platform/ui/common/useDragResize":
          "src/legacy/platform/ui/common/useDragResize.js",
        "legacy/platform/ui/common/otabs":
          "src/legacy/platform/ui/common/otabs.ts",
        "legacy/platform/ui/common/project-runner/terminal":
          "src/legacy/platform/ui/common/project-runner/terminal.ts",
        "legacy/platform/ui/common/project-runner/themes":
          "src/legacy/platform/ui/common/project-runner/themes.ts",
        "legacy/platform/ui/tools/common":
          "src/legacy/platform/ui/tools/common.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) =>
        id.endsWith(".vue") ||
        [
          "@tauri-apps/api/core",
          "@tauri-apps/api/event",
          "@tauri-apps/plugin-dialog",
          "element-plus",
          "vue",
        ].includes(id),
      output: {
        entryFileNames: "[name].js",
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    outDir: "dist",
  },
  plugins: [
    dts({
      entryRoot: "src",
      include: ["src/**/*"],
    }),
  ],
});

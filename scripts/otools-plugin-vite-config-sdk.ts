import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type VitePlugin = {
  name: string;
  enforce?: "pre" | "post";
  resolveId?: (source: string) => string | null;
};

type OtoolsPluginSdkViteConfigOptions = {
  host?: string;
  port?: number;
  extraPlugins?: unknown[];
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sdkSourceRoot = path.resolve(repoRoot, "otools/sdk/plugin-sdk/src");
const pluginDependencyPackages = [
  "@codemirror/commands",
  "@codemirror/lang-css",
  "@codemirror/lang-html",
  "@codemirror/lang-javascript",
  "@codemirror/lang-json",
  "@codemirror/lang-php",
  "@codemirror/lang-python",
  "@codemirror/lang-sql",
  "@codemirror/language",
  "@codemirror/state",
  "@codemirror/theme-one-dark",
  "@codemirror/view",
  "@element-plus/icons-vue",
  "@thesvg/vue",
  "element-plus",
  "vue",
  "vditor",
  "xterm",
  "xterm-addon-fit",
];

const sdkSource = (fileName: string) => path.join(sdkSourceRoot, fileName);

const createPluginDependencyResolver = (pluginRoot: string): VitePlugin => {
  const requireFromPlugin = createRequire(path.join(pluginRoot, "package.json"));
  return {
    name: "otools-plugin-dependency-resolver",
    enforce: "pre",
    resolveId(source: string) {
      const packageName = pluginDependencyPackages.find(
        (item) => source === item || source.startsWith(`${item}/`),
      );
      if (!packageName) {
        return null;
      }
      return requireFromPlugin.resolve(source);
    },
  };
};

const loadViteDefineConfig = (pluginRoot: string) => {
  const requireFromPlugin = createRequire(path.join(pluginRoot, "package.json"));
  const viteModule = requireFromPlugin("vite");
  return typeof viteModule?.defineConfig === "function"
    ? viteModule.defineConfig
    : (config: unknown) => config;
};

const loadVuePluginFactory = (pluginRoot: string) => {
  const requireFromPlugin = createRequire(path.join(pluginRoot, "package.json"));
  const vueModule = requireFromPlugin("@vitejs/plugin-vue");
  return vueModule?.default ?? vueModule;
};

const resolveSdkAlias = () => ({
  "otools-plugin-sdk/vite": sdkSource("vite.ts"),
  "otools-plugin-sdk/aliases": sdkSource("aliases.ts"),
  "otools-plugin-sdk/runtime": sdkSource("runtime.ts"),
  "otools-plugin-sdk/dialog": sdkSource("dialog.ts"),
  "otools-plugin-sdk/popup-manager": sdkSource("popup-manager.ts"),
  "otools-plugin-sdk/native-event-bridge": sdkSource("native-event-bridge.ts"),
  "otools-plugin-sdk/otools-globals": sdkSource("otools-globals.ts"),
  "otools-plugin-sdk/tauri-api-shim": sdkSource("tauri-api-shim.ts"),
  "otools-plugin-sdk/tauri-core-shim": sdkSource("tauri-core-shim.ts"),
  "otools-plugin-sdk/tauri-event-shim": sdkSource("tauri-event-shim.ts"),
  "otools-plugin-sdk/tauri-dpi-shim": sdkSource("tauri-dpi-shim.ts"),
  "otools-plugin-sdk/tauri-window-shim": sdkSource("tauri-window-shim.ts"),
  "otools-plugin-sdk/tauri-webview-shim": sdkSource("tauri-webview-shim.ts"),
  "otools-plugin-sdk/tauri-webview-window-shim": sdkSource(
    "tauri-webview-window-shim.ts",
  ),
  "otools-plugin-sdk/tauri-app-shim": sdkSource("tauri-app-shim.ts"),
  "otools-plugin-sdk/tauri-plugin-dialog-shim": sdkSource(
    "tauri-plugin-dialog-shim.ts",
  ),
  "otools-plugin-sdk/tauri-plugin-opener-shim": sdkSource(
    "tauri-plugin-opener-shim.ts",
  ),
  "otools-plugin-sdk/tauri-plugin-shell-shim": sdkSource(
    "tauri-plugin-shell-shim.ts",
  ),
  "otools-plugin-sdk/tauri-plugin-process-shim": sdkSource(
    "tauri-plugin-process-shim.ts",
  ),
  "otools-plugin-sdk/tauri-plugin-updater-shim": sdkSource(
    "tauri-plugin-updater-shim.ts",
  ),
  "otools-plugin-sdk/tauri-plugin-notification-shim": sdkSource(
    "tauri-plugin-notification-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-shim": sdkSource("remote-service-shim.ts"),
  "otools-plugin-sdk/remote-service-otools-web-shim": sdkSource(
    "remote-service-otools-web-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-otools-web-ws-shim": sdkSource(
    "remote-service-otools-web-ws-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-runtime-shim": sdkSource(
    "remote-service-runtime-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-api-core-shim": sdkSource(
    "remote-service-api-core-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-api-event-shim": sdkSource(
    "remote-service-api-event-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-compat-file-shim": sdkSource(
    "remote-service-compat-file-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-compat-path-shim": sdkSource(
    "remote-service-compat-path-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-compat-shell-shim": sdkSource(
    "remote-service-compat-shell-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-host-fs-shim": sdkSource(
    "remote-service-host-fs-shim.ts",
  ),
  "otools-plugin-sdk/remote-service-host-shell-shim": sdkSource(
    "remote-service-host-shell-shim.ts",
  ),
  "otools-plugin-sdk": sdkSource("index.ts"),
});

const resolveTauriAlias = () => ({
  "@tauri-apps/api/core": sdkSource("tauri-core-shim.ts"),
  "@tauri-apps/api/event": sdkSource("tauri-event-shim.ts"),
  "@tauri-apps/api/dpi": sdkSource("tauri-dpi-shim.ts"),
  "@tauri-apps/api/window": sdkSource("tauri-window-shim.ts"),
  "@tauri-apps/api/webview": sdkSource("tauri-webview-shim.ts"),
  "@tauri-apps/api/webviewWindow": sdkSource("tauri-webview-window-shim.ts"),
  "@tauri-apps/api/app": sdkSource("tauri-app-shim.ts"),
  "@tauri-apps/plugin-dialog": sdkSource("tauri-plugin-dialog-shim.ts"),
  "@tauri-apps/plugin-opener": sdkSource("tauri-plugin-opener-shim.ts"),
  "@tauri-apps/plugin-shell": sdkSource("tauri-plugin-shell-shim.ts"),
  "@tauri-apps/plugin-process": sdkSource("tauri-plugin-process-shim.ts"),
  "@tauri-apps/plugin-updater": sdkSource("tauri-plugin-updater-shim.ts"),
  "@tauri-apps/plugin-notification": sdkSource(
    "tauri-plugin-notification-shim.ts",
  ),
  "@tauri-apps/api": sdkSource("tauri-api-shim.ts"),
});

const resolveRemoteServiceAlias = () => ({
  "tauri-remote-service/otools-web": sdkSource(
    "remote-service-otools-web-shim.ts",
  ),
  "tauri-remote-service/otools-web/ws": sdkSource(
    "remote-service-otools-web-ws-shim.ts",
  ),
  "tauri-remote-service/runtime": sdkSource("remote-service-runtime-shim.ts"),
  "tauri-remote-service/api/core": sdkSource(
    "remote-service-api-core-shim.ts",
  ),
  "tauri-remote-service/api/event": sdkSource(
    "remote-service-api-event-shim.ts",
  ),
  "tauri-remote-service/compat/file": sdkSource(
    "remote-service-compat-file-shim.ts",
  ),
  "tauri-remote-service/compat/path": sdkSource(
    "remote-service-compat-path-shim.ts",
  ),
  "tauri-remote-service/compat/shell": sdkSource(
    "remote-service-compat-shell-shim.ts",
  ),
  "tauri-remote-service/host/fs": sdkSource("remote-service-host-fs-shim.ts"),
  "tauri-remote-service/host/shell": sdkSource(
    "remote-service-host-shell-shim.ts",
  ),
  "tauri-remote-service": sdkSource("remote-service-shim.ts"),
});

const resolveLegacyAlias = () => ({
  "@/utils/remoteServiceBridge": sdkSource(
    "legacy/utils/remoteServiceBridge.ts",
  ),
  "@/utils/runtime": sdkSource("legacy/utils/runtime.ts"),
  "@/utils/fileSrc": sdkSource("legacy/utils/fileSrc.ts"),
  "@/utils/hostFs": sdkSource("legacy/utils/hostFs.ts"),
  "@/utils/hostPickers": sdkSource("legacy/utils/hostPickers.ts"),
  "@/utils/hostShell": sdkSource("legacy/utils/hostShell.ts"),
  "@/utils/notification": sdkSource("legacy/utils/notification.js"),
  "@/utils/remotePath": sdkSource("legacy/utils/remotePath.ts"),
  "@/utils/termThemes.js": sdkSource("legacy/utils/termThemes.js"),
  "@/utils/appTheme": sdkSource("legacy/utils/appTheme.ts"),
  "@/utils/ai": sdkSource("legacy/utils/ai.ts"),
  "@/utils/dbm": sdkSource("legacy/utils/dbm.ts"),
  "@/utils/ftp": sdkSource("legacy/utils/ftp.ts"),
  "@/utils/http": sdkSource("legacy/utils/http.ts"),
  "@/utils/markdown": sdkSource("legacy/utils/markdown.ts"),
  "@/utils/mqtt": sdkSource("legacy/utils/mqtt.ts"),
  "@/utils/pakcap": sdkSource("legacy/utils/pakcap.ts"),
  "@/utils/tts": sdkSource("legacy/utils/tts.ts"),
  "@/assets/dbm": sdkSource("legacy/assets/dbm"),
  "@/platform/runtime": sdkSource("legacy/platform/runtime.ts"),
  "@/platform/transport/invoke": sdkSource(
    "legacy/platform/transport/invoke.ts",
  ),
  "@/platform/transport/hostBridge": sdkSource(
    "legacy/platform/transport/hostBridge.ts",
  ),
  "@/platform/host-services/fs": sdkSource(
    "legacy/platform/host-services/fs.ts",
  ),
  "@/platform/host-services/shell": sdkSource(
    "legacy/platform/host-services/shell.ts",
  ),
  "@/platform/i18n": sdkSource("legacy/platform/i18n.ts"),
  "@/platform/services/project-runner/commandRunner": sdkSource(
    "legacy/platform/services/project-runner/commandRunner.ts",
  ),
  "@/platform/services/project-runner/packageScripts": sdkSource(
    "legacy/platform/services/project-runner/packageScripts.ts",
  ),
  "@/platform/services/project-runner/types": sdkSource(
    "legacy/platform/services/project-runner/types.ts",
  ),
  "@/platform/services/project-editor/editorOpener": sdkSource(
    "legacy/platform/services/project-editor/editorOpener.ts",
  ),
  "@/platform/services/project-editor/types": sdkSource(
    "legacy/platform/services/project-editor/types.ts",
  ),
  "@/platform/ui/fsWindow": sdkSource("legacy/platform/ui/fsWindow.js"),
  "@/platform/ui/common/taskLog": sdkSource(
    "legacy/platform/ui/common/taskLog.ts",
  ),
  "@/platform/ui/common/useDragResize": sdkSource(
    "legacy/platform/ui/common/useDragResize.js",
  ),
  "@/platform/ui/common/SplitResizeHandle.vue": sdkSource(
    "legacy/platform/ui/common/SplitResizeHandle.vue",
  ),
  "@/platform/ui/common/EmbeddedChildWebview.vue": sdkSource(
    "legacy/platform/ui/common/EmbeddedChildWebview.vue",
  ),
  "@/platform/ui/common/LocalTerminalView.vue": sdkSource(
    "legacy/platform/ui/common/LocalTerminalView.vue",
  ),
  "@/platform/ui/common/CodeMirrorTextEditor.vue": sdkSource(
    "legacy/platform/ui/common/CodeMirrorTextEditor.vue",
  ),
  "@/platform/ui/common/SshConnectionSettings.vue": sdkSource(
    "legacy/platform/ui/common/SshConnectionSettings.vue",
  ),
  "@/platform/ui/common/ForegroundTaskDialog.vue": sdkSource(
    "legacy/platform/ui/common/ForegroundTaskDialog.vue",
  ),
  "@/platform/ui/common/VditorEditor.vue": sdkSource(
    "legacy/platform/ui/common/VditorEditor.vue",
  ),
  "@/platform/ui/common/ai/AiChatPanel.vue": sdkSource(
    "legacy/platform/ui/common/ai/AiChatPanel.vue",
  ),
  "@/platform/ui/common/FsWindow.vue": sdkSource(
    "legacy/platform/ui/common/FsWindow.vue",
  ),
  "@/platform/ui/common/OTabs.vue": sdkSource(
    "legacy/platform/ui/common/OTabs.vue",
  ),
  "@/platform/ui/common/otabs": sdkSource(
    "legacy/platform/ui/common/otabs.ts",
  ),
  "@/platform/ui/common/project-runner/ProjectRunButton.vue": sdkSource(
    "legacy/platform/ui/common/project-runner/ProjectRunButton.vue",
  ),
  "@/platform/ui/common/project-runner/ProjectTerminalPanel.vue": sdkSource(
    "legacy/platform/ui/common/project-runner/ProjectTerminalPanel.vue",
  ),
  "@/platform/ui/common/project-runner/terminal": sdkSource(
    "legacy/platform/ui/common/project-runner/terminal.ts",
  ),
  "@/platform/ui/common/project-runner/themes": sdkSource(
    "legacy/platform/ui/common/project-runner/themes.ts",
  ),
  "@/plugins/term/ui/TerminalView.vue": sdkSource(
    "legacy/plugins/term/ui/TerminalView.vue",
  ),
  "@/platform/ui/tools/common": sdkSource(
    "legacy/platform/ui/tools/common.ts",
  ),
  "@/platform/ui/tools/Config.vue": sdkSource(
    "legacy/platform/ui/tools/Config.vue",
  ),
});

export const createOtoolsPluginSdkViteConfig = (
  options: OtoolsPluginSdkViteConfigOptions = {},
) =>
  (() => {
    const pluginRoot = process.cwd();
    const defineConfig = loadViteDefineConfig(pluginRoot);
    const vue = loadVuePluginFactory(pluginRoot);

    return defineConfig(() => {
      const config = {
        plugins: [
          createPluginDependencyResolver(pluginRoot),
          vue(),
          ...(options.extraPlugins ?? []),
        ],
        optimizeDeps: {
          exclude: ["otools-plugin-sdk", "tauri-remote-service"],
        },
        resolve: {
          alias: {
            ...resolveSdkAlias(),
            ...resolveRemoteServiceAlias(),
            ...resolveTauriAlias(),
            ...resolveLegacyAlias(),
            "@": path.resolve(repoRoot, "src"),
          },
        },
        base: "./",
        build: {
          outDir: "dist",
          emptyOutDir: true,
          target: "esnext",
        },
      };

      if (!options.host && typeof options.port !== "number") {
        return config;
      }

      return {
        ...config,
        server: {
          host: options.host ?? "127.0.0.1",
          ...(typeof options.port === "number"
            ? { port: options.port, strictPort: true }
            : {}),
        },
      };
    });
  })();

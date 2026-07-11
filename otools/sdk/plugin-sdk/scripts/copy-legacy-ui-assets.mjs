import { cpSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const legacyUiFiles = [
  "CodeMirrorTextEditor.vue",
  "EmbeddedChildWebview.vue",
  "FsWindow.vue",
  "ForegroundTaskDialog.vue",
  "LocalTerminalView.vue",
  "OTabs.vue",
  "SplitResizeHandle.vue",
  "SshConnectionSettings.vue",
  "VditorEditor.vue",
  "ai/AiChatPanel.vue",
  "project-runner/ProjectRunButton.vue",
  "project-runner/ProjectTerminalPanel.vue",
];
const legacyUiToolFiles = ["Config.vue"];
const legacyTermUiFiles = ["TerminalView.vue", "themes.js"];
const legacyAssetDirs = ["dbm"];

for (const fileName of legacyUiFiles) {
  const source = join(
    packageRoot,
    "src",
    "legacy",
    "platform",
    "ui",
    "common",
    fileName,
  );
  const target = join(
    packageRoot,
    "dist",
    "legacy",
    "platform",
    "ui",
    "common",
    fileName,
  );
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

for (const fileName of legacyUiToolFiles) {
  const source = join(
    packageRoot,
    "src",
    "legacy",
    "platform",
    "ui",
    "tools",
    fileName,
  );
  const target = join(
    packageRoot,
    "dist",
    "legacy",
    "platform",
    "ui",
    "tools",
    fileName,
  );
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

for (const fileName of legacyTermUiFiles) {
  const source = join(
    packageRoot,
    "src",
    "legacy",
    "plugins",
    "term",
    "ui",
    fileName,
  );
  const target = join(
    packageRoot,
    "dist",
    "legacy",
    "plugins",
    "term",
    "ui",
    fileName,
  );
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

for (const dirName of legacyAssetDirs) {
  const source = join(packageRoot, "src", "legacy", "assets", dirName);
  const target = join(packageRoot, "dist", "legacy", "assets", dirName);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}

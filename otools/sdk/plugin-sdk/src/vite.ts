import type { Plugin, UserConfig } from "vite";
import { createOtoolsAliasMap } from "./aliases";

export { createOtoolsAliasMap } from "./aliases";

export interface OtoolsPluginSdkViteConfigOptions {
  host?: string;
  port?: number;
  extraPlugins?: Plugin[];
}

const excludedOptimizeDeps = ["otools-plugin-sdk", "tauri-remote-service"];

export function otoolsTauriShimPlugin(): Plugin {
  return {
    name: "otools-tauri-shim",
    config() {
      return {
        resolve: {
          alias: createOtoolsAliasMap(),
        },
      };
    },
  };
}

export function createOtoolsPluginSdkViteConfig(
  options: OtoolsPluginSdkViteConfigOptions = {},
): UserConfig {
  const config: UserConfig = {
    plugins: [otoolsTauriShimPlugin(), ...(options.extraPlugins ?? [])],
    optimizeDeps: {
      exclude: excludedOptimizeDeps,
    },
    resolve: {
      alias: createOtoolsAliasMap(),
    },
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "esnext",
    },
  };

  if (options.host || typeof options.port === "number") {
    config.server = {
      host: options.host ?? "127.0.0.1",
      ...(typeof options.port === "number"
        ? { port: options.port, strictPort: true }
        : {}),
    };
  }

  return config;
}

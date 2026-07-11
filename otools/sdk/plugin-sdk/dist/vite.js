import { createOtoolsAliasMap as r } from "./aliases.js";
const o = ["otools-plugin-sdk", "tauri-remote-service"];
function i() {
  return {
    name: "otools-tauri-shim",
    config() {
      return {
        resolve: {
          alias: r()
        }
      };
    }
  };
}
function u(e = {}) {
  const t = {
    plugins: [i(), ...e.extraPlugins ?? []],
    optimizeDeps: {
      exclude: o
    },
    resolve: {
      alias: r()
    },
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: !0,
      target: "esnext"
    }
  };
  return (e.host || typeof e.port == "number") && (t.server = {
    host: e.host ?? "127.0.0.1",
    ...typeof e.port == "number" ? { port: e.port, strictPort: !0 } : {}
  }), t;
}
export {
  r as createOtoolsAliasMap,
  u as createOtoolsPluginSdkViteConfig,
  i as otoolsTauriShimPlugin
};
//# sourceMappingURL=vite.js.map

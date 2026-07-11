import { invoke as e } from "@tauri-apps/api/core";
const s = "markdown", a = (t) => {
  if (!t || typeof t != "object")
    return { nodes: [] };
  const o = t;
  return Array.isArray(o.nodes) ? {
    nodes: o.nodes
  } : Array.isArray(t) ? {
    nodes: t
  } : { nodes: [] };
};
class r {
  static async getWorkspace() {
    const o = await e("get_otools_plugin_localstate", {
      plugin: s
    });
    return a(o);
  }
  static async saveWorkspace(o) {
    await e("save_otools_plugin_localstate", {
      plugin: s,
      state: o
    });
  }
}
export {
  r as MarkdownApi
};
//# sourceMappingURL=markdown.js.map

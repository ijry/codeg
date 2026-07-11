import { invoke as s } from "@tauri-apps/api/core";
const i = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`, c = (r, e, t = (/* @__PURE__ */ new Date()).toISOString()) => ({
  id: i(),
  role: r,
  content: e.trim(),
  createdAt: t
}), o = (r) => Array.isArray(r) ? r.map((e) => {
  const t = e || {}, a = typeof t.content == "string" ? t.content.trim() : "";
  return a ? {
    id: typeof t.id == "string" && t.id.trim() ? t.id : i(),
    role: t.role === "user" ? "user" : "assistant",
    content: a,
    createdAt: typeof t.createdAt == "string" && t.createdAt.trim() ? t.createdAt : (/* @__PURE__ */ new Date()).toISOString()
  } : null;
}).filter((e) => !!e) : [];
class d {
  static async generateText(e) {
    return s("otools_ai_generate_text", { request: e });
  }
  static async loadChatHistory(e) {
    const t = await s("otools_ai_load_chat_history", { prefix: e });
    return o(t);
  }
  static async saveChatHistory(e, t) {
    await s("otools_ai_save_chat_history", {
      prefix: e,
      messages: o(t)
    });
  }
}
export {
  d as OtoolsAiApi,
  c as createAiChatMessage,
  o as normalizeAiChatMessages
};
//# sourceMappingURL=ai.js.map

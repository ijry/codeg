const h = "ai_settings", _ = "basic_settings", r = {
  provider: "openai",
  baseUrl: "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
  model: "qwen2.5-coder:14b"
}, l = "aliyun-bailian", u = [
  {
    label: "华北2（北京）",
    value: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  {
    label: "新加坡",
    value: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  },
  {
    label: "美国（弗吉尼亚）",
    value: "https://dashscope-us.aliyuncs.com/compatible-mode/v1"
  }
], o = {
  themeMode: "system",
  themeAccent: "classic",
  launchAtStartup: !1,
  locale: "system"
}, y = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
  { label: "日本語", value: "ja-JP" },
  { label: "한국어", value: "ko-KR" },
  { label: "Deutsch", value: "de-DE" },
  { label: "Русский", value: "ru-RU" },
  { label: "Español", value: "es-ES" },
  { label: "العربية", value: "ar-SA" }
], O = [
  { label: "经典蓝", value: "classic" },
  { label: "星云紫", value: "violet" },
  { label: "翡翠绿", value: "emerald" },
  { label: "琥珀橙", value: "amber" },
  { label: "莓果粉", value: "pink" }
], I = [
  {
    name: "basic",
    label: "系统设置"
  },
  {
    name: "ai",
    label: "AI配置"
  }
], c = (e) => {
  const t = String(e || "").trim().toLowerCase();
  return t === "openai" || t === "ollama" || t === "azure" || t === l ? t : t === "dashscope" || t === "aliyun" || t === "bailian" ? l : r.provider;
}, L = (e) => {
  const t = c(e);
  return t === l ? "openai" : t;
}, p = (e) => {
  const t = e.trim().toLowerCase();
  return t ? u.some((a) => a.value.toLowerCase() === t) : !1;
}, i = (e, t) => (typeof e == "string" ? e.trim() : "") || t, d = (e, t) => Object.prototype.hasOwnProperty.call(e, t), T = (e) => {
  const t = e || {}, a = d(t, "apiKey"), n = i(t.baseUrl, r.baseUrl), s = c(t.provider);
  return {
    provider: s === "openai" && p(n) ? l : s,
    baseUrl: n,
    model: i(t.model, r.model),
    apiKey: a ? typeof t.apiKey == "string" ? t.apiKey.trim() : "" : r.apiKey
  };
}, A = (e) => e === "light" || e === "dark" || e === "system" ? e : o.themeMode, b = (e) => e === "classic" || e === "violet" || e === "emerald" || e === "amber" || e === "pink" ? e : o.themeAccent, m = (e) => {
  if (e === "zh-CN" || e === "en-US" || e === "ja-JP" || e === "ko-KR" || e === "de-DE" || e === "ru-RU" || e === "es-ES" || e === "ar-SA")
    return e;
}, v = (e) => e === "system" ? "system" : m(e) || o.locale, E = (e) => ({
  themeMode: A(e?.themeMode),
  themeAccent: b(e?.themeAccent),
  launchAtStartup: typeof e?.launchAtStartup == "boolean" ? e.launchAtStartup : o.launchAtStartup,
  locale: v(e?.locale),
  resolvedLocale: m(e?.resolvedLocale)
});
export {
  l as AI_PROVIDER_ALIYUN_BAILIAN,
  u as ALIYUN_BAILIAN_REGION_OPTIONS,
  I as COMMON_CONFIG_TABS,
  r as DEFAULT_AI_SETTINGS,
  o as DEFAULT_BASIC_SETTINGS,
  y as LOCALE_OPTIONS,
  h as OTOOLS_GLOBAL_AI_SETTINGS_KEY,
  _ as OTOOLS_GLOBAL_BASIC_SETTINGS_KEY,
  O as THEME_ACCENT_OPTIONS,
  T as mergeAiSettings,
  E as mergeBasicSettings,
  L as resolveAiProviderAlias
};
//# sourceMappingURL=common.js.map

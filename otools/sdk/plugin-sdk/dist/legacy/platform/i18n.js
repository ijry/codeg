const g = "otools-locale-changed", s = "otools:locale", a = "zh-CN", v = "en-US", d = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "de-DE",
  "ru-RU",
  "es-ES",
  "ar-SA"
], c = {
  value: a
}, S = {
  value: "system"
}, u = (e) => {
  const t = String(e || "").trim();
  return d.includes(t) ? t : a;
}, l = (e) => {
  const t = String(e || "").trim();
  return t === "system" ? "system" : u(t);
}, L = (e, t) => e.replace(/\{(\w+)\}/g, (n, o) => {
  const r = t?.[o];
  return r == null ? "" : String(r);
}), y = () => c.value, m = () => {
  if (typeof navigator > "u")
    return a;
  const e = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const t of e)
    switch (String(t || "").replace(/_/g, "-").split("-")[0].toLowerCase()) {
      case "en":
        return "en-US";
      case "ja":
        return "ja-JP";
      case "ko":
        return "ko-KR";
      case "de":
        return "de-DE";
      case "ru":
        return "ru-RU";
      case "es":
        return "es-ES";
      case "ar":
        return "ar-SA";
      case "zh":
        return "zh-CN";
    }
  return a;
}, f = (e) => {
  const t = l(e.locale);
  return t !== "system" ? t : typeof navigator < "u" ? m() : u(e.resolvedLocale);
}, p = () => {
  try {
    if (typeof window > "u" || typeof window.localStorage > "u")
      return null;
    const e = window.localStorage.getItem(s);
    return e ? l(e) : null;
  } catch {
    return null;
  }
}, C = (e) => {
  const t = l(e.locale), n = f(e);
  S.value = t, c.value = n;
  try {
    window.localStorage.setItem(s, t);
  } catch {
  }
  typeof document < "u" && (document.documentElement.setAttribute("lang", n), document.dispatchEvent(
    new CustomEvent(g, {
      detail: { locale: n, source: "i18n-local" }
    })
  ));
}, A = () => {
}, E = (e, t, n) => {
  const o = String(e || "").trim();
  return o ? L(n || o, t) : n || "";
}, _ = (e) => {
  const t = String(e || "").trim(), n = (o) => t ? `${t}.${o}` : o;
  return {
    locale: c,
    t: (o, r, i) => E(n(o), r, i)
  };
};
export {
  a as DEFAULT_LOCALE,
  v as ENGLISH_FALLBACK_LOCALE,
  s as OTOOLS_LOCALE_CACHE_KEY,
  g as OTOOLS_LOCALE_SYNC_EVENT_NAME,
  d as SUPPORTED_LOCALES,
  C as applyLocaleSettings,
  c as currentLocaleRef,
  S as currentLocaleSettingRef,
  y as getCurrentLocale,
  m as getSystemLocale,
  p as readCachedLocale,
  f as resolveLocaleSetting,
  A as setLocaleSyncBridge,
  E as t,
  _ as useI18nScope
};
//# sourceMappingURL=i18n.js.map

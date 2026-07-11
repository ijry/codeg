const e = /\b(error|failed|fatal|panic)\b/i, o = (r, t = e) => t.test(String(r || ""));
export {
  e as DEFAULT_TASK_LOG_ERROR_PATTERN,
  o as detectTaskLogError
};
//# sourceMappingURL=taskLog.js.map

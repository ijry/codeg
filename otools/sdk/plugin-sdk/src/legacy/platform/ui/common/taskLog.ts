export const DEFAULT_TASK_LOG_ERROR_PATTERN = /\b(error|failed|fatal|panic)\b/i;

export const detectTaskLogError = (
  text: string,
  pattern: RegExp = DEFAULT_TASK_LOG_ERROR_PATTERN,
) => {
  return pattern.test(String(text || ''));
};

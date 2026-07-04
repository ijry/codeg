"use client"

export const OTOOLS_GLOBAL_SHORTCUT_EVENT = "otools-global-shortcut-triggered"
const OTOOLS_PENDING_SHORTCUT_STORAGE_KEY =
  "codeg:otools-pending-global-shortcut"
const OTOOLS_LAST_HANDLED_SHORTCUT_STORAGE_KEY =
  "codeg:otools-last-handled-global-shortcut"

export interface OtoolsGlobalShortcutTriggeredPayload {
  pluginUuid: string
  shortcut: string
  triggeredAtMs: number
}

export function normalizeOtoolsGlobalShortcutPayload(
  payload: unknown
): OtoolsGlobalShortcutTriggeredPayload | null {
  if (!payload || typeof payload !== "object") {
    return null
  }
  const record = payload as Record<string, unknown>
  const pluginUuid = String(record.pluginUuid || "").trim()
  const shortcut = String(record.shortcut || "").trim()
  const triggeredAtMs = Number(record.triggeredAtMs)
  if (
    !pluginUuid ||
    !shortcut ||
    !Number.isFinite(triggeredAtMs) ||
    triggeredAtMs <= 0
  ) {
    return null
  }
  return {
    pluginUuid,
    shortcut,
    triggeredAtMs,
  }
}

function buildOtoolsGlobalShortcutKey(
  payload: OtoolsGlobalShortcutTriggeredPayload
): string {
  return `${payload.pluginUuid}:${payload.shortcut}:${payload.triggeredAtMs}`
}

export function persistPendingOtoolsGlobalShortcut(
  payload: OtoolsGlobalShortcutTriggeredPayload
): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(
      OTOOLS_PENDING_SHORTCUT_STORAGE_KEY,
      JSON.stringify(payload)
    )
  } catch {}
}

export function readPendingOtoolsGlobalShortcut(): OtoolsGlobalShortcutTriggeredPayload | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(OTOOLS_PENDING_SHORTCUT_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return normalizeOtoolsGlobalShortcutPayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export function clearPendingOtoolsGlobalShortcut(): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.removeItem(OTOOLS_PENDING_SHORTCUT_STORAGE_KEY)
  } catch {}
}

export function markHandledOtoolsGlobalShortcut(
  payload: OtoolsGlobalShortcutTriggeredPayload
): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(
      OTOOLS_LAST_HANDLED_SHORTCUT_STORAGE_KEY,
      buildOtoolsGlobalShortcutKey(payload)
    )
  } catch {}
}

export function hasHandledOtoolsGlobalShortcut(
  payload: OtoolsGlobalShortcutTriggeredPayload
): boolean {
  if (typeof window === "undefined") {
    return false
  }
  try {
    return (
      window.localStorage.getItem(OTOOLS_LAST_HANDLED_SHORTCUT_STORAGE_KEY) ===
      buildOtoolsGlobalShortcutKey(payload)
    )
  } catch {
    return false
  }
}

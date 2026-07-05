export const OTOOLS_HOST_RELOAD_PLUGINS_EVENT = "codeg:otools-reload-plugins"
export const OTOOLS_HOST_CREATE_TAB_EVENT = "codeg:otools-create-tab"
export const OTOOLS_HOST_CLOSE_TAB_EVENT = "codeg:otools-close-tab"
export const OTOOLS_HOST_SWITCH_TAB_EVENT = "codeg:otools-switch-tab"
export const OTOOLS_HOST_SHELL_SHORTCUT_EVENT = "codeg:otools-shell-shortcut"
export const OTOOLS_HOST_STATUS_BAR_EVENT = "codeg:otools-status-bar"
export const OTOOLS_HOST_NOTIFICATION_EVENT = "codeg:otools-notification"
export const OTOOLS_HOST_CHILD_THEME_SYNC_EVENT =
  "codeg:otools-child-theme-sync"
export const OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT =
  "codeg:otools-child-locale-sync"
const OTOOLS_HOST_CHILD_THEME_SYNC_STORAGE_KEY =
  "codeg:otools-child-theme-sync:detail"
const OTOOLS_HOST_CHILD_LOCALE_SYNC_STORAGE_KEY =
  "codeg:otools-child-locale-sync:detail"

export interface OtoolsHostCreateTabDetail {
  label: string
  title?: string | null
  url?: string | null
  pluginUuid?: string | null
}

export interface OtoolsHostCloseTabDetail {
  label: string
}

export interface OtoolsHostSwitchTabDetail {
  activeLabel?: string | null
  allLabels?: string[] | null
}

export type OtoolsHostShellShortcutAction =
  | "closeActiveTab"
  | "activatePrevTab"
  | "activateNextTab"

export interface OtoolsHostShellShortcutDetail {
  action: OtoolsHostShellShortcutAction
}

export interface OtoolsHostStatusBarDetail {
  pluginUuid?: string | null
  title?: string | null
  tooltip?: string | null
  visible?: boolean
}

export interface OtoolsHostNotificationDetail {
  pluginUuid?: string | null
  title?: string | null
  body?: string | null
  clickFeatureCode?: string | null
}

export interface OtoolsHostWindowState {
  tabLabels: string[]
  activeLabel: string | null
}

export interface OtoolsHostChildThemeSyncDetail {
  themeMode?: string | null
  themeAccent?: string | null
  resolvedTheme?: string | null
}

export interface OtoolsHostChildLocaleSyncDetail {
  locale?: string | null
}

function broadcastCrossWindowDetail(key: string, detail: unknown): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        detail,
        nonce: Math.random().toString(36).slice(2),
        ts: Date.now(),
      })
    )
    window.localStorage.removeItem(key)
  } catch {
    return
  }
}

export function dispatchOtoolsChildThemeSync(
  detail: OtoolsHostChildThemeSyncDetail
): void {
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(
    new CustomEvent<OtoolsHostChildThemeSyncDetail>(
      OTOOLS_HOST_CHILD_THEME_SYNC_EVENT,
      {
        detail,
      }
    )
  )
  broadcastCrossWindowDetail(OTOOLS_HOST_CHILD_THEME_SYNC_STORAGE_KEY, detail)
}

export function dispatchOtoolsChildLocaleSync(
  detail: OtoolsHostChildLocaleSyncDetail
): void {
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(
    new CustomEvent<OtoolsHostChildLocaleSyncDetail>(
      OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT,
      {
        detail,
      }
    )
  )
  broadcastCrossWindowDetail(OTOOLS_HOST_CHILD_LOCALE_SYNC_STORAGE_KEY, detail)
}

export const OTOOLS_HOST_RELOAD_PLUGINS_EVENT = "codeg:otools-reload-plugins"
export const OTOOLS_HOST_CREATE_TAB_EVENT = "codeg:otools-create-tab"
export const OTOOLS_HOST_CLOSE_TAB_EVENT = "codeg:otools-close-tab"
export const OTOOLS_HOST_SWITCH_TAB_EVENT = "codeg:otools-switch-tab"
export const OTOOLS_HOST_SHELL_SHORTCUT_EVENT = "codeg:otools-shell-shortcut"

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

export interface OtoolsHostWindowState {
  tabLabels: string[]
  activeLabel: string | null
}

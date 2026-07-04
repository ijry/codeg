"use client"

import { useEffect, type RefObject } from "react"
import {
  mapHostColorToThemeAccent,
  mapThemeAccentToHostColor,
} from "@/lib/otools/config-runtime"
import {
  OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT,
  OTOOLS_HOST_CHILD_THEME_SYNC_EVENT,
  type OtoolsHostChildLocaleSyncDetail,
  type OtoolsHostChildThemeSyncDetail,
} from "@/lib/otools/host-events"
import type { OtoolsThemeAccent } from "@/lib/otools/types"

const OTOOLS_THEME_SYNC_BRIDGE_EVENT = "otools-theme-sync-requested"
const OTOOLS_LOCALE_SYNC_BRIDGE_EVENT = "otools-locale-changed"

function currentThemeDetail(): OtoolsHostChildThemeSyncDetail {
  const root = document.documentElement
  const resolvedTheme = root.classList.contains("dark") ? "dark" : "light"
  return {
    themeMode: root.getAttribute("data-theme-mode") || resolvedTheme,
    themeAccent:
      root.getAttribute("data-theme-accent") ||
      mapHostColorToThemeAccent(root.getAttribute("data-theme")),
    resolvedTheme,
  }
}

function currentLocaleDetail(): OtoolsHostChildLocaleSyncDetail {
  return {
    locale: document.documentElement.lang || "en",
  }
}

function postBridgeEvent(
  frame: HTMLIFrameElement,
  event: string,
  payload: unknown
): void {
  frame.contentWindow?.postMessage(
    {
      type: "otools:host-event",
      event,
      payload,
    },
    "*"
  )
}

function applyThemeToFrame(
  frame: HTMLIFrameElement,
  detail: OtoolsHostChildThemeSyncDetail
): void {
  const themeMode = String(detail.themeMode || "system").trim() || "system"
  const themeAccent =
    String(detail.themeAccent || "classic").trim() || "classic"
  const resolvedTheme =
    detail.resolvedTheme === "dark" || detail.resolvedTheme === "light"
      ? detail.resolvedTheme
      : themeMode === "dark"
        ? "dark"
        : "light"

  try {
    const root = frame.contentDocument?.documentElement
    if (root) {
      root.classList.toggle("dark", resolvedTheme === "dark")
      root.classList.toggle("light", resolvedTheme === "light")
      root.style.colorScheme = resolvedTheme
      root.setAttribute("data-theme-mode", themeMode)
      root.setAttribute("data-theme-accent", themeAccent)
      root.setAttribute(
        "data-theme",
        mapThemeAccentToHostColor(themeAccent as OtoolsThemeAccent)
      )
    }

    if (frame.contentWindow) {
      const target = frame.contentWindow as Window & {
        __OTOOLS_THEME__?: unknown
      }
      target.__OTOOLS_THEME__ = {
        themeMode,
        themeAccent,
        resolvedTheme,
      }
    }
  } catch {}

  postBridgeEvent(frame, OTOOLS_THEME_SYNC_BRIDGE_EVENT, {
    themeMode,
    themeAccent,
    resolvedTheme,
  })
}

function applyLocaleToFrame(
  frame: HTMLIFrameElement,
  detail: OtoolsHostChildLocaleSyncDetail
): void {
  const locale = String(detail.locale || "en").trim() || "en"

  try {
    const root = frame.contentDocument?.documentElement
    if (root) {
      root.setAttribute("lang", locale)
    }

    if (frame.contentWindow) {
      const target = frame.contentWindow as Window & {
        __OTOOLS_LOCALE__?: unknown
      }
      target.__OTOOLS_LOCALE__ = {
        locale,
      }
    }
  } catch {}

  postBridgeEvent(frame, OTOOLS_LOCALE_SYNC_BRIDGE_EVENT, {
    locale,
  })
}

export function useOtoolsChildWebviewSync(
  frameRef: RefObject<HTMLIFrameElement | null>,
  syncKey?: unknown
): void {
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof window === "undefined") {
      return
    }

    const syncCurrent = () => {
      applyThemeToFrame(frame, currentThemeDetail())
      applyLocaleToFrame(frame, currentLocaleDetail())
    }

    const handleTheme = (event: Event) => {
      applyThemeToFrame(
        frame,
        (event as CustomEvent<OtoolsHostChildThemeSyncDetail>).detail ??
          currentThemeDetail()
      )
    }

    const handleLocale = (event: Event) => {
      applyLocaleToFrame(
        frame,
        (event as CustomEvent<OtoolsHostChildLocaleSyncDetail>).detail ??
          currentLocaleDetail()
      )
    }

    const handleLoad = () => {
      syncCurrent()
    }

    frame.addEventListener("load", handleLoad)
    window.addEventListener(OTOOLS_HOST_CHILD_THEME_SYNC_EVENT, handleTheme)
    window.addEventListener(OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT, handleLocale)
    syncCurrent()

    return () => {
      frame.removeEventListener("load", handleLoad)
      window.removeEventListener(
        OTOOLS_HOST_CHILD_THEME_SYNC_EVENT,
        handleTheme
      )
      window.removeEventListener(
        OTOOLS_HOST_CHILD_LOCALE_SYNC_EVENT,
        handleLocale
      )
    }
  }, [frameRef, syncKey])
}

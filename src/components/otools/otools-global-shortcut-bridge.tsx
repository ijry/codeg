"use client"

import { useEffect } from "react"
import { openOtoolsWindow } from "@/lib/otools/api"
import {
  OTOOLS_GLOBAL_SHORTCUT_EVENT,
  normalizeOtoolsGlobalShortcutPayload,
  persistPendingOtoolsGlobalShortcut,
} from "@/lib/otools/shortcut-events"
import { getShellTransport, isDesktop } from "@/lib/transport"

export function OtoolsGlobalShortcutBridge() {
  useEffect(() => {
    if (!isDesktop() || window.location.pathname.startsWith("/otools")) {
      return
    }

    let dispose: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const off = await getShellTransport().subscribe<unknown>(
          OTOOLS_GLOBAL_SHORTCUT_EVENT,
          (payload) => {
            const next = normalizeOtoolsGlobalShortcutPayload(payload)
            if (!next) {
              return
            }
            persistPendingOtoolsGlobalShortcut(next)
            void openOtoolsWindow("global-shortcut").catch(() => {})
          }
        )

        if (cancelled) {
          off()
        } else {
          dispose = off
        }
      } catch (error) {
        console.warn("[otools-shortcut] subscribe failed:", error)
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  return null
}

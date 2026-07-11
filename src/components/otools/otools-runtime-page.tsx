"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  buildOtoolsPluginUrl,
  getOtoolsHostInfo,
  getOtoolsPlugin,
} from "@/lib/otools/api"
import {
  dispatchOtoolsCommand,
  loadOtoolsPluginDocument,
} from "@/lib/otools/plugin-bridge"
import type {
  OtoolsHostChildLocaleSyncDetail,
  OtoolsHostChildThemeSyncDetail,
} from "@/lib/otools/host-events"
import { isDesktop, isRemoteDesktopMode } from "@/lib/transport"
import type { OtoolsPluginInfo } from "@/lib/otools/types"

const RESERVED_RUNTIME_QUERY_KEYS = new Set([
  "pluginUuid",
  "windowLabel",
  "title",
  "entryPath",
  "sourceUrl",
])

type RuntimeState =
  | { kind: "loading" }
  | { kind: "error"; message: string }

export function OtoolsRuntimePage() {
  const searchParams = useSearchParams()
  const queryString = useMemo(() => searchParams.toString(), [searchParams])
  const [state, setState] = useState<RuntimeState>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    const hostIsLocalDesktop = isDesktop() && !isRemoteDesktopMode()
    const params = new URLSearchParams(queryString)
    const pluginUuid = params.get("pluginUuid")?.trim() || ""
    const windowLabel = params.get("windowLabel")?.trim() || null
    const title = params.get("title")?.trim() || null
    const entryPath = params.get("entryPath")?.trim() || null
    const sourceUrl = params.get("sourceUrl")?.trim() || null
    const initialThemeSync = readInitialThemeSyncDetail()
    const initialLocaleSync = readInitialLocaleSyncDetail()
    const passthroughParams = new URLSearchParams(queryString)

    for (const key of RESERVED_RUNTIME_QUERY_KEYS) {
      passthroughParams.delete(key)
    }

    void (async () => {
      if (!pluginUuid) {
        throw new Error("Missing OTools pluginUuid")
      }

      const [plugin, hostInfo] = await Promise.all([
        getOtoolsPlugin(pluginUuid),
        getOtoolsHostInfo(),
      ])

      const entryUrl = resolveRuntimeEntryUrl(
        plugin,
        sourceUrl,
        entryPath,
        passthroughParams
      )
      const currentBrowserUrl = resolveCurrentBrowserUrl(
        entryUrl,
        sourceUrl,
        passthroughParams
      )
      const html = await loadOtoolsPluginDocument(entryUrl, plugin, hostInfo, {
        currentBrowserUrl,
        initialLocaleSync,
        initialThemeSync,
        windowLabel,
      })

      if (cancelled) {
        return
      }

      const runtimeTitle =
        title || plugin.displayNameCn || plugin.displayName || "OTools"

      ;(
        window as Window & {
          __OToolsBridgePostInvoke?: (
            command: string,
            payload?: unknown
          ) => Promise<unknown> | unknown
          __CODEG_OTOOLS_WINDOW_LABEL__?: string
          __CODEG_OTOOLS_FORCE_WEB__?: boolean
        }
      ).__OToolsBridgePostInvoke = (command, payload) =>
        dispatchOtoolsCommand(plugin.uuid, command, payload)

      ;(
        window as Window & {
          __CODEG_OTOOLS_WINDOW_LABEL__?: string
          __CODEG_OTOOLS_FORCE_WEB__?: boolean
        }
      ).__CODEG_OTOOLS_WINDOW_LABEL__ = windowLabel || plugin.uuid

      ;(
        window as Window & {
          __CODEG_OTOOLS_FORCE_WEB__?: boolean
        }
      ).__CODEG_OTOOLS_FORCE_WEB__ = !hostIsLocalDesktop

      document.title = runtimeTitle
      document.open()
      document.write(html)
      document.close()
    })().catch((error) => {
      if (cancelled) {
        return
      }
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [queryString])

  if (state.kind === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-center text-sm text-destructive">
        {state.message}
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading OTools plugin...
    </div>
  )
}

function resolveRuntimeEntryUrl(
  plugin: OtoolsPluginInfo,
  sourceUrl: string | null,
  entryPath: string | null,
  passthroughParams: URLSearchParams
): string {
  const passthroughQuery = passthroughParams.toString()
  const explicitEntryPath = String(entryPath || "").trim()
  if (explicitEntryPath) {
    const assetUrl = buildAssetEntryUrl(plugin, explicitEntryPath)
    return appendQueryToUrl(assetUrl, passthroughQuery)
  }

  const parsedSource = parseSameOriginUrl(sourceUrl)
  if (
    parsedSource &&
    plugin.assetBaseUrl &&
    parsedSource.pathname.includes(plugin.assetBaseUrl)
  ) {
    return appendQueryToUrl(parsedSource.toString(), passthroughQuery)
  }

  return appendQueryToUrl(buildOtoolsPluginUrl(plugin), passthroughQuery)
}

function resolveCurrentBrowserUrl(
  entryUrl: string,
  sourceUrl: string | null,
  passthroughParams: URLSearchParams
): string {
  const passthroughQuery = passthroughParams.toString()
  const parsedSource = parseAnyUrl(sourceUrl)

  if (parsedSource) {
    if (passthroughQuery) {
      parsedSource.search = passthroughQuery
    }
    return parsedSource.toString()
  }

  return appendQueryToUrl(entryUrl, passthroughQuery)
}

function buildAssetEntryUrl(
  plugin: OtoolsPluginInfo,
  entryPath: string
): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  const cleanBase = plugin.assetBaseUrl.replace(/\/+$/, "")
  const cleanEntry = entryPath.replace(/^\/+/, "")
  if (!cleanBase) {
    return buildOtoolsPluginUrl(plugin)
  }
  return `${origin}${cleanBase}/${cleanEntry}`
}

function appendQueryToUrl(baseUrl: string, query: string): string {
  if (!query) {
    return baseUrl
  }

  try {
    const parsed = new URL(
      baseUrl,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    )
    parsed.search = query
    return parsed.toString()
  } catch {
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`
  }
}

function parseSameOriginUrl(value: string | null): URL | null {
  const parsed = parseAnyUrl(value)
  if (!parsed) {
    return null
  }

  if (
    typeof window !== "undefined" &&
    parsed.origin !== window.location.origin
  ) {
    return null
  }

  return parsed
}

function parseAnyUrl(value: string | null): URL | null {
  const raw = String(value || "").trim()
  if (!raw) {
    return null
  }

  try {
    return new URL(
      raw,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    )
  } catch {
    return null
  }
}

function readInitialThemeSyncDetail(): OtoolsHostChildThemeSyncDetail {
  if (typeof document === "undefined") {
    return {
      resolvedTheme: "light",
      themeAccent: "classic",
      themeMode: "light",
    }
  }

  const root = document.documentElement
  const resolvedTheme = root.classList.contains("dark") ? "dark" : "light"
  return {
    resolvedTheme,
    themeAccent: root.getAttribute("data-theme-accent") || "classic",
    themeMode: root.getAttribute("data-theme-mode") || resolvedTheme,
  }
}

function readInitialLocaleSyncDetail(): OtoolsHostChildLocaleSyncDetail {
  if (typeof document === "undefined") {
    return {
      locale: "en",
    }
  }

  return {
    locale: document.documentElement.lang || "en",
  }
}

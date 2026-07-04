"use client"

import type { ReactNode } from "react"
import type { OtoolsHostInfo, OtoolsPluginInfo } from "@/lib/otools/types"
import { ConfigPluginView } from "./config/web/config-plugin-view"
import { DevPluginView } from "./dev/web/dev-plugin-view"
import { ParkPluginView } from "./park/web/park-plugin-view"

export interface BuiltinPluginViewProps {
  hostInfo: OtoolsHostInfo | null
  loading: boolean
  marketQuery: string
  onMarketQueryChange: (value: string) => void
  onOpenPlugin: (plugin: OtoolsPluginInfo) => void
  onRefresh: () => void
  plugin: OtoolsPluginInfo
  plugins: OtoolsPluginInfo[]
}

type BuiltinPluginEntry = "config" | "dev" | "park"

const BUILTIN_WEB_VIEW_ENTRIES: Record<string, BuiltinPluginEntry> = {
  "builtin://config": "config",
  "builtin://dev": "dev",
  "builtin://park": "park",
}

const BUILTIN_HOME_TARGETS = {
  dev: "builtin://dev",
  park: "builtin://park",
} as const

export function renderBuiltinPluginView(
  plugin: OtoolsPluginInfo,
  props: BuiltinPluginViewProps
): ReactNode | null {
  const entry = BUILTIN_WEB_VIEW_ENTRIES[plugin.entry.trim().toLowerCase()]
  switch (entry) {
    case "config":
      return <ConfigPluginView {...props} />
    case "dev":
      return <DevPluginView {...props} />
    case "park":
      return <ParkPluginView {...props} />
    default:
      return null
  }
}

export function getBuiltinHomeTargets(plugins: OtoolsPluginInfo[]): {
  dev: OtoolsPluginInfo | null
  park: OtoolsPluginInfo | null
} {
  return {
    dev: findBuiltinByEntry(plugins, BUILTIN_HOME_TARGETS.dev),
    park: findBuiltinByEntry(plugins, BUILTIN_HOME_TARGETS.park),
  }
}

function findBuiltinByEntry(
  plugins: OtoolsPluginInfo[],
  entry: string
): OtoolsPluginInfo | null {
  return (
    plugins.find((plugin) => plugin.entry.trim().toLowerCase() === entry) ??
    null
  )
}

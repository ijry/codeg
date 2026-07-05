"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { buildOtoolsPluginUrl } from "@/lib/otools/api"
import { useOtoolsChildWebviewSync } from "@/lib/otools/child-webview-sync"
import {
  installOtoolsFrameBridge,
  loadOtoolsPluginDocument,
} from "@/lib/otools/plugin-bridge"
import type { OtoolsHostInfo, OtoolsPluginInfo } from "@/lib/otools/types"

interface OtoolsPluginFrameProps {
  hostInfo: OtoolsHostInfo | null
  plugin: OtoolsPluginInfo
  windowLabel?: string | null
}

export function OtoolsPluginFrame({
  hostInfo,
  plugin,
  windowLabel,
}: OtoolsPluginFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [frameState, setFrameState] = useState<{
    error: string | null
    pluginUuid: string
    srcDoc: string
  }>({ error: null, pluginUuid: "", srcDoc: "" })
  const src = useMemo(() => buildOtoolsPluginUrl(plugin), [plugin])
  const error = frameState.pluginUuid === plugin.uuid ? frameState.error : null
  const srcDoc = frameState.pluginUuid === plugin.uuid ? frameState.srcDoc : ""
  useOtoolsChildWebviewSync(frameRef, `${plugin.uuid}:${srcDoc.length}`)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    return installOtoolsFrameBridge(frame, plugin.uuid)
  }, [plugin.uuid, srcDoc])

  useEffect(() => {
    let cancelled = false

    loadOtoolsPluginDocument(src, plugin, hostInfo, { windowLabel })
      .then((html) => {
        if (cancelled) return
        setFrameState({
          error: null,
          pluginUuid: plugin.uuid,
          srcDoc: html,
        })
      })
      .catch((err) => {
        if (cancelled) return
        setFrameState({
          error: err instanceof Error ? err.message : String(err),
          pluginUuid: plugin.uuid,
          srcDoc: "",
        })
      })

    return () => {
      cancelled = true
    }
  }, [hostInfo, plugin, src, windowLabel])

  return (
    <div className="relative min-h-0 flex-1 bg-background">
      {error ? (
        <div className="absolute inset-x-3 top-3 z-10 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
      <iframe
        key={plugin.uuid}
        ref={frameRef}
        srcDoc={srcDoc}
        title={plugin.displayNameCn || plugin.displayName}
        className="h-full w-full border-0 bg-background"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        onLoad={() =>
          setFrameState((current) =>
            current.pluginUuid === plugin.uuid
              ? { ...current, error: null }
              : current
          )
        }
        onError={() =>
          setFrameState({
            error: "Failed to load OTools plugin",
            pluginUuid: plugin.uuid,
            srcDoc: "",
          })
        }
      />
    </div>
  )
}

"use client"

import { Suspense, useEffect } from "react"
import { AppTitleBar } from "@/components/layout/app-title-bar"
import { AppToaster } from "@/components/ui/app-toaster"
import { OtoolsShell } from "@/components/otools/otools-shell"

function OtoolsPageInner() {
  useEffect(() => {
    document.title = "OTools - codeg-plus"
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <AppTitleBar
        center={
          <div className="text-sm font-semibold tracking-tight">OTools</div>
        }
      />
      <main className="min-h-0 flex-1">
        <OtoolsShell />
      </main>
      <AppToaster position="bottom-right" duration={6000} closeButton />
    </div>
  )
}

export default function OtoolsPage() {
  return (
    <Suspense>
      <OtoolsPageInner />
    </Suspense>
  )
}

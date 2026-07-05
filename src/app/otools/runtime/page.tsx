"use client"

import { Suspense } from "react"
import { OtoolsRuntimePage } from "@/components/otools/otools-runtime-page"

export default function OtoolsRuntimeRoute() {
  return (
    <Suspense>
      <OtoolsRuntimePage />
    </Suspense>
  )
}

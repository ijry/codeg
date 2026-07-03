import { Suspense } from "react"
import { RemoteConnectionGate } from "@/contexts/remote-connection-context"

export default function OtoolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense>
      <RemoteConnectionGate>{children}</RemoteConnectionGate>
    </Suspense>
  )
}

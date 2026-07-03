import { DitherBackdrop } from "@/components/ui/button-dither"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export function OnboardingGateStatus({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      {children}
    </main>
  )
}

export function OnboardingShell({
  icon: Icon,
  children
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center gap-6">
      <div className="relative h-28 overflow-hidden rounded-2xl border border-border bg-background">
        <DitherBackdrop
          from="var(--background)"
          to="var(--muted-foreground)"
          direction="tr"
          stops={[0.16, 0.92]}
          matrix="8x8"
          pixelSize={4}
        />
        <div className="absolute bottom-4 left-4 flex size-11 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
          <Icon className="size-5 text-foreground" strokeWidth={1.75} />
        </div>
      </div>
      {children}
    </div>
  )
}

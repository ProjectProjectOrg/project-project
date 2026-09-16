import type { LinkComponentProps } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { BackButton } from "@/components/BackButton"

export function TicketPageShell({
  back,
  actions,
  header,
  children
}: {
  back: LinkComponentProps
  actions?: ReactNode
  header: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <BackButton fallback={back} />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {header}

      <div className="h-px bg-border/60" />

      {children}
    </div>
  )
}

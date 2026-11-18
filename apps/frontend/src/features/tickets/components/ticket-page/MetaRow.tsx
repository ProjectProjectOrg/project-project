import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"

export function MetaRow({
  label,
  action,
  inset,
  children
}: {
  label: ReactNode
  action?: ReactNode
  inset?: "control" | "link"
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5 has-[>div:empty]:hidden">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-caption text-muted-foreground">{label}</h3>
        {action ? <span className="-my-1.5 -mr-1.5 flex">{action}</span> : null}
      </header>
      <div
        className={cn(
          "flex min-w-0 flex-col items-start",
          inset === "control" && "-ml-2.5 gap-1 [&_[data-slot=button]]:h-7",
          inset === "link" && "-ml-1.5 gap-1"
        )}
      >
        {children}
      </div>
    </section>
  )
}

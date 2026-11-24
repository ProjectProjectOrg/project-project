import { Collapsible } from "@base-ui/react/collapsible"
import { ChevronRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"

type SettingsDisclosureItemProps = Readonly<{
  label: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}>

export function SettingsDisclosureItem({
  label,
  open,
  onToggle,
  children
}: SettingsDisclosureItemProps) {
  return (
    <Collapsible.Root open={open} onOpenChange={onToggle}>
      <Collapsible.Trigger
        type="button"
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-body font-semibold transition-colors hover:bg-hover active:bg-active"
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-150",
            open && "rotate-90"
          )}
          strokeWidth={2}
        />
        <span>{label}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden opacity-100 transition-[height,opacity] duration-180 ease-standard data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <div className="space-y-2 px-4 pb-4">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

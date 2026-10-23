import { motion } from "motion/react"
import type { ComponentProps, ReactNode } from "react"

import {
  Select,
  SelectTrigger,
  type SelectOption
} from "@/components/ui/select"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ToolbarButton({
  active,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground ring-offset-background transition-all duration-100 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
        active && "bg-accent text-foreground hover:text-foreground",
        className
      )}
    />
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}

export function FilterSection({ children }: { children: ReactNode }) {
  return (
    <div className="[&:not(:first-child)]:mt-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-1">
      {children}
    </div>
  )
}

export function ControlSlot({ children }: { children: ReactNode }) {
  return (
    <motion.div layout="position" transition={transitions.layout}>
      {children}
    </motion.div>
  )
}

export function OptionPicker<
  const Items extends ReadonlyArray<SelectOption<string>>
>({
  label,
  value,
  displayValue,
  onValueChange,
  items,
  action
}: Readonly<{
  action?: ReactNode
  label: string
  value: NoInfer<Items[number]["value"]>
  displayValue: string
  onValueChange: (value: NoInfer<Items[number]["value"]>) => void
  items: Items
}>) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        {action}
        <Select
          items={items}
          value={value}
          onValueChange={onValueChange}
          contentProps={{ align: "end", className: "w-56" }}
        >
          <SelectTrigger
            aria-label={m.tickets_view_options_picker_aria_label({
              label,
              value: displayValue
            })}
            selectedLabel={displayValue}
            className="h-8 w-40 min-w-0"
          />
        </Select>
      </div>
    </div>
  )
}

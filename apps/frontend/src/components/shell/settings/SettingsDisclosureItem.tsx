import { ChevronRight } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

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
  const reduceMotion = useReducedMotion()
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-hover active:bg-active"
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-150",
            open && "rotate-90"
          )}
          strokeWidth={2}
        />
        <span>{label}</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={transitions.presence}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-4 pb-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

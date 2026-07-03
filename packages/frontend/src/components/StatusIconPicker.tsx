import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { STATUS_ICON_NAMES, getStatusIcon } from "@/lib/status-icons"
import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  value: string
  onChange: (icon: string) => void
  onOpenChange?: (open: boolean) => void
  className?: string
  disabled?: boolean
  color?: string
}

export function StatusIconPicker({
  value,
  onChange,
  onOpenChange,
  className,
  disabled,
  color
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const Current = getStatusIcon(value)

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={m.tickets_status_icon_picker_aria()}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Current className="h-4 w-4" style={color ? { color } : undefined} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={springs.moderate}
            className="absolute left-0 top-10 z-50 w-[228px] rounded-md border border-border bg-popover p-2 shadow-md"
          >
            <div className="grid grid-cols-8 gap-1">
              {STATUS_ICON_NAMES.map((name) => {
                const I = getStatusIcon(name)
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={m.tickets_status_icon_option_aria({ name })}
                    onClick={() => {
                      onChange(name)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded transition-all duration-100 hover:bg-accent active:scale-[0.97]",
                      name === value && "bg-accent"
                    )}
                  >
                    <I className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

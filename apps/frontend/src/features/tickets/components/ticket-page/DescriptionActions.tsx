import { Check, Pencil } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { SaveStatus } from "@/features/editor/components/LexicalEditor"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const morphFrom = { opacity: 0, filter: "blur(4px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }
const fadeOut = { opacity: 0 }
const SAVED_LINGER_S = 1.2
const labelBlur = { opacity: 0, filter: "blur(6px)" }
const labelMorph = { duration: 0.22, ease: [0.4, 0, 0.2, 1] } as const
const slotOpen = { width: 14, marginRight: 0, opacity: 1 }
const slotClosed = { width: 0, marginRight: -6, opacity: 0 }

const statusLabel = {
  idle: () => "",
  dirty: m.tickets_save_status_dirty,
  saving: m.tickets_save_status_saving,
  saved: m.tickets_save_status_saved,
  failed: m.editor_save_failed
} satisfies Record<SaveStatus, () => string>

export function DescriptionActions({
  editing,
  status,
  onEdit,
  onDone
}: Readonly<{
  editing: boolean
  status: SaveStatus
  onEdit: () => void
  onDone: () => void
}>) {
  const reduce = useReducedMotion() ?? false
  const hidden = reduce ? fadeOut : morphFrom
  return (
    <div className="sticky top-7 z-10 float-right -mt-1 -mr-2 ml-3 flex w-36 justify-end">
      <AnimatePresence mode="popLayout" anchorX="right" initial={false}>
        <motion.div
          key={editing ? "done" : "edit"}
          initial={hidden}
          animate={morphTo}
          exit={hidden}
          transition={transitions.presence}
        >
          {editing ? (
            <Button
              variant="secondary"
              aria-keyshortcuts="Escape"
              onClick={onDone}
              title={status === "failed" ? m.editor_save_failed() : undefined}
              className={cn(
                "rounded-full pr-1.5 pl-3",
                status === "failed"
                  ? "bg-destructive-light text-destructive hover:bg-destructive-light"
                  : "bg-surface-2 bg-[image:linear-gradient(var(--tint),var(--tint))] hover:bg-surface-2 hover:bg-[image:linear-gradient(var(--tint-hover),var(--tint-hover))]"
              )}
            >
              <SaveDot status={status} />
              <MorphLabel>
                {status === "failed"
                  ? m.tickets_description_not_saved()
                  : m.tickets_description_done()}
              </MorphLabel>
              <Kbd aria-hidden className="rounded-full px-1.5">
                {m.tickets_description_done_key()}
              </Kbd>
              <span aria-live="polite" className="sr-only">
                {statusLabel[status]()}
              </span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              aria-label={m.tickets_description_edit()}
              aria-keyshortcuts="E"
              onClick={onEdit}
              className="rounded-full bg-region pr-1.5 pl-3 hover:bg-region hover:bg-[image:linear-gradient(var(--hover),var(--hover))]"
            >
              <Pencil className="-mr-0.5 size-3.5" strokeWidth={1.75} />
              {m.tickets_description_edit_short()}
              <Kbd
                aria-hidden
                className="rounded-full bg-surface-5 px-1.5 shadow-surface-1"
              >
                {m.tickets_description_edit_key()}
              </Kbd>
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SaveDot({ status }: Readonly<{ status: SaveStatus }>) {
  const open = status !== "idle" && status !== "saved"
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={open ? slotOpen : slotClosed}
      transition={
        status === "saved"
          ? { ...transitions.presence, delay: SAVED_LINGER_S }
          : transitions.presence
      }
      className="grid place-items-center"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "saved" ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={transitions.presence}
          >
            <Check className="size-3.5 text-foreground" strokeWidth={4} />
          </motion.span>
        ) : (
          <motion.span
            key="dot"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={transitions.presence}
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground",
              status === "saving" && "motion-safe:animate-pulse",
              status === "failed" && "bg-destructive"
            )}
          />
        )}
      </AnimatePresence>
    </motion.span>
  )
}

function MorphLabel({ children }: Readonly<{ children: string }>) {
  const reduce = useReducedMotion() ?? false
  const hidden = reduce ? fadeOut : labelBlur
  const [width, setWidth] = useState<number>()
  return (
    <motion.span
      initial={false}
      animate={{ width: width ?? "auto" }}
      transition={labelMorph}
      className="relative inline-flex"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={children}
          ref={(el: HTMLSpanElement | null) => {
            if (el) setWidth(el.offsetWidth)
          }}
          initial={hidden}
          animate={morphTo}
          exit={hidden}
          transition={labelMorph}
          className="whitespace-nowrap"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

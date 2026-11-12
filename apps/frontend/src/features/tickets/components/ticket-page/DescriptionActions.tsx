import { Pencil } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { Ref } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { SaveStatus } from "@/features/editor/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
import { springs, transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const MotionButton = motion.create(Button)

const morphFrom = { opacity: 0, filter: "blur(4px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }
const fadeOut = { opacity: 0 }

export function DescriptionActions({
  editing,
  status,
  buttonRef,
  onEdit,
  onDone
}: Readonly<{
  editing: boolean
  status: SaveStatus
  buttonRef: Ref<HTMLButtonElement>
  onEdit: () => void
  onDone: () => void
}>) {
  const reduce = useReducedMotion() ?? false
  const enter = reduce ? fadeOut : morphFrom
  const leave = reduce ? fadeOut : morphFrom
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-3">
      <AnimatePresence initial={false}>
        {editing && status !== "idle" && (
          <motion.span
            key="status"
            initial={enter}
            animate={morphTo}
            exit={leave}
            transition={transitions.presence}
          >
            <MarkdownSaveIndicator status={status} />
          </motion.span>
        )}
      </AnimatePresence>
      <MotionButton
        ref={buttonRef}
        layout={!reduce}
        transition={{ layout: springs.moderate }}
        style={{ borderRadius: 16 }}
        variant={editing ? "secondary" : "ghost"}
        aria-label={editing ? undefined : m.tickets_description_edit()}
        aria-keyshortcuts={editing ? "Escape" : "E"}
        onClick={editing ? onDone : onEdit}
        className={cn(
          "overflow-hidden pr-1.5 pl-3 motion-safe:transition-[background-color,color,opacity,scale] motion-safe:duration-150",
          !editing &&
            "opacity-0 group-hover/reveal:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={editing ? "done" : "edit"}
            layout="position"
            initial={enter}
            animate={morphTo}
            exit={leave}
            transition={transitions.presence}
            className="flex items-center gap-2"
          >
            {editing ? (
              m.tickets_description_done()
            ) : (
              <>
                <Pencil className="-mr-0.5 size-3.5" strokeWidth={1.75} />
                {m.tickets_description_edit_short()}
              </>
            )}
            <Kbd aria-hidden className="rounded-full px-1.5">
              {editing
                ? m.tickets_description_done_key()
                : m.tickets_description_edit_key()}
            </Kbd>
          </motion.span>
        </AnimatePresence>
      </MotionButton>
    </div>
  )
}

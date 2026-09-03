import { motion } from "motion/react"
import { ArrowLeftRight, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

export function ReorderBoardBanner({
  onSave,
  onCancel
}: {
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={transitions.fade}
      className="flex items-center justify-between gap-3 rounded-xl bg-foreground/5 px-4 py-2"
    >
      <span className="inline-flex items-center gap-2 text-sm">
        <ArrowLeftRight
          className="size-4 text-muted-foreground"
          strokeWidth={1.75}
        />
        <span className="text-foreground">
          {m.sprints_board_reorder_banner_message()}
        </span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leadingIcon={X}
          onClick={onCancel}
        >
          {m.sprints_board_reorder_banner_cancel()}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          leadingIcon={Check}
          onClick={onSave}
        >
          {m.sprints_board_reorder_banner_save()}
        </Button>
      </div>
    </motion.div>
  )
}

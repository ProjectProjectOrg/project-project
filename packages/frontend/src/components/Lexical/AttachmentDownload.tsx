import { motion } from "motion/react"
import { Download } from "lucide-react"
import { MORPH } from "@/components/Lexical/attachmentMorph"
import { m } from "@/paraglide/messages"

export function AttachmentDownload({
  url,
  filename,
  morphId,
  className
}: {
  url: string
  filename: string
  morphId: string
  className?: string
}) {
  return (
    <motion.a
      layoutId={`${morphId}-download`}
      layout="position"
      transition={MORPH}
      href={url}
      download={filename}
      aria-label={m.editor_attachment_download()}
      title={m.editor_attachment_download()}
      onMouseDown={(event) => event.stopPropagation()}
      className={`shrink-0 rounded text-muted-foreground transition-colors duration-100 hover:text-foreground ${className ?? ""}`}
    >
      <Download strokeWidth={1.75} className="size-3" aria-hidden="true" />
    </motion.a>
  )
}

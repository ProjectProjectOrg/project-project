import { attachmentDownloadSrc } from "@pp/shared"
import { Download } from "lucide-react"
import { motion } from "motion/react"

import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

export function AttachmentDownload({
  url,
  filename,
  morphId
}: {
  url: string
  filename: string
  morphId: string
}) {
  return (
    <motion.a
      layoutId={`${morphId}-download`}
      layout="position"
      transition={transitions.morph}
      href={attachmentDownloadSrc(url)}
      download={filename}
      aria-label={m.editor_attachment_download()}
      title={m.editor_attachment_download()}
      onMouseDown={(event) => event.stopPropagation()}
      className="shrink-0 rounded text-muted-foreground transition-colors duration-100 hover:text-foreground [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-[0.97]"
    >
      <Download strokeWidth={1.75} className="size-3" aria-hidden="true" />
    </motion.a>
  )
}

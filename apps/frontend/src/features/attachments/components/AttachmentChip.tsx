import { attachmentDownloadSrc } from "@pp/shared"
import { Download, FileText, Image as ImageIcon } from "lucide-react"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"

import { Chip } from "@/components/ui/chip"
import { MorphIconLink } from "@/components/ui/morph-icon-link"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const HOVER_DELAY_MS = 450

function ChipBody({
  filename,
  kind,
  morphId
}: {
  filename: string
  kind: "image" | "file"
  morphId: string
}) {
  const Icon = kind === "image" ? ImageIcon : FileText
  return (
    <>
      <motion.span
        layout="position"
        transition={transitions.morph}
        className="flex shrink-0 items-center"
      >
        <Icon
          strokeWidth={1.75}
          className="size-3 text-muted-foreground"
          aria-hidden="true"
        />
      </motion.span>
      <motion.span
        layoutId={`${morphId}-filename`}
        layout="position"
        transition={transitions.morph}
        className="truncate"
      >
        {filename}
      </motion.span>
    </>
  )
}

export function AttachmentChip({
  url,
  alt,
  filename,
  kind,
  morphId,
  onBroken,
  action,
  variant = "default"
}: {
  url: string
  alt: string
  filename: string
  kind: "image" | "file"
  morphId: string
  variant?: "default" | "linked"
  onBroken?: () => void
  action?: ReactNode
}) {
  const [broken, setBroken] = useState(false)
  const download = action ?? (
    <MorphIconLink
      layoutId={`${morphId}-download`}
      href={attachmentDownloadSrc(url)}
      download={filename}
      label={m.editor_attachment_download()}
      icon={Download}
    />
  )

  if (variant === "linked") {
    return (
      <Chip>
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
      </Chip>
    )
  }

  if (kind !== "image" || broken) {
    return (
      <Chip>
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
        {download}
      </Chip>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        openOnHover
        delay={HOVER_DELAY_MS}
        render={<Chip />}
        contentEditable={false}
      >
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
        {download}
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-sm p-1.5" align="start">
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block max-h-72 max-w-full rounded-md object-contain"
          onError={() => {
            setBroken(true)
            onBroken?.()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

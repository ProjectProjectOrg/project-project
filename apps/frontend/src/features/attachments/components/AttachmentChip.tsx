import { attachmentDownloadSrc, attachmentFileFormat } from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { Download, FileText, Film, Image as ImageIcon } from "@pp/ui/icons"
import { transitions } from "@pp/ui/lib/springs"
import { MorphIconLink } from "@pp/ui/morph-icon-link"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"

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
  const Icon =
    kind === "image"
      ? ImageIcon
      : attachmentFileFormat(filename) === "video"
        ? Film
        : FileText
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
      <Badge
        variant="outline"
        className="mx-0.5 max-w-full gap-1.5 align-baseline"
      >
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
      </Badge>
    )
  }

  if (kind !== "image" || broken) {
    return (
      <Badge
        variant="outline"
        className="mx-0.5 max-w-full gap-1.5 align-baseline"
      >
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
        {download}
      </Badge>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        openOnHover
        delay={HOVER_DELAY_MS}
        render={
          <Badge
            variant="outline"
            className="mx-0.5 max-w-full gap-1.5 align-baseline"
          />
        }
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

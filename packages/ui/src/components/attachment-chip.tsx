import { attachmentDownloadSrc, attachmentFileFormat } from "@pp/shared"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"

import { transitions } from "../lib/springs"
import { Badge } from "./badge"
import { Download, FileText, Film, Image as ImageIcon } from "./icons"
import { MorphIconLink } from "./morph-icon-link"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

/*
 * AttachmentChip: an attachment inline in text, as a soft badge on the
 * text's line: the kind's icon, the filename and a download link. An
 * image's name shows the image on hover (or focus). `linked` is the chip
 * inside a link (no download of its own). The filename and download morph to
 * and from the attachment's tile when its density changes (`morphId`).
 *
 * The preview trigger and the download are siblings, never one inside the
 * other, so each is its own control.
 */

const HOVER_DELAY_MS = 450

// The chip: a 20px soft badge (sheen and all), its baseline on the text's.
const chipClass = "inline-chip mx-0.5 max-w-full gap-1 text-caption"

function ChipBody({
  filename,
  kind,
  morphId
}: Readonly<{
  filename: string
  kind: "image" | "file"
  morphId: string
}>) {
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
        <Icon strokeWidth={1.75} className="size-3" aria-hidden="true" />
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
  downloadLabel,
  onBroken,
  action,
  variant = "default"
}: Readonly<{
  url: string
  alt: string
  filename: string
  kind: "image" | "file"
  // Pairs the filename and download with the tile's, for the morph.
  morphId: string
  downloadLabel: string
  variant?: "default" | "linked"
  onBroken?: () => void
  // Replaces the download link (the feedback form's remove button).
  action?: ReactNode
}>) {
  const [broken, setBroken] = useState(false)
  const download = action ?? (
    <MorphIconLink
      layoutId={`${morphId}-download`}
      href={attachmentDownloadSrc(url)}
      download={filename}
      label={downloadLabel}
      icon={Download}
      className="-mr-1.5"
    />
  )

  if (variant === "linked") {
    return (
      <Badge size="xs" className={chipClass}>
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
      </Badge>
    )
  }

  const previewable = kind === "image" && !broken
  return (
    <Badge size="xs" className={chipClass} contentEditable={false}>
      {previewable ? (
        <Popover>
          <PopoverTrigger
            nativeButton={false}
            openOnHover
            delay={HOVER_DELAY_MS}
            render={
              <span className="focus-ring -my-0.5 -ml-1.5 inline-flex min-w-0 cursor-zoom-in items-center gap-1 rounded-full py-0.5 pl-1.5" />
            }
          >
            <ChipBody filename={filename} kind={kind} morphId={morphId} />
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-sm p-1.5" align="start">
            <img
              src={url}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block max-h-72 max-w-full rounded-[13px] object-contain [corner-shape:var(--button-corner)]"
              onError={() => {
                setBroken(true)
                onBroken?.()
              }}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
      )}
      {download}
    </Badge>
  )
}

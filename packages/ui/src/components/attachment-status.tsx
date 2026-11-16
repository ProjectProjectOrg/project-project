import { useId, type ReactNode } from "react"

import { cn } from "../lib/utils"
import {
  ATTACHMENT_TILE_FOOTER_HEIGHT,
  ATTACHMENT_TILE_MIN_WIDTH,
  ATTACHMENT_TILE_PREVIEW_HEIGHT,
  attachmentFooterClass,
  attachmentSurfaceClass,
  attachmentWellClass,
  extensionOf,
  PaperPage
} from "./attachment-tile"
import { AlertCircle, Ban, FileOff, RotateCw, X } from "./icons"
import { chipIconActionClass } from "./morph-icon-link"
import { TextSwap } from "./text-swap"

/*
 * An attachment that isn't (or isn't yet) a file to show: uploading, failed
 * to upload, or gone (deleted, or no access). Each is a tile's surface at a
 * tile's size (or a chip's, inline), so the text around it doesn't move and
 * the shape doesn't change when it resolves.
 */

export const ATTACHMENT_UNAVAILABLE_WIDTH = ATTACHMENT_TILE_MIN_WIDTH
export const ATTACHMENT_UNAVAILABLE_HEIGHT =
  ATTACHMENT_TILE_PREVIEW_HEIGHT + ATTACHMENT_TILE_FOOTER_HEIGHT
export const ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT = 20

const tileBox = {
  width: ATTACHMENT_UNAVAILABLE_WIDTH,
  height: ATTACHMENT_UNAVAILABLE_HEIGHT
}

// Gone: the tile's surface with the drawn page faded back and a "no" glyph
// on it; inline, a chip with the same words.
export function AttachmentUnavailable({
  label,
  variant = "block"
}: Readonly<{
  label: string
  variant?: "block" | "inline"
}>) {
  if (variant === "inline")
    return (
      <span
        className="pp-badge inline-chip mx-0.5 inline-flex items-center gap-1 rounded-[10px] px-2 text-caption whitespace-nowrap text-muted-foreground [corner-shape:var(--button-corner)]"
        // As wide as its words, like any chip; only the height is fixed.
        style={{ height: ATTACHMENT_UNAVAILABLE_CHIP_HEIGHT }}
      >
        <FileOff strokeWidth={1.75} className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
    )
  return (
    <span className={cn(attachmentSurfaceClass, "flex p-1")} style={tileBox}>
      <span
        className={cn(
          attachmentWellClass,
          "h-full flex-col gap-3 px-3 text-center text-caption text-balance text-muted-foreground"
        )}
      >
        <PaperPage glyph={Ban} dim />
        {label}
      </span>
    </span>
  )
}

// The upload glyph, drawn like Hugeicons (24px grid, 1.5 stroke, round):
// the tray stays still and only the arrow moves, rising out of the tray,
// resting, then leaving through the top as the next one comes up (theme.css,
// pp-upload-arrow). Under reduced motion it stands still.
function UploadArrow() {
  const clip = `pp-upload-${useId().replace(/:/g, "")}`
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 text-muted-foreground"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="-2" width="24" height="17.5" />
        </clipPath>
      </defs>
      <path d="M4 15v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2" />
      <g clipPath={`url(#${clip})`}>
        <g data-slot="upload-arrow">
          <path d="M12 15V4" />
          <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
        </g>
      </g>
    </svg>
  )
}

// A placeholder built like a tile: the preview well over a filename row.
function TileShape({
  well,
  wellClassName,
  footer
}: Readonly<{
  well: ReactNode
  wellClassName?: string
  footer: ReactNode
}>) {
  return (
    <span
      className={cn(attachmentSurfaceClass, "flex flex-col")}
      style={tileBox}
    >
      <span className="block px-1 pt-1">
        <span
          className={cn(attachmentWellClass, "flex-col gap-3", wellClassName)}
        >
          {well}
        </span>
      </span>
      <span className={cn(attachmentFooterClass, "h-8")}>{footer}</span>
    </span>
  )
}

// Uploading: a tile whose page fills from the bottom as the file goes up,
// the arrow rising out of it; the row shows the filename and how far.
export function AttachmentUploading({
  label,
  progress,
  filename = ""
}: Readonly<{
  label: string
  // 0–1.
  progress: number
  filename?: string
}>) {
  const fraction = Math.min(Math.max(progress, 0), 1)
  const percent = Math.round(fraction * 100)
  return (
    <TileShape
      well={
        <span
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the page filling up is the progress bar
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="flex"
        >
          <PaperPage extension={extensionOf(filename)} fill={fraction}>
            <UploadArrow />
          </PaperPage>
        </span>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate">{filename || label}</span>
          <TextSwap
            speed="fast"
            className="pr-2.5 text-muted-foreground tabular-nums"
          >
            {`${percent}%`}
          </TextSwap>
        </>
      }
    />
  )
}

// Failed: a tile with an alert on its page and a faint danger tint in the
// well; the row shows the filename and Retry and Remove as 24px actions
// (named, with their names on hover). Both carry data-attachment-action and
// data-attachment-upload-id, which the editor's attachments plugin listens
// for.
export function AttachmentFailed({
  uploadId,
  filename = "",
  labels
}: Readonly<{
  uploadId: string | undefined
  filename?: string
  labels: Readonly<{ failed: string; retry: string; remove: string }>
}>) {
  return (
    <TileShape
      wellClassName="bg-[oklch(from_var(--state-danger)_0.5_calc(c*0.6)_h/0.07)] dark:bg-[oklch(from_var(--state-danger)_0.7_calc(c*0.6)_h/0.1)]"
      well={
        <>
          <PaperPage extension={extensionOf(filename)}>
            <AlertCircle
              strokeWidth={1.5}
              className="size-5 text-[oklch(from_var(--state-danger)_0.55_c_h)] dark:text-[oklch(from_var(--state-danger)_0.75_c_h)]"
              aria-hidden
            />
          </PaperPage>
          <span className="text-caption text-foreground">{labels.failed}</span>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate">{filename}</span>
          <button
            type="button"
            className={cn(chipIconActionClass, "my-0")}
            aria-label={labels.retry}
            title={labels.retry}
            data-attachment-action="retry"
            data-attachment-upload-id={uploadId}
          >
            <RotateCw strokeWidth={1.75} className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(chipIconActionClass, "my-0")}
            aria-label={labels.remove}
            title={labels.remove}
            data-attachment-action="remove"
            data-attachment-upload-id={uploadId}
          >
            <X strokeWidth={1.75} className="size-3.5" aria-hidden />
          </button>
        </>
      }
    />
  )
}

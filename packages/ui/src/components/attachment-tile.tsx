import {
  attachmentDownloadSrc,
  attachmentFileFormat,
  type AttachmentFileFormat
} from "@pp/shared"
import { motion } from "motion/react"
import { useEffect, useId, useState, type ReactNode } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { avatarEdgeClass } from "./avatar"
import { Archive, Download, Film, type IconType } from "./icons"
import { MorphIconLink } from "./morph-icon-link"

/*
 * AttachmentTile: a file attachment shown as a card: a preview of the file
 * (a drawing of its format, or a PDF's first pages fanned out) over a row
 * with the filename and a download link. Images and videos have their own
 * views (the editor's image, AttachmentVideo); every other file is a tile.
 */

export type AttachmentTileLabels = Readonly<{
  download: string
  // Under each format's drawing: "PDF", "ZIP archive", …
  formats: Readonly<Record<AttachmentFileFormat, string>>
}>

export const ATTACHMENT_TILE_MIN_WIDTH = 148
export const ATTACHMENT_TILE_PREVIEW_HEIGHT = 176
// The filename row: the 24px download target with 4px above and below.
export const ATTACHMENT_TILE_FOOTER_HEIGHT = 32

// Every rich attachment and its placeholders share one surface: a squircle
// card lit like the avatars and project tiles (a hairline edge and a soft
// light along the top), with no border, so a placeholder turning into its
// tile changes what's inside, not the shape.
export const attachmentSurfaceClass = cn(
  "relative rounded-[18px] surface-card corner-squircle",
  avatarEdgeClass
)

// The preview: a well 4px in from the tile's edge, its corners concentric
// with the tile's (18 − 4), tinted a step off the card so white pages and
// the format drawings sit in it rather than on it. 4px + 172px keeps the
// preview's 176px.
export const attachmentWellClass =
  "flex h-[172px] w-full min-w-[140px] items-center justify-center overflow-hidden rounded-[14px] bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] corner-squircle"

// The filename row under the preview: text 14px in, actions on the right.
export const attachmentFooterClass =
  "flex w-full items-center gap-2 py-1 pr-1 pl-3.5 text-caption"

// A file that has no preview of its own is drawn as a page: the card's
// paper with a folded corner, a hairline edge and a soft drop (an SVG, so
// the fold doesn't clip the edge and shadow away), its extension on a badge
// at the foot, and, for archives and video, a glyph on the page.
const PAGE =
  "M7 .5h40.5l16 16V73a6.5 6.5 0 0 1-6.5 6.5H7A6.5 6.5 0 0 1 .5 73V7A6.5 6.5 0 0 1 7 .5Z"
const FOLD = "M47.5.5v11a5 5 0 0 0 5 5h11Z"

const GLYPHS: Partial<Record<AttachmentFileFormat, IconType>> = {
  zip: Archive,
  tar: Archive,
  gzip: Archive,
  video: Film
}

// The extension as written ("pdf" → "PDF"), at most four letters.
export const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf(".")
  return dot <= 0 ? "" : filename.slice(dot + 1, dot + 5).toUpperCase()
}

// The drawn page: paper, fold, an optional glyph and extension badge.
export function PaperPage({
  glyph: Glyph,
  extension = "",
  dim = false,
  fill,
  children
}: Readonly<{
  glyph?: IconType
  extension?: string
  // Unavailable: the page faded back.
  dim?: boolean
  // Uploading: how much of the page has filled, from the bottom (0–1).
  fill?: number
  // A glyph of its own in the glyph's place (the upload arrow, an alert).
  children?: ReactNode
}>) {
  const clip = `pp-page-${useId().replace(/:/g, "")}`
  const level = 80 * (1 - Math.min(Math.max(fill ?? 0, 0), 1))
  return (
    <span aria-hidden className={cn("relative h-20 w-16", dim && "opacity-55")}>
      <svg
        viewBox="0 0 64 80"
        className="absolute inset-0 size-full overflow-visible [filter:drop-shadow(0_1px_1.5px_rgb(0_0_0/0.1))_drop-shadow(0_3px_6px_rgb(0_0_0/0.06))] dark:[filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
      >
        <path
          d={PAGE}
          className="fill-white stroke-[oklch(0_0_0/0.12)] dark:fill-[oklch(0.31_0_0)] dark:stroke-[oklch(1_0_0/0.1)]"
        />
        <path
          d={FOLD}
          className="fill-[oklch(0.94_0_0)] stroke-[oklch(0_0_0/0.12)] dark:fill-[oklch(0.38_0_0)] dark:stroke-[oklch(1_0_0/0.12)]"
          strokeLinejoin="round"
        />
        {fill === undefined ? null : (
          <>
            <defs>
              <clipPath id={clip}>
                <path d={PAGE} />
              </clipPath>
            </defs>
            <rect
              clipPath={`url(#${clip})`}
              x="0"
              width="64"
              height="80"
              className="fill-[oklch(0_0_0/0.06)] transition-[y] duration-300 ease-standard dark:fill-[oklch(1_0_0/0.08)]"
              style={{ y: level }}
            />
          </>
        )}
      </svg>
      {children === undefined ? null : (
        <span className="absolute top-[24px] left-1/2 flex -translate-x-1/2">
          {children}
        </span>
      )}
      {Glyph === undefined ? null : (
        <Glyph className="absolute top-[26px] left-1/2 size-5 -translate-x-1/2 text-muted-foreground" />
      )}
      {extension === "" ? null : (
        <span className="absolute bottom-2 left-2 rounded-[5px] bg-[oklch(0_0_0/0.06)] px-1 text-micro leading-4 font-semibold text-foreground tabular-nums [corner-shape:var(--button-corner)] dark:bg-[oklch(1_0_0/0.1)]">
          {extension}
        </span>
      )}
    </span>
  )
}

function FormatPreview({
  format,
  filename,
  label
}: Readonly<{
  format: AttachmentFileFormat
  filename: string
  // The format's name, for assistive tech ("Zip archive").
  label: string
}>) {
  return (
    <span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a drawn page (an SVG and a label), named as one image
      role="img"
      aria-label={label}
      className={attachmentWellClass}
    >
      <PaperPage glyph={GLYPHS[format]} extension={extensionOf(filename)} />
    </span>
  )
}

const SPREAD_LAYOUT = [
  { slot: "back", offset: -10, rotate: -6 },
  { slot: "middle", offset: 6, rotate: 4 },
  { slot: "front", offset: 0, rotate: 0 }
] as const

type SpreadState = ReadonlyArray<string> | "loading" | "failed"

// The first pages of a PDF, as images, from the app's renderer (pdf.js stays
// in the app; this package doesn't ship it).
export type RenderPdfPages = (url: string) => Promise<ReadonlyArray<string>>

function PdfSpread({
  url,
  alt,
  filename,
  label,
  renderPdf
}: Readonly<{
  url: string
  alt: string
  filename: string
  label: string
  renderPdf: RenderPdfPages
}>) {
  const [state, setState] = useState<SpreadState>("loading")

  // Keyed by url (see AttachmentTile), so a new file starts from "loading".
  useEffect(() => {
    let cancelled = false
    void renderPdf(url).then(
      (pages) => {
        if (!cancelled) setState(pages.length === 0 ? "failed" : pages)
      },
      () => {
        if (!cancelled) setState("failed")
      }
    )
    return () => {
      cancelled = true
    }
  }, [url, renderPdf])

  if (state === "failed")
    return <FormatPreview format="pdf" filename={filename} label={label} />

  if (state === "loading") {
    return (
      <span className={attachmentWellClass}>
        <span className="h-[136px] w-[96px] animate-pulse rounded-[4px] bg-muted motion-reduce:animate-none" />
      </span>
    )
  }

  const layout = SPREAD_LAYOUT.slice(SPREAD_LAYOUT.length - state.length)

  return (
    <span className={cn(attachmentWellClass, "relative")}>
      {state.map((page, index) => {
        const { slot, offset, rotate } = layout[index]
        return (
          <span
            key={slot}
            // Paper: a hairline and a soft drop instead of a border.
            className="absolute top-1/2 left-1/2 max-h-[136px] w-[94px] overflow-hidden rounded-[3px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.14),0_1px_2px_rgb(0_0_0/0.1)]"
            style={{
              transform: `translate(-50%, -50%) translateX(${offset}px) rotate(${rotate}deg)`,
              zIndex: state.length - index
            }}
          >
            <img
              src={page}
              alt={index === 0 ? alt : ""}
              aria-hidden={index === 0 ? undefined : "true"}
              className="block h-auto w-full"
            />
          </span>
        )
      })}
    </span>
  )
}

export function AttachmentTile({
  url,
  alt,
  filename,
  morphId,
  labels,
  renderPdf
}: Readonly<{
  url: string
  alt: string
  filename: string
  // Pairs the filename and download with the chip's, for the morph.
  morphId: string
  labels: AttachmentTileLabels
  // Without it, a PDF shows its format drawing like any other file.
  renderPdf?: RenderPdfPages
}>) {
  const format = attachmentFileFormat(filename)
  return (
    <span className={cn(attachmentSurfaceClass, "block w-fit max-w-full")}>
      <span className="block px-1 pt-1">
        {format === "pdf" && renderPdf ? (
          <PdfSpread
            key={url}
            url={url}
            alt={alt}
            filename={filename}
            label={labels.formats.pdf}
            renderPdf={renderPdf}
          />
        ) : (
          <FormatPreview
            format={format}
            filename={filename}
            label={labels.formats[format]}
          />
        )}
      </span>
      <span className={attachmentFooterClass}>
        <motion.span
          layoutId={`${morphId}-filename`}
          layout="position"
          transition={transitions.morph}
          className="min-w-0 flex-1 truncate"
          title={filename}
        >
          {filename}
        </motion.span>
        <MorphIconLink
          layoutId={`${morphId}-download`}
          href={attachmentDownloadSrc(url)}
          download={filename}
          label={labels.download}
          icon={Download}
          className="my-0"
        />
      </span>
    </span>
  )
}

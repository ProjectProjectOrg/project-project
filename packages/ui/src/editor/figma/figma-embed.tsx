import { figmaEmbedUrl, type FigmaRef } from "@pp/shared"

import {
  attachmentFooterClass,
  attachmentSurfaceClass
} from "../../components/attachment-tile"
import { ExternalLink } from "../../components/icons"
import { chipIconActionClass } from "../../components/morph-icon-link"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import type { TicketTarget } from "../services"
import { FigmaChip, FigmaGlyph, figmaDisplayName } from "./figma-chip"
import { useFigmaMetadata } from "./figma-metadata"

export function FigmaEmbed({
  request,
  ...props
}: FigmaEmbedProps & { request: TicketTarget | null }) {
  return request === null ? (
    <FigmaEmbedContent {...props} metadata={null} request={null} />
  ) : (
    <ResolvedFigmaEmbed {...props} request={request} />
  )
}

type FigmaEmbedProps = Readonly<{
  reference: FigmaRef | null
  url: string
  label: string
  morphId: string
}>

function ResolvedFigmaEmbed({
  request,
  ...props
}: FigmaEmbedProps & { request: TicketTarget }) {
  const metadata = useFigmaMetadata(props.reference, request)
  return <FigmaEmbedContent {...props} metadata={metadata} request={request} />
}

function FigmaEmbedContent({
  reference,
  url,
  label,
  morphId,
  metadata,
  request
}: FigmaEmbedProps & {
  metadata: ReturnType<typeof useFigmaMetadata>
  request: TicketTarget | null
}) {
  if (reference === null) {
    return (
      <FigmaChip
        request={request}
        reference={null}
        label={label}
        morphId={morphId}
      />
    )
  }

  const name = figmaDisplayName({
    resolved: metadata?.name ?? null,
    label,
    slug: reference.slug
  })
  const resolvedName = name.length > 0 ? name : m.figma_chip_loading()

  // The attachments' surface (an 18px lit squircle): the live frame in a
  // well 4px in, the name and an open link in the row under it, like a
  // file's tile.
  return (
    <span
      className={cn(
        attachmentSurfaceClass,
        "block w-[38rem] max-w-full group-data-[figma-selected]/hitbox:outline-1 group-data-[figma-selected]/hitbox:-outline-offset-1 group-data-[figma-selected]/hitbox:outline-ring"
      )}
    >
      <span className="block px-1 pt-1">
        <span className="relative block aspect-video w-full overflow-hidden rounded-[14px] bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] corner-squircle">
          <iframe
            src={figmaEmbedUrl(reference, url)}
            title={resolvedName}
            loading="lazy"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
            className="absolute inset-0 block size-full border-0"
          />
        </span>
      </span>
      <span
        className={attachmentFooterClass}
        title={metadata?.fileName ?? resolvedName}
      >
        <span className="flex shrink-0 items-center">
          <FigmaGlyph className="h-3.5" />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            name.length === 0 && "text-muted-foreground"
          )}
        >
          {resolvedName}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          data-figma-action="open"
          data-chip-action=""
          aria-label={m.figma_embed_open_in_figma()}
          className={cn(chipIconActionClass, "my-0")}
        >
          <ExternalLink className="size-3" strokeWidth={1.75} />
        </a>
      </span>
    </span>
  )
}

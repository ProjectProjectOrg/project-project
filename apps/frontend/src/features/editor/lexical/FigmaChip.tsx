import type { FigmaRef } from "@pp/shared"
import { ExternalLink } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"

import { Chip } from "@/components/ui/chip"
import { MorphIconLink } from "@/components/ui/morph-icon-link"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import type { FigmaTicketLinksRequest } from "@/features/figma/atoms/figma"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useFigmaMetadata } from "./figmaMetadata"

const HOVER_DELAY_MS = 450

export function FigmaGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38 57"
      aria-hidden="true"
      focusable="false"
      className={cn("w-auto shrink-0", className)}
    >
      <path
        fill="#1abcfe"
        d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"
      />
      <path
        fill="#0acf83"
        d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"
      />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path
        fill="#f24e1e"
        d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"
      />
      <path
        fill="#a259ff"
        d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"
      />
    </svg>
  )
}

export const figmaSlugLabel = (slug: string): string =>
  slug.replace(/[-_]+/g, " ").trim()

export const figmaDisplayName = (input: {
  readonly resolved: string | null
  readonly label: string
  readonly slug: string
}): string => {
  const resolved = input.resolved?.trim() ?? ""
  if (resolved.length > 0) return resolved
  const label = input.label.trim()
  if (label.length > 0) return label
  return figmaSlugLabel(input.slug)
}

export function FigmaChip({
  request,
  ...props
}: FigmaChipProps & { request: FigmaTicketLinksRequest | null }) {
  return request === null ? (
    <FigmaChipContent {...props} metadata={null} />
  ) : (
    <ResolvedFigmaChip {...props} request={request} />
  )
}

type FigmaChipProps = Readonly<{
  reference: FigmaRef | null
  url?: string
  label: string
  morphId: string
}>

function ResolvedFigmaChip({
  request,
  ...props
}: FigmaChipProps & { request: FigmaTicketLinksRequest }) {
  const metadata = useFigmaMetadata(props.reference, request)
  return <FigmaChipContent {...props} metadata={metadata} />
}

function FigmaChipContent({
  reference,
  url,
  label,
  morphId,
  metadata
}: FigmaChipProps & {
  metadata: ReturnType<typeof useFigmaMetadata>
}) {
  const [broken, setBroken] = useState(false)

  if (reference === null) {
    return (
      <Chip className="border-dashed text-muted-foreground hover:bg-transparent">
        <FigmaGlyph className="h-3 opacity-50" />
        {m.figma_chip_unavailable()}
      </Chip>
    )
  }

  const name = figmaDisplayName({
    resolved: metadata?.name ?? null,
    label,
    slug: reference.slug
  })
  const resolvedName = name.length > 0 ? name : m.figma_chip_loading()
  const thumbnailUrl = metadata?.thumbnailUrl ?? null
  const showThumbnail = thumbnailUrl !== null && !broken

  const body = (
    <>
      <motion.span
        layout="position"
        transition={transitions.morph}
        className="flex shrink-0 items-center"
      >
        <FigmaGlyph className="h-3" />
      </motion.span>
      <motion.span
        layoutId={`${morphId}-name`}
        layout="position"
        transition={transitions.morph}
        className={cn("truncate", name.length === 0 && "text-muted-foreground")}
      >
        {resolvedName}
      </motion.span>
      {url === undefined ? null : (
        <MorphIconLink
          layoutId={`${morphId}-open`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          data-figma-action="open"
          label={m.figma_embed_open_in_figma()}
          icon={ExternalLink}
        />
      )}
    </>
  )

  if (!showThumbnail) {
    return <Chip title={metadata?.fileName ?? resolvedName}>{body}</Chip>
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={HOVER_DELAY_MS}
        render={<Chip title={metadata?.fileName ?? resolvedName} />}
        contentEditable={false}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-sm p-1.5" align="start">
        <img
          src={thumbnailUrl}
          alt={m.figma_chip_thumbnail_alt({ name: resolvedName })}
          loading="lazy"
          decoding="async"
          className="block max-h-72 max-w-full rounded-md object-contain"
          onError={() => setBroken(true)}
        />
      </PopoverContent>
    </Popover>
  )
}

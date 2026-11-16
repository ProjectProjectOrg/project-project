import { figmaSrc, figmaViewParams, parseFigmaUrl } from "@pp/shared"
import { createContext, use } from "react"

import { FigmaChip } from "./figma/figma-chip"
import { FigmaEmbed } from "./figma/figma-embed"
import type { TicketTarget } from "./services"

// Figma links in read-only Markdown, as the editor shows them: a chip, or the live embed.

// The ticket a description's Figma links belong to, for their names and
// thumbnails (without it they show the link's own text).
export const FigmaTargetContext = createContext<TicketTarget | null>(null)

// A Figma link, as the editor shows it: a chip, or the live embed.
export function MarkdownFigma({
  href,
  reference,
  label,
  morphId
}: Readonly<{
  href: string
  reference: NonNullable<ReturnType<typeof parseFigmaUrl>>
  label: string
  morphId: string
}>) {
  const request = use(FigmaTargetContext)
  const props = { request, reference, url: figmaSrc(href), label, morphId }
  // The live embed only where the ticket is known (a full view); previews
  // and hover cards show the chip.
  return request === null || figmaViewParams(href).density === "compact" ? (
    <FigmaChip {...props} />
  ) : (
    <FigmaEmbed {...props} />
  )
}

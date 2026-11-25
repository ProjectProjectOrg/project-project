import { figmaRefKey, figmaSrc, parseFigmaUrl, type FigmaRef } from "@pp/shared"
import { isPaperDesignUrl } from "@pp/ui/editor/paper/paper-url"
import * as Data from "effect/Data"

export type TicketDesignLink = Data.TaggedEnum<{
  figma: Readonly<{
    url: string
    label: string
    reference: FigmaRef
  }>
  paper: Readonly<{ url: string; label: string }>
}>
export const TicketDesignLink = Data.taggedEnum<TicketDesignLink>()

const DESIGN_LINK_RE =
  /\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>"']+)/gi

const unescapeLabel = (label: string) => label.replace(/\\(.)/g, "$1")

const trimBareUrl = (url: string) => url.replace(/[.,;:!?}\]_*~]+$/g, "")

export function extractTicketDesignLinks(markdown: string) {
  const seen = new Set<string>()
  const links: Array<TicketDesignLink> = []

  for (const match of markdown.matchAll(DESIGN_LINK_RE)) {
    const markdownUrl = match[2]
    const url = markdownUrl ?? trimBareUrl(match[3] ?? "")
    const label = markdownUrl === undefined ? "" : unescapeLabel(match[1] ?? "")
    const figmaReference = parseFigmaUrl(url)

    if (figmaReference !== null) {
      const key = `figma:${figmaRefKey(figmaReference)}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push(
        TicketDesignLink.figma({
          url: figmaSrc(url),
          label,
          reference: figmaReference
        })
      )
      continue
    }

    if (!isPaperDesignUrl(url)) continue
    const key = `paper:${url}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push(TicketDesignLink.paper({ url, label }))
  }

  return links
}

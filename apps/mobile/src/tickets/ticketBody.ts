import {
  advanceFence,
  blankBlockHeading,
  extractMentionLinks,
  parseMentionHref,
  parseTicketBlocks,
  type TicketBlockSegment
} from "@pp/shared"
import * as Arr from "effect/Array"
import * as Option from "effect/Option"

export type TicketBodyPart =
  | Readonly<{ kind: "markdown"; text: string }>
  | Readonly<{ kind: "unfilled" }>

export type TicketChip = Readonly<{
  symbol: string
  color: string | null
}>

export type DescribeTicket = (ticketId: string) => Option.Option<TicketChip>

const MENTION_LINK = /\[([^\]]*)\]\((mention:[^)\s]+)\)/g

const ticketChipLabel = (ticketId: string, chip: Option.Option<TicketChip>) =>
  Option.match(chip, {
    onNone: () => ticketId,
    onSome: ({ symbol, color }) =>
      `![](sf:${symbol}${color === null ? "" : `?color=${encodeURIComponent(color)}`})${ticketId}`
  })

export const withMentionChips = (
  markdown: string,
  describe: DescribeTicket
) => {
  const chip = (link: string, label: string, href: string) => {
    const mention = parseMentionHref(href)
    if (mention === null) return link
    return mention.type === "ticket"
      ? `[${ticketChipLabel(mention.id, describe(mention.id))}](${href})`
      : `[@${label.replace(/^@/, "")}](${href})`
  }
  let fence: string | null = null
  return markdown
    .split("\n")
    .map((line) => {
      const insideCode = fence !== null || advanceFence(line, null) !== null
      fence = advanceFence(line, fence)
      return insideCode ? line : line.replace(MENTION_LINK, chip)
    })
    .join("\n")
}

export const mentionedTicketIds = (body: string) =>
  Arr.dedupe(
    extractMentionLinks(body).flatMap(({ parsed }) =>
      parsed?.type === "ticket" ? [parsed.id] : []
    )
  )

const markdownPart = (text: string) =>
  ({ kind: "markdown", text }) as const satisfies TicketBodyPart

const unfilledPart = { kind: "unfilled" } as const satisfies TicketBodyPart

const partsOf = (segment: TicketBlockSegment) => {
  if (segment.kind === "markdown") return [markdownPart(segment.text)]
  const heading = blankBlockHeading(segment.content)
  if (heading === null) return [markdownPart(segment.content)]
  return heading === "" ? [unfilledPart] : [markdownPart(heading), unfilledPart]
}

const joinMarkdown = (
  parts: ReadonlyArray<TicketBodyPart>,
  part: TicketBodyPart
) => {
  const previous = Arr.last(parts)
  if (
    part.kind === "markdown" &&
    Option.isSome(previous) &&
    previous.value.kind === "markdown"
  ) {
    return [
      ...Arr.dropRight(parts, 1),
      markdownPart(`${previous.value.text}\n\n${part.text}`)
    ]
  }
  return [...parts, part]
}

export const ticketBodyParts = (body: string, describe: DescribeTicket) =>
  parseTicketBlocks(body)
    .flatMap(partsOf)
    .reduce<ReadonlyArray<TicketBodyPart>>(joinMarkdown, [])
    .map((part, index) => {
      const id = `${part.kind}-${index}`
      return part.kind === "markdown"
        ? { kind: part.kind, text: withMentionChips(part.text, describe), id }
        : { kind: part.kind, id }
    })

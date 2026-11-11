export const MENTION_TYPES = ["user", "ticket"] as const
export type MentionType = (typeof MENTION_TYPES)[number]

export interface MentionRef {
  readonly type: MentionType
  readonly id: string
  readonly label: string
}

export const MENTION_SCHEME = "mention:" as const

const isMentionType = (s: string): s is MentionType =>
  (MENTION_TYPES as readonly string[]).includes(s)

export function formatMentionHref(type: MentionType, id: string): string {
  return `${MENTION_SCHEME}${type}/${id}`
}

export function parseMentionHref(
  href: string
): { type: MentionType; id: string } | null {
  if (!href.startsWith(MENTION_SCHEME)) return null
  const rest = href.slice(MENTION_SCHEME.length)
  const slash = rest.indexOf("/")
  if (slash <= 0 || slash === rest.length - 1) return null
  const type = rest.slice(0, slash)
  const id = rest.slice(slash + 1)
  if (!isMentionType(type)) return null
  return { type, id }
}

export interface MentionLink {
  readonly label: string
  readonly href: string
  readonly parsed: { readonly type: MentionType; readonly id: string } | null
}

const MENTION_LINK_RE = /\[([^\]]*)\]\((mention:[^)]+)\)/g

export const stripMentionLinks = (text: string): string =>
  text.replace(MENTION_LINK_RE, "$1")

export function extractMentionLinks(body: string): ReadonlyArray<MentionLink> {
  const out: MentionLink[] = []
  for (const m of body.matchAll(MENTION_LINK_RE)) {
    const [, label, href] = m
    out.push({ label, href, parsed: parseMentionHref(href) })
  }
  return out
}

export type TicketMentionTarget = Readonly<{
  projectSlug: string | null
  ticketId: string
}>

export const parseTicketMentionId = (id: string): TicketMentionTarget => {
  const slash = id.indexOf("/")
  return slash < 0
    ? { projectSlug: null, ticketId: id }
    : { projectSlug: id.slice(0, slash), ticketId: id.slice(slash + 1) }
}

export const formatTicketMentionId = (target: TicketMentionTarget): string =>
  target.projectSlug === null
    ? target.ticketId
    : `${target.projectSlug}/${target.ticketId}`

export const rewriteTicketMentions = (
  text: string,
  rewrite: (target: TicketMentionTarget) => TicketMentionTarget | null
): string =>
  text.includes("](mention:ticket/")
    ? text.replace(MENTION_LINK_RE, (match, label: string, href: string) => {
        const parsed = parseMentionHref(href)
        if (parsed?.type !== "ticket") return match
        const current = parseTicketMentionId(parsed.id)
        const next = rewrite(current)
        if (next === null) return match
        const relabelled = label === current.ticketId ? next.ticketId : label
        return `[${relabelled}](${formatMentionHref("ticket", formatTicketMentionId(next))})`
      })
    : text

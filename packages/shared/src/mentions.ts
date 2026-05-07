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

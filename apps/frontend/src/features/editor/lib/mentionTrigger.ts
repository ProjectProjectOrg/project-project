export type MentionTriggerMatch = Readonly<{
  trigger: string
  leadOffset: number
  matchingString: string
  replaceableString: string
}>

export const MENTION_QUERY_MAX_LENGTH = 48

const isQuery = (query: string): boolean =>
  query.length <= MENTION_QUERY_MAX_LENGTH &&
  !/^\s/.test(query) &&
  !/\n|\s\s/.test(query)

export const matchMentionTrigger = (
  text: string,
  triggers: string
): MentionTriggerMatch | null => {
  const floor = Math.max(0, text.length - MENTION_QUERY_MAX_LENGTH - 1)
  for (let i = text.length - 1; i >= floor; i--) {
    const ch = text[i]
    if (ch === "\n") return null
    if (!triggers.includes(ch)) continue
    if (i > 0 && !/\s/.test(text[i - 1])) continue
    const query = text.slice(i + 1)
    return isQuery(query)
      ? {
          trigger: ch,
          leadOffset: i,
          matchingString: query,
          replaceableString: text.slice(i)
        }
      : null
  }
  return null
}

export const isProseQuery = (query: string): boolean => /\s/.test(query)

import { parseMentionHref, type ExcerptPart } from "@pp/shared"

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g

const MAX_LENGTH = 200

const toOneLine = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(
          /^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/,
          ""
        )
        .trim()
    )
    .filter((line) => line.length > 0)
    .join(" ")

const cleanInline = (text: string) =>
  text.replace(/(\*\*|__|\*|_|~~|`)/g, "").replace(/\s+/g, " ")

export const paragraphMentioning = (markdown: string, userId: string) => {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
  return (
    paragraphs.find((paragraph) =>
      paragraph.includes(`(mention:user/${userId})`)
    ) ??
    paragraphs[0] ??
    ""
  )
}

export const mentionedUserIds = (markdown: string) =>
  [...markdown.matchAll(LINK_RE)].flatMap(([, , href]) => {
    const parsed = parseMentionHref(href)
    return parsed?.type === "user" ? [parsed.id] : []
  })

const handleOf = (label: string) => label.replace(/^@/, "")

export const excerptParts = (
  markdown: string,
  handles: ReadonlyMap<string, string>
) => {
  const text = toOneLine(markdown)
  const parts: Array<ExcerptPart> = []
  let length = 0
  let last = 0
  const pushText = (raw: string) => {
    const value = cleanInline(raw)
    if (value.length === 0 || length >= MAX_LENGTH) return
    const room = MAX_LENGTH - length
    const cut =
      value.length > room ? `${value.slice(0, room).trimEnd()}…` : value
    const previous = parts.at(-1)
    if (previous?.kind === "text")
      parts[parts.length - 1] = { kind: "text", text: previous.text + cut }
    else parts.push({ kind: "text", text: cut })
    length += value.length
  }
  for (const match of text.matchAll(LINK_RE)) {
    const [whole, label, href] = match
    pushText(text.slice(last, match.index))
    last = match.index + whole.length
    const parsed = parseMentionHref(href)
    if (parsed?.type === "user") {
      if (length >= MAX_LENGTH) continue
      const handle = handles.get(parsed.id) ?? handleOf(label)
      parts.push({ kind: "mention", userId: parsed.id, handle })
      length += handle.length + 1
    } else pushText(label)
  }
  pushText(text.slice(last))
  const first = parts[0]
  if (first?.kind === "text")
    parts[0] = { ...first, text: first.text.trimStart() }
  const end = parts.at(-1)
  if (end?.kind === "text")
    parts[parts.length - 1] = { ...end, text: end.text.trimEnd() }
  return parts
}

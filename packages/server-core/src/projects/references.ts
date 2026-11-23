import {
  FixReferenceAction,
  type ReferenceKind,
  unescapeMarkdown
} from "@pp/shared"

export type ReferenceCandidate = Readonly<{
  kind: ReferenceKind
  target: string
  label: string
  snippet: string
}>

const MENTION = /\[([^\]]*)\]\(mention:(user|ticket)\/([^)\s]+)\)/g
const LINK = /\[([^\]]*)\]\(((?:\\.|[^)\s\\])+)\)/g
const SNIPPET_RADIUS = 60

const snippetAt = (body: string, index: number, length: number) => {
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(body.length, index + length + SNIPPET_RADIUS)
  return `${start > 0 ? "…" : ""}${body
    .slice(start, end)
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()}${end < body.length ? "…" : ""}`
}

export const referenceOrigin = (url: string | null) => {
  if (url === null) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const referenceCandidates = (body: string, oldOrigin: string | null) => [
  ...[...body.matchAll(MENTION)].map((match) => ({
    kind: match[2] === "user" ? ("user" as const) : ("ticket" as const),
    target: match[3],
    label: match[1],
    snippet: snippetAt(body, match.index, match[0].length)
  })),
  ...(oldOrigin === null
    ? []
    : [...body.matchAll(LINK)].flatMap((match) =>
        referenceOrigin(unescapeMarkdown(match[2])) === oldOrigin
          ? [
              {
                kind: "link" as const,
                target: unescapeMarkdown(match[2]),
                label: match[1],
                snippet: snippetAt(body, match.index, match[0].length)
              }
            ]
          : []
      ))
]

const hrefOf = (kind: ReferenceKind, target: string) =>
  kind === "link" ? target : `mention:${kind}/${target}`

const linkedHref = (kind: ReferenceKind, to: string) =>
  kind === "user" ? `mention:user/${to}` : `mention:ticket/${to}`

export const applyReferenceFix = (
  body: string,
  reference: Readonly<{ kind: ReferenceKind; target: string }>,
  action: FixReferenceAction
) => {
  const href = hrefOf(reference.kind, reference.target)
  return body.replace(LINK, (whole, label: string, destination: string) =>
    unescapeMarkdown(destination) === href
      ? FixReferenceAction.match(action, {
          plain: () => label,
          link: ({ to }) => `[${label}](${linkedHref(reference.kind, to)})`
        })
      : whole
  )
}

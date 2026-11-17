import type { FixReferenceAction, ReferenceKind } from "@pp/shared"

export type ReferenceCandidate = Readonly<{
  kind: ReferenceKind
  target: string
  label: string
  snippet: string
}>

const MENTION = /\[([^\]]*)\]\(mention:(user|ticket)\/([^)\s]+)\)/g
const LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g
const SNIPPET_RADIUS = 60

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const snippetAt = (body: string, index: number, length: number) => {
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(body.length, index + length + SNIPPET_RADIUS)
  return `${start > 0 ? "…" : ""}${body
    .slice(start, end)
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()}${end < body.length ? "…" : ""}`
}

const originOf = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const referenceCandidates = (
  body: string,
  oldOrigin: string | null
): ReadonlyArray<ReferenceCandidate> => [
  ...[...body.matchAll(MENTION)].map((match) => ({
    kind: match[2] === "user" ? ("user" as const) : ("ticket" as const),
    target: match[3],
    label: match[1],
    snippet: snippetAt(body, match.index, match[0].length)
  })),
  ...(oldOrigin === null
    ? []
    : [...body.matchAll(LINK)].flatMap((match) =>
        originOf(match[2]) === oldOrigin
          ? [
              {
                kind: "link" as const,
                target: match[2],
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
): string => {
  const pattern = new RegExp(
    `\\[([^\\]]*)\\]\\(${escapeRegExp(hrefOf(reference.kind, reference.target))}\\)`,
    "g"
  )
  return body.replace(pattern, (_whole, label: string) =>
    action.kind === "plain"
      ? label
      : `[${label}](${linkedHref(reference.kind, action.to)})`
  )
}

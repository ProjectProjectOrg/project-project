import {
  type FeedbackAttachmentFile,
  type FeedbackReport,
  formatAttachmentMarkdown,
  stripMentionLinks,
  type TicketType
} from "@pp/shared"

export type StoredFeedbackAttachment = Readonly<{
  filename: string
  url: string
  image: boolean
}>

export type FeedbackTicketAttachments = Readonly<{
  stored: ReadonlyArray<StoredFeedbackAttachment>
  notStored: ReadonlyArray<FeedbackAttachmentFile>
}>

const NO_ATTACHMENTS: FeedbackTicketAttachments = { stored: [], notStored: [] }

export const singleLineFilename = (name: string): string =>
  name
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 255) || "file"

export const feedbackTicketType = (report: FeedbackReport): TicketType =>
  report.kind === "bug" ? "bug" : "feat"

const longestBacktickRun = (text: string) =>
  Math.max(0, ...Array.from(text.matchAll(/`+/gu), ([run]) => run.length))

export const fenced = (text: string): string => {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1))
  return `${fence}text\n${text}\n${fence}`
}

export const inlineCode = (raw: string): string => {
  const text = stripMentionLinks(raw)
  const ticks = "`".repeat(longestBacktickRun(text) + 1)
  const padded = text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text
  return `${ticks}${padded}${ticks}`
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const detailLines = (
  report: FeedbackReport,
  notStored: ReadonlyArray<FeedbackAttachmentFile>
): ReadonlyArray<string> => [
  `- **Reported by:** ${inlineCode(report.reporter.name)} ${inlineCode(report.reporter.email)}`,
  `- **Instance:** ${inlineCode(report.instance.url)}${report.instance.version === null ? "" : ` ${inlineCode(report.instance.version)}`}`,
  `- **Page:** ${inlineCode(report.context.route)}`,
  ...(report.context.userAgent === null
    ? []
    : [`- **Browser:** ${inlineCode(report.context.userAgent)}`]),
  `- **Submitted:** ${report.submittedAt.toISOString()}`,
  ...(notStored.length === 0
    ? []
    : [
        `- **Files that couldn't be stored:** ${notStored
          .map(
            (file) =>
              `${inlineCode(file.filename)} (${formatBytes(file.byteSize)})`
          )
          .join(", ")}`
      ])
]

const attachmentLines = (
  stored: ReadonlyArray<StoredFeedbackAttachment>
): ReadonlyArray<string> =>
  stored.length === 0
    ? []
    : [
        "## Attachments",
        "",
        ...stored.flatMap((file) => [
          formatAttachmentMarkdown({
            kind: file.image ? "image" : "file",
            alt: stripMentionLinks(file.filename),
            url: file.url
          }),
          ""
        ])
      ]

export const feedbackTicketBody = (
  report: FeedbackReport,
  options: Readonly<{
    verbatim: boolean
    attachments?: FeedbackTicketAttachments
  }>
): string => {
  const { stored, notStored } = options.attachments ?? NO_ATTACHMENTS
  const description = stripMentionLinks(report.description).trim()
  const shown =
    description === ""
      ? []
      : [options.verbatim ? fenced(description) : description, ""]
  return [
    ...shown,
    ...attachmentLines(stored),
    "## Report details",
    "",
    ...detailLines(report, notStored),
    ""
  ].join("\n")
}

export const unstoredFiles = (
  manifest: ReadonlyArray<FeedbackAttachmentFile>,
  storedNames: ReadonlyArray<string>
): ReadonlyArray<FeedbackAttachmentFile> => {
  const remaining = [...storedNames]
  return manifest.filter((file) => {
    const index = remaining.indexOf(file.filename)
    if (index === -1) return true
    remaining.splice(index, 1)
    return false
  })
}

export const clientIp = (
  forwardedFor: string | undefined,
  remoteAddress: string | undefined,
  trustedProxyHops: number
): string | undefined => {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
  if (trustedProxyHops <= 0 || hops.length === 0) return remoteAddress
  return hops[Math.max(0, hops.length - trustedProxyHops)]
}

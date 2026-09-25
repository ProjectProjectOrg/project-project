import { Option, Schema } from "effect"

export type AdfConversionWarning = Readonly<{
  path: ReadonlyArray<string | number>
  nodeType: string
  reason: string
}>

export type AdfReference = Readonly<{
  kind: "jira-issue" | "jira-attachment" | "jira-user"
  sourceId: string
  placeholder: string
  originalUrl: string | null
  fallbackText: string
}>

export type AdfConversionResult = Readonly<{
  markdown: string
  warnings: ReadonlyArray<AdfConversionWarning>
  references: ReadonlyArray<AdfReference>
}>

export type AdfReferenceDestination = Readonly<{
  url: string
  text?: string
  embed?: boolean
}>

type AdfNode = Readonly<{
  type: string
  text?: string | undefined
  attrs?: Readonly<Record<string, unknown>> | undefined
  marks?: ReadonlyArray<AdfMark> | undefined
  content?: ReadonlyArray<AdfNode> | undefined
}>

type AdfMark = Readonly<{
  type: string
  attrs?: Readonly<Record<string, unknown>> | undefined
}>

const AdfMarkSchema: Schema.Codec<AdfMark> = Schema.Struct({
  type: Schema.String,
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

const AdfNodeSchema: Schema.Codec<AdfNode> = Schema.Struct({
  type: Schema.String,
  text: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  marks: Schema.optional(Schema.Array(AdfMarkSchema)),
  content: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<AdfNode> => AdfNodeSchema))
  )
})

const decodeAdfNode = Schema.decodeUnknownOption(AdfNodeSchema)

type ConversionState = Readonly<{
  warnings: Array<AdfConversionWarning>
  references: Array<AdfReference>
}>

export function convertAdfToMarkdown(input: unknown): AdfConversionResult {
  const decoded = decodeAdfNode(input)
  if (Option.isNone(decoded) || decoded.value.type !== "doc") {
    return {
      markdown: "",
      warnings: [{ path: [], nodeType: "doc", reason: "invalid-document" }],
      references: []
    }
  }

  const state: ConversionState = { warnings: [], references: [] }
  return {
    markdown: renderBlocks(decoded.value.content ?? [], state, ["content"]),
    warnings: state.warnings,
    references: state.references
  }
}

export function rewriteJiraReferences(
  result: AdfConversionResult,
  destinations: ReadonlyMap<string, AdfReferenceDestination>
): string {
  return result.references.reduce((markdown, reference) => {
    const destination = destinations.get(reference.placeholder)
    const marks = referenceMarks(reference.placeholder)
    const replacement = destination
      ? markdownLinkWithMarks(
          destination.text ?? reference.fallbackText,
          destination.url,
          marks,
          destination.embed === true
        )
      : reference.originalUrl
        ? markdownLinkWithMarks(
            reference.fallbackText,
            reference.originalUrl,
            marks
          )
        : renderMarkedText(reference.fallbackText, marks)
    return markdown.split(reference.placeholder).join(replacement)
  }, result.markdown)
}

function renderBlocks(
  nodes: ReadonlyArray<AdfNode>,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  return nodes
    .map((node, index) => renderBlock(node, state, [...path, index]))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function renderBlock(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  switch (node.type) {
    case "paragraph":
      return renderInlineChildren(node, state, path)
    case "heading": {
      const level = numberAttribute(node, "level") ?? 1
      return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${renderInlineChildren(node, state, path)}`
    }
    case "bulletList":
      return renderList(node, state, path, "bullet", 0)
    case "orderedList":
      return renderList(node, state, path, "ordered", 0)
    case "taskList":
      return renderTaskList(node, state, path, 0)
    case "table":
      return renderTable(node, state, path)
    case "mediaSingle":
    case "mediaGroup":
      return renderMediaContainer(node, state, path)
    case "media":
      return renderMedia(node, state, path)
    case "rule":
      return "---"
    case "codeBlock":
      return renderCodeBlock(node, state, path)
    default: {
      warnUnsupported(state, path, node.type)
      return node.content
        ? renderBlocks(node.content, state, [...path, "content"])
        : escapeText(safeReadableFallback(node, state, path))
    }
  }
}

function renderInlineChildren(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  return (node.content ?? [])
    .map((child, index) =>
      renderInline(child, state, [...path, "content", index])
    )
    .join("")
}

function renderInline(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  if (node.type === "hardBreak") return "  \n"
  if (node.type === "inlineCard") {
    const url = stringAttribute(node, "url")
    const sourceId = url === null ? null : jiraIssueId(url)
    return sourceId === null || url === null
      ? (url ?? "")
      : addReference(state, {
          kind: "jira-issue",
          sourceId,
          originalUrl: url,
          fallbackText: sourceId
        })
  }
  if (node.type === "media") {
    return renderMedia(node, state, path)
  }
  if (node.type === "mention") {
    const sourceId =
      stringAttribute(node, "id") ?? stringAttribute(node, "accountId")
    if (sourceId === null) return safeReadableFallback(node, state, path)
    const fallbackText = safeSourceText(
      stringAttribute(node, "text") ??
        stringAttribute(node, "displayName") ??
        `@${sourceId}`,
      state,
      path
    )
    return addReference(state, {
      kind: "jira-user",
      sourceId,
      originalUrl: null,
      fallbackText
    })
  }
  if (node.type !== "text") {
    warnUnsupported(state, path, node.type)
    return node.content
      ? renderInlineChildren(node, state, path)
      : escapeText(safeReadableFallback(node, state, path))
  }

  const safeText = safeSourceText(node.text ?? "", state, path)
  const jiraLink = jiraLinkReference(node.marks ?? [])
  if (jiraLink !== null) {
    return addReference(
      state,
      {
        kind: "jira-issue",
        sourceId: jiraLink.sourceId,
        originalUrl: jiraLink.url,
        fallbackText: safeText
      },
      supportedTextMarks(node.marks ?? [])
    )
  }

  const rendered = renderMarkedText(
    safeText,
    supportedTextMarks(node.marks ?? [])
  )
  const link = (node.marks ?? []).find((mark) => mark.type === "link")
  const href = link ? stringAttribute(link, "href") : null
  return href === null ? rendered : `[${rendered}](${escapeUrl(href)})`
}

function renderMediaContainer(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  return (node.content ?? [])
    .map((child, index) =>
      child.type === "media"
        ? renderMedia(child, state, [...path, "content", index])
        : renderBlock(child, state, [...path, "content", index])
    )
    .filter(Boolean)
    .join("\n")
}

function renderMedia(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  const sourceId = stringAttribute(node, "id")
  if (sourceId === null) return safeReadableFallback(node, state, path)
  const fallbackText = safeSourceText(
    stringAttribute(node, "alt") ??
      stringAttribute(node, "filename") ??
      sourceId,
    state,
    path
  )
  return addReference(state, {
    kind: "jira-attachment",
    sourceId,
    originalUrl: stringAttribute(node, "url"),
    fallbackText
  })
}

function renderList(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>,
  kind: "bullet" | "ordered",
  indentation: number
): string {
  const start = numberAttribute(node, "order") ?? 1
  return (node.content ?? [])
    .map((item, index) => {
      const itemPath = [...path, "content", index]
      const children = item.content ?? []
      const first = children[0]
      const label = first
        ? first.type === "paragraph"
          ? renderInlineChildren(first, state, [...itemPath, "content", 0])
          : renderInline(first, state, [...itemPath, "content", 0])
        : ""
      const prefix = kind === "bullet" ? "-" : `${start + index}.`
      const lines = [`${" ".repeat(indentation)}${prefix} ${label}`]

      children.slice(1).forEach((child, childIndex) => {
        const childPath = [...itemPath, "content", childIndex + 1]
        if (child.type === "bulletList") {
          lines.push(
            renderList(child, state, childPath, "bullet", indentation + 2)
          )
        } else if (child.type === "orderedList") {
          lines.push(
            renderList(child, state, childPath, "ordered", indentation + 2)
          )
        } else if (child.type === "taskList") {
          lines.push(renderTaskList(child, state, childPath, indentation + 2))
        } else {
          lines.push(
            indent(renderBlock(child, state, childPath), indentation + 2)
          )
        }
      })

      return lines.filter(Boolean).join("\n")
    })
    .join("\n")
}

function renderTaskList(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>,
  indentation: number
): string {
  return (node.content ?? [])
    .map((item, index) => {
      const itemPath = [...path, "content", index]
      const checked = stringAttribute(item, "state")?.toUpperCase() === "DONE"
      const label = (item.content ?? [])
        .map((child, childIndex) =>
          child.type === "paragraph"
            ? renderInlineChildren(child, state, [
                ...itemPath,
                "content",
                childIndex
              ])
            : renderInline(child, state, [...itemPath, "content", childIndex])
        )
        .join("")
      return `${" ".repeat(indentation)}- [${checked ? "x" : " "}] ${label}`
    })
    .join("\n")
}

function renderTable(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  const rows = (node.content ?? []).map((row, rowIndex) =>
    (row.content ?? []).map((cell, cellIndex) =>
      renderBlocks(cell.content ?? [], state, [
        ...path,
        "content",
        rowIndex,
        "content",
        cellIndex,
        "content"
      ])
        .replace(/\n/g, "<br>")
        .replace(/\|/g, "\\|")
    )
  )
  if (rows.length === 0) return ""
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) =>
    row.concat(Array.from({ length: width - row.length }, () => ""))
  )
  const header = normalized[0]
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)
  ].join("\n")
}

function renderCodeBlock(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  const text = (node.content ?? [])
    .map((child, index) =>
      safeSourceText(child.text ?? "", state, [...path, "content", index])
    )
    .join("")
  const language = stringAttribute(node, "language") ?? ""
  const fence = "`".repeat(Math.max(3, longestRun(text, "`") + 1))
  return `${fence}${language}\n${text.replace(/\n$/, "")}\n${fence}`
}

function inlineCode(text: string): string {
  const fence = "`".repeat(Math.max(1, longestRun(text, "`") + 1))
  const content = /^[` ]|[` ]$/.test(text) ? ` ${text} ` : text
  return `${fence}${content}${fence}`
}

function longestRun(value: string, character: string): number {
  let longest = 0
  let current = 0
  for (const currentCharacter of value) {
    current = currentCharacter === character ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

function stringAttribute(
  value: Readonly<{ attrs?: Readonly<Record<string, unknown>> | undefined }>,
  key: string
): string | null {
  const attribute = value.attrs?.[key]
  return typeof attribute === "string" ? attribute : null
}

function numberAttribute(node: AdfNode, key: string): number | null {
  const attribute = node.attrs?.[key]
  return typeof attribute === "number" && Number.isFinite(attribute)
    ? attribute
    : null
}

function escapeText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("~", "\\~")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
}

function escapeUrl(url: string): string {
  return url.replace(/([\\()\s])/g, (character) =>
    character === " " ? "%20" : `\\${character}`
  )
}

function markdownLinkWithMarks(
  text: string,
  url: string,
  marks: ReadonlyArray<TextMark>,
  embed = false
): string {
  return `${embed ? "!" : ""}[${renderMarkedText(text, marks)}](${escapeUrl(url)})`
}

function jiraIssueId(url: string): string | null {
  const match = /\/browse\/([^/?#]+)/i.exec(url)
  return match?.[1] ?? null
}

function jiraLinkReference(
  marks: ReadonlyArray<AdfMark>
): Readonly<{ url: string; sourceId: string }> | null {
  for (const mark of marks) {
    if (mark.type !== "link") continue
    const url = stringAttribute(mark, "href")
    if (url === null) continue
    const sourceId = jiraIssueId(url)
    if (sourceId !== null) return { url, sourceId }
  }
  return null
}

function addReference(
  state: ConversionState,
  reference: Omit<AdfReference, "placeholder">,
  marks: ReadonlyArray<TextMark> = []
): string {
  const markSuffix = marks.length === 0 ? "" : `:${marks.join(",")}`
  const placeholder = `\uE000jira-reference:${state.references.length.toString().padStart(6, "0")}${markSuffix}\uE001`
  state.references.push({ ...reference, placeholder })
  return placeholder
}

function safeReadableFallback(
  node: AdfNode,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  const fallback =
    node.text ??
    stringAttribute(node, "text") ??
    stringAttribute(node, "alt") ??
    stringAttribute(node, "label") ??
    stringAttribute(node, "shortName") ??
    stringAttribute(node, "displayName") ??
    stringAttribute(node, "name") ??
    stringAttribute(node, "title") ??
    stringAttribute(node, "url") ??
    ""
  return safeSourceText(fallback, state, path)
}

function warnUnsupported(
  state: ConversionState,
  path: ReadonlyArray<string | number>,
  nodeType: string
): void {
  state.warnings.push({ path, nodeType, reason: "unsupported-node" })
}

function safeSourceText(
  text: string,
  state: ConversionState,
  path: ReadonlyArray<string | number>
): string {
  const reservedMarker =
    /<!--\s*(?:comments:(?:start|end)|comment:[A-Za-z0-9_-]+)\s*-->/g
  return text.replace(reservedMarker, (marker) => {
    state.warnings.push({
      path,
      nodeType: "text",
      reason: "reserved-marker-neutralized"
    })
    return `&lt;${marker.slice(1)}`
  })
}

type TextMark = "strong" | "em" | "strike" | "code"

function supportedTextMarks(marks: ReadonlyArray<AdfMark>): Array<TextMark> {
  return marks.flatMap((mark) =>
    mark.type === "strong" ||
    mark.type === "em" ||
    mark.type === "strike" ||
    mark.type === "code"
      ? [mark.type]
      : []
  )
}

function referenceMarks(placeholder: string): Array<TextMark> {
  const encoded = /\uE000jira-reference:\d{6}(?::([^\uE001]+))?\uE001/.exec(
    placeholder
  )?.[1]
  if (!encoded) return []
  return encoded
    .split(",")
    .flatMap((mark) =>
      mark === "strong" || mark === "em" || mark === "strike" || mark === "code"
        ? [mark]
        : []
    )
}

function renderMarkedText(
  text: string,
  marks: ReadonlyArray<TextMark>
): string {
  let rendered = marks.includes("code") ? inlineCode(text) : escapeText(text)
  for (const mark of marks) {
    if (mark === "strong") rendered = `**${rendered}**`
    if (mark === "em") rendered = `*${rendered}*`
    if (mark === "strike") rendered = `~~${rendered}~~`
  }
  return rendered
}

function indent(value: string, amount: number): string {
  const prefix = " ".repeat(amount)
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n")
}

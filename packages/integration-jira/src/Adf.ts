import { DateTime, Option, Schema } from "effect"

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
  attrs?: Readonly<Record<string, Schema.Json>> | undefined
  marks?: ReadonlyArray<AdfMark> | undefined
  content?: ReadonlyArray<AdfNode> | undefined
}>

type AdfMark = Readonly<{
  type: string
  attrs?: Readonly<Record<string, Schema.Json>> | undefined
}>

const AdfMarkSchema: Schema.Codec<AdfMark> = Schema.Struct({
  type: Schema.String,
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Json))
})

const AdfNodeSchema: Schema.Codec<AdfNode> = Schema.Struct({
  type: Schema.String,
  text: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  marks: Schema.optional(Schema.Array(AdfMarkSchema)),
  content: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<AdfNode> => AdfNodeSchema))
  )
})

const decodeAdfNode = Schema.decodeUnknownOption(AdfNodeSchema)

type Path = ReadonlyArray<string | number>

type ConversionState = Readonly<{
  warnings: Array<AdfConversionWarning>
  warned: Set<string>
  references: Array<AdfReference>
}>

const INLINE_NODES = new Set([
  "text",
  "hardBreak",
  "mention",
  "emoji",
  "inlineCard",
  "date",
  "status",
  "mediaInline",
  "placeholder",
  "inlineExtension"
])

const DROPPED_MARKS = new Set([
  "underline",
  "textColor",
  "backgroundColor",
  "subsup"
])

const PANEL_LABELS: Readonly<Record<string, string>> = {
  info: "Info",
  note: "Note",
  tip: "Tip",
  success: "Success",
  warning: "Warning",
  error: "Error"
}

const JIRA_KEY_IN_TEXT =
  /(?<![\p{L}\p{N}_/-])([A-Z][A-Z0-9_]{1,9}-[1-9][0-9]*)(?![\p{L}\p{N}_])/gu

export function convertAdfToMarkdown(input: Schema.Json): AdfConversionResult {
  const decoded = decodeAdfNode(input)
  if (Option.isNone(decoded) || decoded.value.type !== "doc") {
    return {
      markdown: "",
      warnings: [{ path: [], nodeType: "doc", reason: "invalid-document" }],
      references: []
    }
  }

  const state: ConversionState = {
    warnings: [],
    warned: new Set(),
    references: []
  }
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

export function escapeMarkdownText(text: string): string {
  return escapeLineStarts(escapeText(text))
}

function renderBlocks(
  nodes: ReadonlyArray<AdfNode>,
  state: ConversionState,
  path: Path
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
  path: Path
): string {
  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, state, path)
    case "heading": {
      const level = numberAttribute(node, "level") ?? 1
      return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${renderInlineChildren(node, state, path).replaceAll("  \n", " ")}`
    }
    case "bulletList":
      return renderList(node, state, path, "bullet", 0)
    case "orderedList":
      return renderList(node, state, path, "ordered", 0)
    case "taskList":
      return renderTaskList(node, state, path, 0)
    case "decisionList":
      return renderDecisionList(node, state, path)
    case "blockquote":
      return quote(renderChildBlocks(node, state, path))
    case "panel":
      return renderPanel(node, state, path)
    case "expand":
    case "nestedExpand":
      return renderExpand(node, state, path)
    case "layoutSection":
      warn(state, path, node.type, "layout-flattened")
      return renderChildBlocks(node, state, path)
    case "layoutColumn":
      return renderChildBlocks(node, state, path)
    case "table":
      return renderTable(node, state, path)
    case "mediaSingle":
    case "mediaGroup":
      return renderMediaContainer(node, state, path)
    case "media":
      return renderMedia(node, state, path)
    case "blockCard":
    case "embedCard":
      return renderCard(node, state, path)
    case "rule":
      return "---"
    case "codeBlock":
      return renderCodeBlock(node, state, path)
    default: {
      if (INLINE_NODES.has(node.type))
        return escapeLineStarts(renderInline(node, state, path))
      warn(state, path, node.type, "unsupported-node")
      return renderUnknownContent(node, state, path)
    }
  }
}

function renderUnknownContent(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  const children = node.content ?? []
  if (children.length === 0)
    return escapeMarkdownText(safeReadableFallback(node, state, path))
  return children.every((child) => INLINE_NODES.has(child.type))
    ? renderParagraph(node, state, path)
    : renderChildBlocks(node, state, path)
}

function renderChildBlocks(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  return renderBlocks(node.content ?? [], state, [...path, "content"])
}

function renderParagraph(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  return escapeLineStarts(renderInlineChildren(node, state, path))
}

function renderInlineChildren(
  node: AdfNode,
  state: ConversionState,
  path: Path
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
  path: Path
): string {
  switch (node.type) {
    case "hardBreak":
      return "  \n"
    case "inlineCard":
      return renderCard(node, state, path)
    case "media":
    case "mediaInline":
      return renderMedia(node, state, path)
    case "mention":
      return renderMention(node, state, path)
    case "emoji":
      return escapeText(
        safeSourceText(
          stringAttribute(node, "text") ??
            stringAttribute(node, "shortName") ??
            "",
          state,
          path
        )
      )
    case "status":
      return escapeText(
        safeSourceText(stringAttribute(node, "text") ?? "", state, path)
      )
    case "date":
      return renderDate(node, state, path)
    case "placeholder":
      return ""
    case "text":
      return renderText(node, state, path)
    default: {
      warn(state, path, node.type, "unsupported-node")
      return node.content
        ? renderInlineChildren(node, state, path)
        : escapeText(safeReadableFallback(node, state, path))
    }
  }
}

function renderText(node: AdfNode, state: ConversionState, path: Path) {
  const marks = node.marks ?? []
  for (const mark of marks)
    if (DROPPED_MARKS.has(mark.type))
      warn(state, path, mark.type, "mark-dropped")
  const safeText = safeSourceText(node.text ?? "", state, path)
  const textMarks = supportedTextMarks(marks)
  const jiraLink = jiraLinkReference(marks)
  if (jiraLink !== null) {
    return addReference(
      state,
      {
        kind: "jira-issue",
        sourceId: jiraLink.sourceId,
        originalUrl: jiraLink.url,
        fallbackText: safeText
      },
      textMarks
    )
  }
  const link = marks.find((mark) => mark.type === "link")
  const href = link ? stringAttribute(link, "href") : null
  const rendered =
    href !== null || textMarks.includes("code")
      ? renderMarkedText(safeText, textMarks)
      : wrapMarks(escapeTextWithIssueKeys(safeText, state), textMarks)
  return href === null ? rendered : `[${rendered}](${escapeUrl(href)})`
}

function escapeTextWithIssueKeys(text: string, state: ConversionState) {
  let rendered = ""
  let offset = 0
  for (const match of text.matchAll(JIRA_KEY_IN_TEXT)) {
    const key = match[1]
    const start = match.index ?? 0
    rendered += escapeText(text.slice(offset, start))
    rendered += addReference(state, {
      kind: "jira-issue",
      sourceId: key,
      originalUrl: null,
      fallbackText: key
    })
    offset = start + key.length
  }
  return rendered + escapeText(text.slice(offset))
}

function renderMention(node: AdfNode, state: ConversionState, path: Path) {
  const sourceId =
    stringAttribute(node, "id") ?? stringAttribute(node, "accountId")
  if (sourceId === null)
    return escapeText(safeReadableFallback(node, state, path))
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

function renderDate(node: AdfNode, state: ConversionState, path: Path) {
  const timestamp = Number(stringAttribute(node, "timestamp") ?? Number.NaN)
  const date = Number.isFinite(timestamp)
    ? DateTime.make(timestamp)
    : Option.none()
  if (Option.isNone(date)) {
    warn(state, path, node.type, "invalid-date")
    return ""
  }
  return DateTime.formatIsoDate(date.value)
}

function renderCard(node: AdfNode, state: ConversionState, path: Path) {
  const url = stringAttribute(node, "url")
  if (url === null) {
    warn(state, path, node.type, "card-without-url")
    return escapeText(safeReadableFallback(node, state, path))
  }
  const sourceId = jiraIssueId(url)
  if (sourceId !== null)
    return addReference(state, {
      kind: "jira-issue",
      sourceId,
      originalUrl: url,
      fallbackText: sourceId
    })
  return `[${escapeText(safeSourceText(url, state, path))}](${escapeUrl(url)})`
}

function renderPanel(node: AdfNode, state: ConversionState, path: Path) {
  const label = PANEL_LABELS[stringAttribute(node, "panelType") ?? ""] ?? "Note"
  const content = renderChildBlocks(node, state, path)
  return quote(content ? `**${label}**\n\n${content}` : `**${label}**`)
}

function renderExpand(node: AdfNode, state: ConversionState, path: Path) {
  const title = stringAttribute(node, "title")
  const content = renderChildBlocks(node, state, path)
  const heading =
    title === null || title.trim() === ""
      ? ""
      : `**${escapeText(safeSourceText(title.trim(), state, path))}**`
  return [heading, content].filter(Boolean).join("\n\n")
}

function renderMediaContainer(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  const children = node.content ?? []
  const media = children
    .flatMap((child, index) =>
      child.type === "media"
        ? [renderMedia(child, state, [...path, "content", index])]
        : []
    )
    .join("\n")
  const rest = children
    .flatMap((child, index) =>
      child.type === "media"
        ? []
        : [
            child.type === "caption"
              ? renderParagraph(child, state, [...path, "content", index])
              : renderBlock(child, state, [...path, "content", index])
          ]
    )
    .filter(Boolean)
  return [media, ...rest].filter(Boolean).join("\n\n")
}

function renderMedia(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  const sourceId = stringAttribute(node, "id")
  if (sourceId === null)
    return escapeText(safeReadableFallback(node, state, path))
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

function renderListItemContent(
  item: AdfNode,
  state: ConversionState,
  itemPath: Path,
  contentIndent: number
): Readonly<{ label: string; rest: ReadonlyArray<string> }> {
  const children = item.content ?? []
  const first = children[0]
  const labelled = first !== undefined && first.type === "paragraph"
  const label = labelled
    ? renderParagraph(first, state, [...itemPath, "content", 0])
    : ""
  const rest = children.slice(labelled ? 1 : 0).map((child, childIndex) => {
    const childPath = [...itemPath, "content", childIndex + (labelled ? 1 : 0)]
    if (child.type === "bulletList")
      return renderList(child, state, childPath, "bullet", contentIndent)
    if (child.type === "orderedList")
      return renderList(child, state, childPath, "ordered", contentIndent)
    if (child.type === "taskList")
      return renderTaskList(child, state, childPath, contentIndent)
    return indent(renderBlock(child, state, childPath), contentIndent)
  })
  return { label, rest }
}

function renderList(
  node: AdfNode,
  state: ConversionState,
  path: Path,
  kind: "bullet" | "ordered",
  indentation: number
): string {
  const start = numberAttribute(node, "order") ?? 1
  return (node.content ?? [])
    .map((item, index) => {
      const prefix = kind === "bullet" ? "-" : `${start + index}.`
      const { label, rest } = renderListItemContent(
        item,
        state,
        [...path, "content", index],
        indentation + prefix.length + 1
      )
      return [`${" ".repeat(indentation)}${prefix} ${label}`, ...rest]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n")
}

function renderTaskList(
  node: AdfNode,
  state: ConversionState,
  path: Path,
  indentation: number
): string {
  return (node.content ?? [])
    .map((item, index) => {
      const itemPath = [...path, "content", index]
      if (item.type === "taskList")
        return renderTaskList(item, state, itemPath, indentation + 2)
      const checked = stringAttribute(item, "state")?.toUpperCase() === "DONE"
      return `${" ".repeat(indentation)}- [${checked ? "x" : " "}] ${renderTaskLabel(item, state, itemPath)}`
    })
    .join("\n")
}

function renderTaskLabel(item: AdfNode, state: ConversionState, path: Path) {
  const children = item.content ?? []
  return escapeLineStarts(
    children.every((child) => INLINE_NODES.has(child.type))
      ? renderInlineChildren(item, state, path)
      : children
          .map((child, childIndex) =>
            child.type === "paragraph"
              ? renderInlineChildren(child, state, [
                  ...path,
                  "content",
                  childIndex
                ])
              : renderInline(child, state, [...path, "content", childIndex])
          )
          .join(" ")
  )
}

function renderDecisionList(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  return (node.content ?? [])
    .map(
      (item, index) =>
        `- **Decision:** ${renderTaskLabel(item, state, [...path, "content", index])}`
    )
    .join("\n")
}

function renderTable(
  node: AdfNode,
  state: ConversionState,
  path: Path
): string {
  const sourceRows = node.content ?? []
  const rows = sourceRows.map((row, rowIndex) =>
    (row.content ?? []).map((cell, cellIndex) =>
      renderBlocks(cell.content ?? [], state, [
        ...path,
        "content",
        rowIndex,
        "content",
        cellIndex,
        "content"
      ])
        .replace(/\|/g, "\\|")
        .replace(/\n/g, "&#10;")
    )
  )
  if (rows.length === 0) return ""
  const width = Math.max(1, ...rows.map((row) => row.length))
  const normalized = rows.map((row) =>
    row.concat(Array.from({ length: width - row.length }, () => ""))
  )
  const firstRow = sourceRows[0]?.content ?? []
  const hasHeader =
    firstRow.length > 0 && firstRow.every((cell) => cell.type === "tableHeader")
  const header = hasHeader
    ? normalized[0]
    : Array.from({ length: width }, () => "")
  const body = hasHeader ? normalized.slice(1) : normalized
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n")
}

function renderCodeBlock(
  node: AdfNode,
  state: ConversionState,
  path: Path
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

function quote(content: string): string {
  let fenced = false
  return content
    .split("\n")
    .flatMap((line) => {
      if (/^(`{3,}|~{3,})/.test(line)) fenced = !fenced
      return line === "" ? (fenced ? [">"] : []) : [`> ${line}`]
    })
    .join("\n")
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
  value: Readonly<{
    attrs?: Readonly<Record<string, Schema.Json>> | undefined
  }>,
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
    .replaceAll("`", "\\`")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replace(/<(?=[A-Za-z/!?])/g, "\\<")
}

function escapeLineStarts(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s{0,3})(#{1,6})(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})>/, "$1\\>")
        .replace(/^(\s{0,3})([+-])(?=\s|$|-{2})/, "$1\\$2")
        .replace(/^(\s{0,3})(=+)(\s*)$/, "$1\\$2$3")
        .replace(/^(\s{0,3}\d{1,9})([.)])(?=\s|$)/, "$1\\$2")
    )
    .join("\n")
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
  const placeholder = `jira-reference:${state.references.length.toString().padStart(6, "0")}${markSuffix}`
  state.references.push({ ...reference, placeholder })
  return placeholder
}

function safeReadableFallback(
  node: AdfNode,
  state: ConversionState,
  path: Path
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

function warn(
  state: ConversionState,
  path: Path,
  nodeType: string,
  reason: string
): void {
  const key = `${nodeType}\u0000${reason}`
  if (state.warned.has(key)) return
  state.warned.add(key)
  state.warnings.push({ path, nodeType, reason })
}

function safeSourceText(
  text: string,
  state: ConversionState,
  path: Path
): string {
  const reservedMarker =
    /<!--\s*(?:comments:(?:start|end)|comment:[A-Za-z0-9_-]+)\s*-->/g
  return text.replace(reservedMarker, (marker) => {
    warn(state, path, "text", "reserved-marker-neutralized")
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
  const encoded = /jira-reference:\d{6}(?::([^]+))?/.exec(placeholder)?.[1]
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
  return wrapMarks(
    marks.includes("code") ? inlineCode(text) : escapeText(text),
    marks
  )
}

function wrapMarks(rendered: string, marks: ReadonlyArray<TextMark>): string {
  let wrapped = rendered
  for (const mark of marks) {
    if (mark === "strong") wrapped = `**${wrapped}**`
    if (mark === "em") wrapped = `*${wrapped}*`
    if (mark === "strike") wrapped = `~~${wrapped}~~`
  }
  return wrapped
}

function indent(value: string, amount: number): string {
  const prefix = " ".repeat(amount)
  return value
    .split("\n")
    .map((line) => (line === "" ? line : `${prefix}${line}`))
    .join("\n")
}

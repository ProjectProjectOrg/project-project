import {
  advanceFence,
  attachmentSrc,
  attachmentViewParams,
  normalizeLineEndings,
  parseAttachmentUrl,
  parseMentionHref,
  parseTicketBlocks
} from "@pp/shared"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ReactNode
} from "react"
import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import rehypePrismPlus from "rehype-prism-plus"

import "@/lib/prism-langs"
import remarkGfm from "remark-gfm"

import { AttachmentChip } from "@/components/AttachmentChip"
import {
  blankBlockHeading,
  blockChrome,
  useBlockLookup
} from "@/components/blocks/blockChrome"
import { BlockFrame } from "@/components/blocks/BlockFrame"
import {
  SourceRemovedNote,
  SyncedChip,
  syncedChipLabel
} from "@/components/blocks/SyncedBlock"
import {
  splitLeadingHeading,
  syncedView
} from "@/components/blocks/syncedContent"
import {
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "@/components/Lexical/attachmentImageStyle"
import { MentionChip } from "@/components/Lexical/MentionChip"
import { cn } from "@/lib/utils"

const prismPlugin = [rehypePrismPlus, { ignoreMissing: true }] as const

const allowMentionUrls = (url: string) => {
  if (url.startsWith("mention:")) return url
  if (parseAttachmentUrl(url)) return url
  return defaultUrlTransform(url)
}

const attachmentLabel = (children: ReactNode): string =>
  Children.toArray(children)
    .map((child): string => {
      if (typeof child === "string" || typeof child === "number")
        return String(child)
      if (isValidElement<{ children?: ReactNode }>(child))
        return attachmentLabel(child.props.children)
      return ""
    })
    .join("")

const linkedAttachmentContent = (
  children: ReactNode,
  morphId: string
): ReactNode =>
  Children.map(children, (child, index) => {
    if (
      !isValidElement<{ src?: string; alt?: string; children?: ReactNode }>(
        child
      )
    )
      return child
    const { src, alt, children: nested } = child.props
    const id = `${morphId}-${index}`
    if (
      src &&
      parseAttachmentUrl(src) &&
      attachmentViewParams(src).density === "compact"
    ) {
      return (
        <AttachmentChip
          variant="linked"
          url={attachmentSrc(src)}
          alt={alt ?? ""}
          filename={alt ?? ""}
          kind="image"
          morphId={id}
        />
      )
    }
    return nested === undefined
      ? child
      : cloneElement(child, {}, linkedAttachmentContent(nested, id))
  })

export type MarkdownBlocks = "frame" | "flat"

const LINK_REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S/

export const linkReferenceDefinitions = (markdown: string): string => {
  let fence: string | null = null
  const definitions: Array<string> = []
  for (const line of normalizeLineEndings(markdown).split("\n")) {
    const insideCode = fence !== null || advanceFence(line, null) !== null
    fence = advanceFence(line, fence)
    if (!insideCode && LINK_REFERENCE_DEFINITION.test(line))
      definitions.push(line)
  }
  return definitions.join("\n")
}

const EMPTY_TASK_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\])[ \t]*$/

export const withEmptyTaskItems = (markdown: string): string => {
  let fence: string | null = null
  return normalizeLineEndings(markdown)
    .split("\n")
    .map((line) => {
      const insideCode = fence !== null || advanceFence(line, null) !== null
      fence = advanceFence(line, fence)
      return insideCode ? line : line.replace(EMPTY_TASK_ITEM, "$1 &nbsp;")
    })
    .join("\n")
}

const LinkReferencesContext = createContext("")

export type MarkdownSize = "default" | "compact"

export function Markdown({
  children,
  className,
  blocks = "frame",
  size = "default"
}: Readonly<{
  children: string
  className?: string
  blocks?: MarkdownBlocks
  size?: MarkdownSize
}>) {
  const morphId = useId()
  const segments = parseTicketBlocks(children)
  const framed =
    blocks === "frame" && segments.some((segment) => segment.kind === "block")
  const references =
    segments.length > 1 ? linkReferenceDefinitions(children) : ""
  return (
    <LinkReferencesContext.Provider value={references}>
      <div
        className={cn(
          "prose-md",
          size === "compact" && "prose-compact",
          framed && "block-gutter",
          className
        )}
      >
        {segments.map((segment, index) => {
          const id = `${morphId}-${index}`
          if (segment.kind === "markdown")
            return (
              <MarkdownSegment key={index} text={segment.text} morphId={id} />
            )
          if (!framed)
            return (
              <MarkdownSegment
                key={index}
                text={segment.content}
                morphId={id}
              />
            )
          if (segment.sync === true)
            return (
              <SyncedMarkdownBlock
                key={index}
                blockType={segment.type}
                snapshot={segment.content}
                morphId={id}
              />
            )
          const heading = blankBlockHeading(segment.content)
          return (
            <BlockFrame
              key={index}
              blockType={segment.type}
              blank={heading !== null}
            >
              {heading === "" ? null : (
                <MarkdownSegment
                  text={heading ?? segment.content}
                  morphId={id}
                />
              )}
            </BlockFrame>
          )
        })}
      </div>
    </LinkReferencesContext.Provider>
  )
}

function SyncedMarkdownBlock({
  blockType,
  snapshot,
  morphId
}: Readonly<{ blockType: string; snapshot: string; morphId: string }>) {
  const lookup = useBlockLookup()
  const view = syncedView(lookup, blockType, snapshot)
  if (view.kind === "removed") {
    const { heading, rest } = splitLeadingHeading(view.content)
    return (
      <BlockFrame blockType={blockType}>
        {heading !== null && (
          <MarkdownSegment text={heading} morphId={`${morphId}-heading`} />
        )}
        <SourceRemovedNote />
        <MarkdownSegment text={rest} morphId={morphId} />
      </BlockFrame>
    )
  }
  const origin = blockChrome(blockType, lookup).origin ?? "org"
  return (
    <BlockFrame blockType={blockType} sync>
      <MarkdownSegment text={view.content} morphId={morphId} />
      <SyncedChip label={syncedChipLabel(origin)} />
    </BlockFrame>
  )
}

const taskLineOf = (element: Element): number | null => {
  const line = element
    .closest("li[data-task-line]")
    ?.getAttribute("data-task-line")
  return line === null || line === undefined ? null : Number(line)
}

export function MarkdownSegment({
  text,
  morphId: attachmentId,
  onToggleTask
}: Readonly<{
  text: string
  morphId: string
  onToggleTask?: (line: number) => void
}>) {
  const references = useContext(LinkReferencesContext)
  const body = withEmptyTaskItems(text)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[prismPlugin as never]}
      urlTransform={allowMentionUrls}
      components={{
        ...(onToggleTask === undefined
          ? {}
          : {
              li: ({ node, ...rest }) => (
                <li {...rest} data-task-line={node?.position?.start.line} />
              ),
              input: ({ node: _node, type, disabled: _disabled, ...rest }) =>
                type === "checkbox" ? (
                  <input
                    {...rest}
                    type="checkbox"
                    onChange={(event) => {
                      const line = taskLineOf(event.currentTarget)
                      if (line !== null) onToggleTask(line)
                    }}
                  />
                ) : (
                  <input {...rest} type={type} />
                )
            }),
        a: ({ href, children: linkChildren, node, ...rest }) => {
          if (
            href &&
            parseAttachmentUrl(href) &&
            attachmentViewParams(href).density === "compact"
          ) {
            const label = attachmentLabel(linkChildren)
            return (
              <AttachmentChip
                url={attachmentSrc(href)}
                alt={label}
                filename={label}
                kind="file"
                morphId={`${attachmentId}-${node?.position?.start.offset}`}
              />
            )
          }
          const ref = href ? parseMentionHref(href) : null
          if (!ref) {
            return (
              <a href={href} {...rest}>
                {linkedAttachmentContent(
                  linkChildren,
                  `${attachmentId}-${node?.position?.start.offset}`
                )}
              </a>
            )
          }
          const label = typeof linkChildren === "string" ? linkChildren : ref.id
          return <MentionChip type={ref.type} id={ref.id} label={label} />
        },
        img: ({ src, alt, node, ...rest }) => {
          const url = typeof src === "string" ? src : undefined
          if (
            url &&
            parseAttachmentUrl(url) &&
            attachmentViewParams(url).density === "compact"
          ) {
            return (
              <AttachmentChip
                url={attachmentSrc(url)}
                alt={alt ?? ""}
                filename={alt ?? ""}
                kind="image"
                morphId={`${attachmentId}-${node?.position?.start.offset}`}
              />
            )
          }
          const width = url ? attachmentViewParams(url).width : null
          return (
            <img
              src={url}
              alt={alt ?? ""}
              loading="lazy"
              decoding="async"
              style={attachmentWidthStyle(width)}
              className={cn("my-2", ATTACHMENT_IMAGE_CLASS)}
              {...rest}
            />
          )
        }
      }}
    >
      {references === "" ? body : `${body}\n\n${references}`}
    </ReactMarkdown>
  )
}

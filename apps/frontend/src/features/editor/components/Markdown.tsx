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
import rehypePrismPlus from "rehype-prism-plus/common"

import "@/lib/prismLangs"
import remarkGfm from "remark-gfm"

import { Checkbox } from "@/components/ui/checkbox"
import { AttachmentChip } from "@/features/attachments/components/AttachmentChip"
import { BlockFrame } from "@/features/editor/components/BlockFrame"
import {
  SourceRemovedNote,
  SyncedChip,
  syncedChipLabel
} from "@/features/editor/components/SyncedBlock"
import {
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "@/features/editor/lexical/attachmentImageStyle"
import { MentionChip } from "@/features/editor/lexical/MentionChip"
import {
  blankBlockHeading,
  blockChrome,
  useBlockLookup
} from "@/features/editor/lib/blockChrome"
import {
  splitLeadingHeading,
  syncedView
} from "@/features/editor/lib/syncedContent"
import { PreviewLink } from "@/features/link-previews/components/PreviewLink"
import { previewableUrl } from "@/features/link-previews/lib/linkPreviewUrl"
import { cn } from "@/lib/utils"

const prismPlugin = [
  rehypePrismPlus,
  { ignoreMissing: true }
] satisfies NonNullable<
  Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]
>[number]

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

const containsImage = (children: ReactNode): boolean =>
  Children.toArray(children).some(
    (child) =>
      isValidElement<{ src?: string; children?: ReactNode }>(child) &&
      (child.props.src !== undefined || containsImage(child.props.children))
  )

const plainText = (children: ReactNode): string | null => {
  const parts = Children.toArray(children)
  return parts.every((part) => typeof part === "string") ? parts.join("") : null
}

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
  const view = syncedView(lookup, blockType, snapshot, "synced")
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
      <SyncedChip label={syncedChipLabel("synced", origin)} />
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
      rehypePlugins={[prismPlugin]}
      urlTransform={allowMentionUrls}
      components={{
        ...(onToggleTask === undefined
          ? {}
          : {
              li: ({ node, ...rest }) => (
                <li {...rest} data-task-line={node?.position?.start.line} />
              )
            }),
        input: ({ node: _node, type, checked, ...rest }) =>
          type === "checkbox" ? (
            <Checkbox
              checked={checked === true}
              readOnly={onToggleTask === undefined}
              onCheckedChange={(_checked, details) => {
                if (!(details.event.target instanceof Element)) return
                const line = taskLineOf(details.event.target)
                if (line !== null) onToggleTask?.(line)
              }}
            />
          ) : (
            <input {...rest} type={type} checked={checked} />
          ),
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
          const previewUrl = ref ? null : previewableUrl(href)
          if (
            href !== undefined &&
            previewUrl !== null &&
            !containsImage(linkChildren)
          ) {
            return (
              <PreviewLink
                href={href}
                url={previewUrl}
                label={plainText(linkChildren)}
                {...rest}
              >
                {linkChildren}
              </PreviewLink>
            )
          }
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

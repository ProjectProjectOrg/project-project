import {
  attachmentSrc,
  attachmentViewParams,
  parseFigmaUrl,
  parseAttachmentUrl,
  parseMentionHref,
  parseTicketBlocks
} from "@pp/shared"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  use,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode
} from "react"
import ReactMarkdown from "react-markdown"
import rehypePrismPlus from "rehype-prism-plus/common"

import "../lib/prismLangs"
import { AttachmentChip } from "../components/attachment-chip"
import { Checkbox } from "../components/checkbox"
import {
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "../editor/attachment-image-style"
import { markdownPlugins } from "../editor/markdown-parser"
import { cn } from "../lib/utils"
import {
  blankBlockHeading,
  blockChrome,
  useBlockLookup
} from "./blocks/block-chrome"
import { BlockFrame } from "./blocks/block-frame"
import {
  SourceRemovedNote,
  SyncedChip,
  syncedChipLabel
} from "./blocks/synced-block"
import { splitLeadingHeading, syncedView } from "./blocks/synced-content"
import { previewableUrl } from "./links/link-preview-url"
import { PreviewLink } from "./links/preview-link"
import { FigmaTargetContext, MarkdownFigma } from "./markdown-figma"
import {
  allowMentionUrls,
  attachmentLabel,
  containsImage,
  linkReferenceDefinitions,
  plainText,
  taskLineOf,
  withEmptyTaskItems
} from "./markdown-text"
import { MentionChip } from "./mentions/mention-chip"
import { m } from "./messages"
import { PaperChip } from "./paper/paper-chip"
import { isPaperDesignUrl } from "./paper/paper-url"
import type { TicketTarget } from "./services"

const prismPlugin = [
  rehypePrismPlus,
  { ignoreMissing: true, showLineNumbers: true }
] satisfies NonNullable<
  Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]
>[number]

const linkedAttachmentContent: (
  children: ReactNode,
  morphId: string
) => ReactNode = (children, morphId) =>
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
          downloadLabel={m.editor_attachment_download()}
        />
      )
    }
    return nested === undefined
      ? child
      : cloneElement(child, {}, linkedAttachmentContent(nested, id))
  })

export type MarkdownBlocks = "frame" | "flat"

const LinkReferencesContext = createContext("")

export type MarkdownSize = "default" | "compact"

export function Markdown({
  children,
  className,
  blocks = "frame",
  size = "default",
  figmaTarget = null
}: Readonly<{
  children: string
  className?: string
  blocks?: MarkdownBlocks
  size?: MarkdownSize
  figmaTarget?: TicketTarget | null
}>) {
  const morphId = useId()
  const segments = parseTicketBlocks(children)
  const framed =
    blocks === "frame" && segments.some((segment) => segment.kind === "block")
  const references =
    segments.length > 1 ? linkReferenceDefinitions(children) : ""
  return (
    <FigmaTargetContext value={figmaTarget}>
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
    </FigmaTargetContext>
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

const TaskItemContext = createContext<string | undefined>(undefined)

// A task list's checkbox, named by its item. Read-only, it shows the
// item's state without being a stop on the way through the text.
function TaskCheckbox(
  props: Readonly<ComponentProps<typeof Checkbox> & { readOnly: boolean }>
) {
  return (
    <Checkbox
      {...props}
      aria-labelledby={use(TaskItemContext)}
      tabIndex={props.readOnly ? -1 : undefined}
    />
  )
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
      remarkPlugins={markdownPlugins}
      rehypePlugins={[prismPlugin]}
      urlTransform={allowMentionUrls}
      components={{
        li: ({ node, ...rest }) => {
          // A task's checkbox is named by its item's text.
          const id = `${attachmentId}-task-${node?.position?.start.line}`
          return (
            <TaskItemContext value={id}>
              <li
                {...rest}
                id={rest.className === "task-list-item" ? id : undefined}
                data-task-line={
                  onToggleTask === undefined
                    ? undefined
                    : node?.position?.start.line
                }
              />
            </TaskItemContext>
          )
        },
        input: ({ node: _node, type, checked, ...rest }) =>
          type === "checkbox" ? (
            <TaskCheckbox
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
                downloadLabel={m.editor_attachment_download()}
              />
            )
          }
          const figma = href ? parseFigmaUrl(href) : null
          if (href && figma)
            return (
              <MarkdownFigma
                href={href}
                reference={figma}
                label={plainText(linkChildren) ?? ""}
                morphId={`${attachmentId}-${node?.position?.start.offset}`}
              />
            )
          if (href && isPaperDesignUrl(href))
            return (
              <PaperChip url={href} label={plainText(linkChildren) ?? ""} />
            )
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
        img: ({ src: url, alt, node, ...rest }) => {
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
                downloadLabel={m.editor_attachment_download()}
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

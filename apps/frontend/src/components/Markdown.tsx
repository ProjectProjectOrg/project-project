import {
  advanceFence,
  attachmentSrc,
  attachmentViewParams,
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
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "@/components/Lexical/attachmentImageStyle"
import { MentionChip } from "@/components/Lexical/MentionChip"
import { ticketBlockLabel } from "@/components/Lexical/TicketBlockNode"
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

const LINK_REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S/

export const linkReferenceDefinitions = (markdown: string): string => {
  let fence: string | null = null
  const definitions: Array<string> = []
  for (const line of markdown.split("\n")) {
    const insideCode = fence !== null || advanceFence(line, null) !== null
    fence = advanceFence(line, fence)
    if (!insideCode && LINK_REFERENCE_DEFINITION.test(line))
      definitions.push(line)
  }
  return definitions.join("\n")
}

const LinkReferencesContext = createContext("")

export function Markdown({
  children,
  className
}: {
  children: string
  className?: string
}) {
  const morphId = useId()
  const segments = parseTicketBlocks(children)
  const references =
    segments.length > 1 ? linkReferenceDefinitions(children) : ""
  return (
    <LinkReferencesContext.Provider value={references}>
      <div className={cn("prose-md", className)}>
        {segments.map((segment, index) =>
          segment.kind === "markdown" ? (
            <MarkdownSegment
              key={index}
              text={segment.text}
              morphId={`${morphId}-${index}`}
            />
          ) : (
            <div
              key={index}
              className="ticket-block"
              data-block-type={segment.type}
              data-block-label={ticketBlockLabel(segment.type)}
            >
              <MarkdownSegment
                text={segment.content}
                morphId={`${morphId}-${index}`}
              />
            </div>
          )
        )}
      </div>
    </LinkReferencesContext.Provider>
  )
}

function MarkdownSegment({
  text,
  morphId: attachmentId
}: Readonly<{ text: string; morphId: string }>) {
  const references = useContext(LinkReferencesContext)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[prismPlugin as never]}
      urlTransform={allowMentionUrls}
      components={{
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
      {references === "" ? text : `${text}\n\n${references}`}
    </ReactMarkdown>
  )
}

import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypePrismPlus from "rehype-prism-plus"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"
import { parseAttachmentUrl, parseMentionHref } from "@projectproject/shared"
import { MentionChip } from "@/components/Lexical/MentionChip"

const prismPlugin = [rehypePrismPlus, { ignoreMissing: true }] as const

const allowMentionUrls = (url: string) => {
  if (url.startsWith("mention:")) return url
  if (parseAttachmentUrl(url)) return url
  return defaultUrlTransform(url)
}

export function Markdown({
  children,
  className
}: {
  children: string
  className?: string
}) {
  return (
    <div className={cn("prose-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[prismPlugin as never]}
        urlTransform={allowMentionUrls}
        components={{
          a: ({ href, children: linkChildren, ...rest }) => {
            const ref = href ? parseMentionHref(href) : null
            if (!ref) {
              return (
                <a href={href} {...rest}>
                  {linkChildren}
                </a>
              )
            }
            const label =
              typeof linkChildren === "string" ? linkChildren : ref.id
            return <MentionChip type={ref.type} id={ref.id} label={label} />
          },
          img: ({ src, alt, ...rest }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
              decoding="async"
              className="my-2 max-w-full rounded-lg border"
              {...rest}
            />
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

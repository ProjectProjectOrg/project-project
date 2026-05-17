import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypePrismPlus from "rehype-prism-plus"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"
import { parseMentionHref } from "@projectproject/shared"
import { MentionChip } from "@/components/Lexical/MentionChip"

const prismPlugin = [rehypePrismPlus, { ignoreMissing: true }] as const

const allowMentionUrls = (url: string) =>
  url.startsWith("mention:") ? url : defaultUrlTransform(url)

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
            return (
              <MentionChip type={ref.type} id={ref.id} label={label} />
            )
          }
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

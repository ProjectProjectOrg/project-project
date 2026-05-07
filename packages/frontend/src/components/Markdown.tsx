import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypePrismPlus from "rehype-prism-plus"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"
import { parseMentionHref } from "@projectproject/shared"
import { providerForType } from "@/mentions/registry"

const prismPlugin = [rehypePrismPlus, { ignoreMissing: true }] as const

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
            const provider = providerForType(ref.type)
            const label = String(linkChildren ?? ref.id)
            return provider ? (
              <>{provider.renderChip({ ...ref, label })}</>
            ) : (
              <span className="mention-chip">{label}</span>
            )
          }
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

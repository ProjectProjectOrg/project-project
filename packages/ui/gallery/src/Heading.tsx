import { cn } from "@pp/ui/lib/utils"
import { Check, Hash } from "lucide-react"
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode
} from "react"

import { IconSwap } from "./IconSwap"

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child)
      if (isValidElement<{ children?: ReactNode }>(child))
        return textOf(child.props.children)
      return ""
    })
    .join("")

export const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")

const COPIED_MS = 1200

export function Heading({
  level,
  className,
  children
}: Readonly<{ level: 2 | 3; className?: string; children?: ReactNode }>) {
  const text = textOf(children)
  const id = slugOf(text)
  const [copied, setCopied] = useState(false)
  const Tag = level === 2 ? "h2" : "h3"

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyLink = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    window.history.replaceState(null, "", `#${id}`)
    document.getElementById(id)?.scrollIntoView({ block: "start" })
    void navigator.clipboard.writeText(url).then(() => setCopied(true))
  }

  return (
    <Tag
      id={id}
      className={cn("group/heading relative scroll-mt-10", className)}
    >
      <a
        href={`#${id}`}
        onClick={copyLink}
        aria-label={copied ? "Link copied" : `Copy link to ${text}`}
        className="absolute top-1/2 -left-7 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] group-hover/heading:opacity-100 hover:text-foreground focus-visible:opacity-100"
      >
        <IconSwap swapKey={copied ? "copied" : "hash"}>
          {copied ? (
            <Check className="size-3.5" strokeWidth={2} />
          ) : (
            <Hash className="size-3.5" strokeWidth={2} />
          )}
        </IconSwap>
      </a>
      {children}
    </Tag>
  )
}

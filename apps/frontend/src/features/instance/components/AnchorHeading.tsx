import { Button } from "@pp/ui/button"
import { Check, Hash } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { useEffect, useState, type ReactNode } from "react"

import { m } from "@/paraglide/messages"

const COPIED_FOR_MS = 1600

// A section heading sets the page's rhythm; a highlight's title reads larger,
// as the release's headline.
export function AnchorHeading({
  anchor,
  level,
  label,
  className,
  children
}: Readonly<{
  anchor: string
  level: "section" | "highlight"
  label: string
  className?: string
  children: ReactNode
}>) {
  return (
    <div
      className={cn(
        "group/reveal relative flex items-baseline gap-1",
        className
      )}
    >
      {level === "section" ? (
        <h2 className="flex min-w-0 items-baseline gap-3 text-display-compact font-semibold">
          {children}
        </h2>
      ) : (
        // oxlint-disable-next-line shadcn/no-arbitrary-values -- a highlight's title is the release's headline: it grows with the page past the top of the type scale
        <h3 className="min-w-0 text-[clamp(1.625rem,1.2rem+1.1vw,2.125rem)] leading-[1.18] font-semibold text-pretty">
          {children}
        </h3>
      )}
      <CopyAnchor id={anchor} label={label} />
    </div>
  )
}

function CopyAnchor({ id, label }: Readonly<{ id: string; label: string }>) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = () => {
    const url = new URL(window.location.href)
    url.hash = id
    window.history.replaceState(window.history.state, "", url)
    void navigator.clipboard
      .writeText(url.toString())
      .then(() => setCopied(true))
  }
  return (
    <span
      className={cn(
        "self-center opacity-0 transition-opacity group-hover/reveal:opacity-100 focus-within:opacity-100",
        copied && "opacity-100"
      )}
    >
      <Button
        variant="ghost"
        size="square-7"
        aria-label={m.profile_changelog_copy_link({ section: label })}
        onClick={copy}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Hash className="size-3.5" />
        )}
        <output className="sr-only">
          {copied ? m.profile_changelog_link_copied() : ""}
        </output>
      </Button>
    </span>
  )
}

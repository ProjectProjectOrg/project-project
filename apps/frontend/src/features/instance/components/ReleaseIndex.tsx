import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { motion, useReducedMotion } from "motion/react"
import { type MouseEvent, useLayoutEffect, useRef, useState } from "react"

import { m } from "@/paraglide/messages"

import { useActiveSection } from "../hooks/useActiveSection"
import { type IndexItem, indexIds } from "../lib/releaseView"

type Mark = Readonly<{ y: number; height: number }>

export function ReleaseIndex({
  items,
  onGo
}: Readonly<{
  items: ReadonlyArray<IndexItem>
  onGo: (id: string) => void
}>) {
  const reduce = useReducedMotion() ?? false
  const active = useActiveSection(indexIds(items))
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const [mark, setMark] = useState<Mark | null>(null)

  const list = useRef<HTMLOListElement | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const link = active === null ? undefined : links.current.get(active)
      if (link === undefined) return
      setMark({ y: link.offsetTop, height: link.offsetHeight })
    }
    measure()
    const node = list.current
    if (node === null) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [active])

  const register = (id: string) => (link: HTMLAnchorElement | null) => {
    if (link === null) links.current.delete(id)
    else links.current.set(id, link)
  }

  const go = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onGo(id)
  }

  return (
    <nav
      aria-label={m.profile_changelog_index_label()}
      className="flex flex-col gap-3"
    >
      <p className="pl-4 text-caption font-semibold text-muted-foreground">
        {m.profile_changelog_index_label()}
      </p>
      <ol ref={list} className="relative flex flex-col">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-border"
        />
        {mark === null ? null : (
          <motion.span
            aria-hidden
            className="absolute top-0 left-0 w-0.5 -translate-x-px rounded-full bg-foreground"
            initial={false}
            animate={{ y: mark.y, height: mark.height }}
            transition={reduce ? { duration: 0 } : spring.moderate}
          />
        )}
        {items.map((item) => (
          <li key={item.id}>
            <a
              ref={register(item.id)}
              href={`#${item.id}`}
              aria-current={item.id === active ? "location" : undefined}
              onClick={go(item.id)}
              className={cn(
                "focus-ring flex items-baseline justify-between gap-3 rounded-sm py-1.5 pl-4 text-body transition-colors",
                item.id === active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="min-w-0">{item.label}</span>
              {item.count === null ? null : (
                <span className="text-caption font-normal text-muted-foreground tabular-nums">
                  {item.count}
                </span>
              )}
            </a>
            {item.children.length === 0 ? null : (
              <ol className="flex flex-col pb-1">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a
                      ref={register(child.id)}
                      href={`#${child.id}`}
                      aria-current={
                        child.id === active ? "location" : undefined
                      }
                      onClick={go(child.id)}
                      className={cn(
                        "focus-ring block rounded-sm py-1 pl-7 text-caption text-pretty transition-colors",
                        child.id === active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="line-clamp-2">{child.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

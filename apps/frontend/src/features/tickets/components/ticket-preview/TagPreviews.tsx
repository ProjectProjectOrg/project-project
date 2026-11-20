import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { type TagName } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { HoverCardFooter } from "@pp/ui/hover-card"
import { Copy } from "@pp/ui/icons"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest, tagUsage } from "@/features/tags/atoms/tags"
import { m } from "@/paraglide/messages"

export function TagPreview({ name }: Readonly<{ name: TagName }>) {
  const { orgSlug, slug } = useProjectRoute()
  const request = tagsRequest(orgSlug, slug)
  const tags = useAtomValue(tagsFor(request))
  const usage = useAtomValue(tagUsage(request))
  const refreshUsage = useAtomRefresh(tagUsage(request))
  const color = Result.isSuccess(tags)
    ? tags.value.find((tag) => tag.name === name)?.color
    : undefined
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-body text-foreground">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 truncate">{name}</span>
      </div>
      <HoverCardFooter>
        <Copy className="size-3.5 shrink-0" strokeWidth={1.75} />
        <AsyncView
          result={usage}
          onInitial={() => <span className="h-3 w-20 rounded bg-muted" />}
          onFailure={() => (
            <>
              <span className="min-w-0 flex-1">
                {m.tags_usage_load_failed()}
              </span>
              <Button variant="ghost" size="xs" onClick={refreshUsage}>
                {m.error_page_retry_button()}
              </Button>
            </>
          )}
          onSuccess={({ value }) => {
            const count = value[name] ?? 0
            return count === 1
              ? m.tags_usage_one()
              : m.tags_usage_many({ count })
          }}
        />
      </HoverCardFooter>
    </>
  )
}

export function TagListPreview({
  names
}: Readonly<{ names: ReadonlyArray<TagName> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  return (
    <ul className="flex flex-col">
      {names.map((name) => (
        <li
          key={name}
          className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-body text-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-muted-foreground"
            style={{ backgroundColor: colors.get(name) }}
          />
          <span className="min-w-0 truncate">{name}</span>
        </li>
      ))}
    </ul>
  )
}

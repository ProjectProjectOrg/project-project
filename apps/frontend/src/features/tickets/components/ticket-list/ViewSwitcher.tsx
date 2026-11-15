import { Columns3, Rows3 } from "@pp/ui/icons"
import { SegmentedTabs, type SegmentedItem } from "@pp/ui/segmented-tabs"
import { useMatch, useNavigate } from "@tanstack/react-router"
import { startTransition } from "react"
import { flushSync } from "react-dom"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectView } from "@/hooks/useViewPreference"
import { m } from "@/paraglide/messages"

export function ViewSwitcher() {
  const { orgSlug, slug } = useProjectRoute()
  const navigate = useNavigate()
  const sprintMatch = useMatch({
    from: "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId",
    shouldThrow: false
  })
  const backlogMatch = useMatch({
    from: "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/",
    shouldThrow: false
  })
  const search = (sprintMatch ?? backlogMatch)?.search
  const { view, setPreference } = useProjectView(
    orgSlug,
    slug,
    search?.view,
    sprintMatch ? "sprints" : "backlog"
  )
  if (!sprintMatch && !backlogMatch) return null

  const select = (next: "list" | "board" | "description", to: () => void) => {
    if (next !== "description") flushSync(() => setPreference(next))
    startTransition(to)
  }

  if (sprintMatch) {
    const { groupId } = sprintMatch.params
    return (
      <SwitcherTabs
        ariaLabel={m.sprints_view_tabs_aria_label()}
        current={view === "description" ? "list" : view}
        items={[
          { key: "list", label: m.sprints_view_list(), icon: Rows3 },
          { key: "board", label: m.sprints_view_board(), icon: Columns3 }
        ]}
        onSelect={(next) =>
          select(next, () => {
            void navigate({
              to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
              params: { orgSlug, slug, groupId },
              search: (prev) => ({
                ...prev,
                view: next
              })
            })
          })
        }
      />
    )
  }

  return (
    <SwitcherTabs
      ariaLabel={m.tickets_view_tabs_aria_label()}
      current={view === "description" ? "list" : view}
      items={[
        { key: "list", label: m.tickets_view_list(), icon: Rows3 },
        { key: "board", label: m.tickets_view_board(), icon: Columns3 }
      ]}
      onSelect={(next) =>
        select(next, () => {
          void navigate({
            to: "/orgs/$orgSlug/projects/$slug",
            params: { orgSlug, slug },
            search: (prev) => ({
              ...prev,
              view: next
            })
          })
        })
      }
    />
  )
}

function SwitcherTabs<K extends string>({
  ariaLabel,
  current,
  items,
  onSelect
}: Readonly<{
  ariaLabel: string
  current: K
  items: ReadonlyArray<SegmentedItem<K>>
  onSelect: (next: K) => void
}>) {
  return (
    <div role="group" aria-label={ariaLabel} className="w-full">
      <SegmentedTabs
        fill
        items={items}
        value={current}
        onValueChange={onSelect}
      />
    </div>
  )
}

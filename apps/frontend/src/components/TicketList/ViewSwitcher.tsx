import { useMatches, useNavigate } from "@tanstack/react-router"
import { Columns3, Rows3 } from "lucide-react"
import { startTransition } from "react"
import { flushSync } from "react-dom"

import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { useProjectView } from "@/hooks/useViewPreference"
import { m } from "@/paraglide/messages"

export function ViewSwitcher({
  orgSlug,
  slug
}: Readonly<{
  orgSlug: string
  slug: string
}>) {
  const navigate = useNavigate()
  const matches = useMatches()
  const sprintMatch = matches.find(
    (m) =>
      m.routeId ===
      "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
  )
  const backlogMatch = matches.find(
    (m) => m.routeId === "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
  )
  const search = (sprintMatch ?? backlogMatch)?.search as
    | { view?: "list" | "board" | "description" }
    | undefined
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
    const { groupId } = sprintMatch.params as { groupId: string }
    return (
      <SwitcherTabs
        variant="view"
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
                updatedAfter: prev.updatedAfter?.toISOString(),
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
      variant="view"
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
              updatedAfter: prev.updatedAfter?.toISOString(),
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
  onSelect,
  variant
}: Readonly<{
  variant: "default" | "view"
  ariaLabel: string
  current: K
  items: ReadonlyArray<SegmentedItem<K>>
  onSelect: (next: K) => void
}>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={variant === "view" ? "w-full" : "ml-auto"}
    >
      <SegmentedTabs
        variant={variant}
        items={items}
        isActive={(k) => k === current}
        renderItem={(item, content, { active }) => (
          <button
            type="button"
            onClick={() => {
              if (item.key !== current) onSelect(item.key)
            }}
            aria-pressed={active}
            className={SEGMENTED_ITEM_CLASS(active, variant)}
          >
            {content}
          </button>
        )}
      />
    </div>
  )
}

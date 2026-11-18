import { useAtomValue } from "@effect/atom-react"
import type { Project, SidebarPin } from "@pp/shared"
import { SidebarRowGroup, SidebarSection } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"

import { pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { predictionOf } from "@/features/pins/components/PinRow"
import { PinTree, topPins } from "@/features/pins/components/PinTree"
import { usePinReorder } from "@/features/pins/hooks/usePinReorder"
import {
  nestPins,
  pinKey,
  pinsIn,
  ticketLinkOf
} from "@/features/pins/lib/pins"

export function DashboardPins({
  orgSlug,
  projects
}: Readonly<{ orgSlug: string; projects: ReadonlyArray<Project> }>) {
  const result = useAtomValue(pinsFor(pinsRequest(orgSlug)))
  if (!Result.isSuccess(result)) return null
  return projects.map((project) => {
    const pins = pinsIn(result.value, project.slug)
    if (pins.length === 0) return null
    return (
      <ProjectGroup
        key={project.slug}
        orgSlug={orgSlug}
        project={project}
        pins={pins}
      />
    )
  })
}

function ProjectGroup({
  orgSlug,
  project,
  pins
}: Readonly<{
  orgSlug: string
  project: Project
  pins: ReadonlyArray<SidebarPin>
}>) {
  const reorder = usePinReorder(orgSlug, project.slug)
  const tree = nestPins(
    pins.map((pin) => ({
      key: pinKey(pin),
      target: pin,
      display: predictionOf(pin),
      pin,
      active: false
    })),
    (row) => ticketLinkOf(row.display)
  )
  return (
    <SidebarSection
      label={project.name}
      icon={
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-[2px]"
          style={{ background: project.color }}
        />
      }
    >
      <SidebarRowGroup onReorder={(order) => reorder(topPins(tree), order)}>
        {tree.map((node) => (
          <PinTree
            key={node.row.key}
            orgSlug={orgSlug}
            slug={project.slug}
            node={node}
          />
        ))}
      </SidebarRowGroup>
    </SidebarSection>
  )
}

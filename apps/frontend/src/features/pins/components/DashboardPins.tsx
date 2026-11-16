import { useAtomValue } from "@effect/atom-react"
import type { Project, SidebarPin } from "@pp/shared"
import { SidebarRowGroup, SidebarSection } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"

import { pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { PinRow, predictionOf } from "@/features/pins/components/PinRow"
import { usePinReorder } from "@/features/pins/hooks/usePinReorder"
import { pinKey, pinsIn } from "@/features/pins/lib/pins"

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
      <SidebarRowGroup onReorder={(order) => reorder(pins, order)}>
        {pins.map((pin) => (
          <PinRow
            key={pinKey(pin)}
            orgSlug={orgSlug}
            slug={project.slug}
            target={pin}
            display={predictionOf(pin)}
            pinned
            active={false}
          />
        ))}
      </SidebarRowGroup>
    </SidebarSection>
  )
}

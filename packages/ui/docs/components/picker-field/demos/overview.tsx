import { useState, type ReactNode } from "react"

import { START } from "./parts/data"
import { EpicField, PlanningSection, SprintField } from "./parts/field"

const ignore = () => undefined

export default function Overview() {
  const [sprintId, setSprintId] = useState<string | null>(START.sprint)
  const [epicId, setEpicId] = useState<string | null>(START.epic)
  const [opened, setOpened] = useState<string | null>(null)
  const open = (name: string) => setOpened(name)

  return (
    <div className="@container flex w-full flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-4">
        <PlanningSection>
          <SprintField value={sprintId} onChange={setSprintId} onOpen={open} />
          <EpicField value={epicId} onChange={setEpicId} onOpen={open} />
        </PlanningSection>
        <p className="text-caption text-muted-foreground" aria-live="polite">
          {opened === null
            ? "Hover a field, then its ›"
            : `Would open ${opened}`}
        </p>
      </div>
      <div className="grid w-full grid-cols-[repeat(3,minmax(0,1fr))] justify-items-start gap-x-4 gap-y-6">
        <Cell caption="Empty">
          <SprintField value={null} onChange={ignore} onOpen={ignore} />
        </Cell>
        <Cell caption="Set">
          <SprintField value="s14" onChange={ignore} onOpen={ignore} />
        </Cell>
        <Cell caption="Hover">
          <SprintField value="s14" onChange={ignore} onOpen={ignore} hovered />
        </Cell>
        <Cell caption="Empty">
          <EpicField value={null} onChange={ignore} onOpen={ignore} />
        </Cell>
        <Cell caption="Set">
          <EpicField value="T-301" onChange={ignore} onOpen={ignore} />
        </Cell>
        <Cell caption="Hover">
          <EpicField value="T-301" onChange={ignore} onOpen={ignore} hovered />
        </Cell>
      </div>
    </div>
  )
}

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-2">
      {children}
      <span className="pl-2.5 text-caption text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

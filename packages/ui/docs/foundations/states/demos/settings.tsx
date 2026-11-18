import { Button } from "@pp/ui/button"
import { ChevronDown } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { useId } from "react"

import { Compare, SideCaption } from "./parts/compare"
import { Surface } from "./parts/surface"

// A settings group: the card well on the page, with fields at rest, hovered
// and focused, and a ghost action hovered. Today every field is 0.18 in
// dark whatever it sits on; under the rule it sits a fixed step below the
// well, so the well and its fields keep the same relation as the page and
// its fields.
function Settings() {
  const id = useId()
  const row =
    "grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-body text-muted-foreground"
  return (
    <Surface kind="page" className="p-3">
      <Surface kind="well" className="flex flex-col gap-3 p-4">
        <span className="text-body font-semibold">Project</span>
        <div className={row}>
          <label htmlFor={`${id}-name`}>Name</label>
          <Input id={`${id}-name`} defaultValue="Verification" />
          <SideCaption state="Rest" />
        </div>
        <div className={row}>
          <label htmlFor={`${id}-key`}>Key</label>
          <Input id={`${id}-key`} defaultValue="AV" data-force="hover" />
          <SideCaption state="Hovered" />
        </div>
        <div className={row}>
          <span>View</span>
          <Button variant="field" data-force="focus">
            List
            <ChevronDown className="size-4" strokeWidth={1.75} />
          </Button>
          <SideCaption state="Focused" />
        </div>
        <div className={row}>
          <span />
          <Button
            variant="ghost"
            data-force="hover"
            className="justify-self-end"
          >
            Archive project
          </Button>
          <SideCaption state="Hovered" />
        </div>
      </Surface>
    </Surface>
  )
}

export default function SettingsCompared() {
  return <Compare scene={() => <Settings />} />
}

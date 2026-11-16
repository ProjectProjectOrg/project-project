import { Button } from "@pp/ui/button"
import { CalendarRange, Info, ListChecks, Pin, PinOff } from "@pp/ui/icons"
import {
  SidebarNote,
  SidebarPanelBody,
  SidebarRow,
  SidebarRowAction,
  SidebarRowGroup,
  SidebarSection,
  SidebarSubRows
} from "@pp/ui/sidebar"
import { useState } from "react"

import type { SprintState } from "./data"
import { SprintIcon } from "./parts/marks"

type Item = Readonly<{
  id: string
  label: string
  state: SprintState
  meta?: string
}>

const LIVE: Item = { id: "s25", label: "Sprint 25", state: "planned" }

const START: ReadonlyArray<Item> = [
  { id: "s23", label: "Sprint 23", state: "completed" },
  { id: "s22", label: "Sprint 22", state: "completed" }
]

export default function Rows() {
  const [page, setPage] = useState("s25")
  const [pins, setPins] = useState(START)
  const [landed, setLanded] = useState<string | null>(null)
  const livePinned = pins.some((pin) => pin.id === LIVE.id)
  const toggle = (item: Item) => {
    const pinned = pins.some((pin) => pin.id === item.id)
    setPins(pinned ? pins.filter((pin) => pin.id !== item.id) : [item, ...pins])
    setLanded(pinned ? null : item.id)
  }
  const go = (id: string) => {
    setPage(id)
    setLanded(null)
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-[24rem] w-60 flex-col rounded-[14px] bg-background py-2">
        <SidebarPanelBody label="Atlas Mobile App">
          <SidebarRow
            icon={<ListChecks />}
            label="Backlog"
            active={page === "backlog"}
            onClick={() => go("backlog")}
          />
          <SidebarRow
            icon={<CalendarRange />}
            label="Sprints"
            active={page === "sprints"}
            onClick={() => go("sprints")}
          />
          <SidebarSubRows>
            <SidebarRow
              label="Current"
              meta="6d"
              active={page === "current"}
              onClick={() => go("current")}
            />
          </SidebarSubRows>
          <SidebarRow
            icon={<Info />}
            label="About"
            active={page === "about"}
            onClick={() => go("about")}
          />
          <SidebarSection label="Pinned" count={pins.length}>
            <SidebarRowGroup>
              {[
                ...(page === LIVE.id && !livePinned ? [LIVE] : []),
                ...pins
              ].map((item) => {
                const pinned = pins.some((pin) => pin.id === item.id)
                return (
                  <SidebarRow
                    key={item.id}
                    icon={<SprintIcon state={item.state} />}
                    label={item.label}
                    meta={item.meta}
                    live={!pinned}
                    active={page === item.id}
                    highlight={landed === item.id}
                    onClick={() => go(item.id)}
                    action={
                      <SidebarRowAction
                        label={pinned ? "Unpin" : "Pin"}
                        onClick={() => toggle(item)}
                      >
                        {pinned ? <PinOff /> : <Pin />}
                      </SidebarRowAction>
                    }
                  />
                )
              })}
            </SidebarRowGroup>
            {pins.length === 0 && page !== LIVE.id ? (
              <SidebarNote>
                Open a sprint and pin it to keep it here.
              </SidebarNote>
            ) : null}
          </SidebarSection>
        </SidebarPanelBody>
      </div>
      <Button
        variant="tertiary"
        size="sm"
        disabled={page === LIVE.id}
        onClick={() => go(LIVE.id)}
      >
        Open {LIVE.label}
      </Button>
    </div>
  )
}

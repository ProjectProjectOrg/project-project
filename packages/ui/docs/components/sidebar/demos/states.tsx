import { STRONG_RING } from "@pp/shared"
import { CalendarRange, LayoutDashboard, ListChecks, Pin } from "@pp/ui/icons"
import { SidebarRailItem, SidebarRow, SidebarRowAction } from "@pp/ui/sidebar"
import type { ReactNode } from "react"

import { SprintIcon } from "./parts/marks"
import { ProjectTile, railTileItem } from "./parts/project-tile"

const TONE = STRONG_RING[11].hex

type Force = "hover" | "hover active" | "focus" | undefined

const STATES: ReadonlyArray<readonly [caption: string, force: Force]> = [
  ["Default", undefined],
  ["Hover", "hover"],
  ["Pressed", "hover active"],
  ["Focus", "focus"]
]

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      <div className="grid h-9 w-full place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function RailCell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <Cell caption={caption}>
      <div className="w-14">{children}</div>
    </Cell>
  )
}

function RowCell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="w-full">{children}</div>
      <span className="px-2.5 text-caption text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

const railGrid =
  "grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(5,minmax(0,1fr))]"

export default function States() {
  return (
    <div className="@container flex w-full flex-col gap-10">
      <div className={railGrid}>
        {STATES.map(([caption, force]) => (
          <RailCell key={caption} caption={caption}>
            <SidebarRailItem label={`Dashboard, ${caption}`} data-force={force}>
              <LayoutDashboard />
            </SidebarRailItem>
          </RailCell>
        ))}
        <RailCell caption="Active">
          <SidebarRailItem label="Dashboard, active" active>
            <LayoutDashboard />
          </SidebarRailItem>
        </RailCell>
      </div>
      <div className={railGrid}>
        {STATES.map(([caption, force]) => (
          <RailCell key={caption} caption={`Tile ${caption.toLowerCase()}`}>
            <SidebarRailItem
              label={`Atlas Mobile App, ${caption}`}
              tone={TONE}
              {...railTileItem}
              data-force={force}
            >
              <ProjectTile slug="atl" icon="🧭" color={TONE} />
            </SidebarRailItem>
          </RailCell>
        ))}
        <RailCell caption="Tile active">
          <SidebarRailItem
            label="Atlas Mobile App, active"
            tone={TONE}
            {...railTileItem}
            active
          >
            <ProjectTile slug="atl" icon="🧭" color={TONE} />
          </SidebarRailItem>
        </RailCell>
      </div>
      <div className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-x-6 gap-y-5 @lg:grid-cols-[repeat(2,minmax(0,1fr))] @3xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        {STATES.map(([caption, force]) => (
          <RowCell key={caption} caption={caption}>
            <SidebarRow
              icon={<ListChecks />}
              label="Backlog"
              data-force={force}
            />
          </RowCell>
        ))}
        <RowCell caption="Active">
          <SidebarRow icon={<CalendarRange />} label="Sprints" active />
        </RowCell>
        <RowCell caption="Hover with an action">
          <SidebarRow
            icon={<SprintIcon state="completed" />}
            label="Sprint 23"
            meta="Ended"
            data-force="hover"
            action={
              <SidebarRowAction label="Pin">
                <Pin />
              </SidebarRowAction>
            }
          />
        </RowCell>
        <RowCell caption="Live">
          <SidebarRow
            icon={<SprintIcon state="planned" />}
            label="Sprint 25"
            live
            action={
              <SidebarRowAction label="Pin">
                <Pin />
              </SidebarRowAction>
            }
          />
        </RowCell>
        <RowCell caption="Live, current page">
          <SidebarRow
            icon={<SprintIcon state="planned" />}
            label="Sprint 25"
            live
            active
            action={
              <SidebarRowAction label="Pin">
                <Pin />
              </SidebarRowAction>
            }
          />
        </RowCell>
      </div>
    </div>
  )
}

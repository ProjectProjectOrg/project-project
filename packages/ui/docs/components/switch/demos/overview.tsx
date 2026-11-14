import { Switch } from "@pp/ui/switch"
import type { ReactNode } from "react"

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full max-w-24 flex-col items-center gap-3">
      <div className="grid h-6 place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function Large() {
  return (
    <div className="flex [zoom:3] justify-center gap-10 py-2">
      <Switch aria-label="Large, off" />
      <Switch aria-label="Large, on" defaultChecked />
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Large />
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        <Cell caption="Off">
          <Switch aria-label="Off" />
        </Cell>
        <Cell caption="Hover">
          <Switch aria-label="Hover" data-force="hover" />
        </Cell>
        <Cell caption="Pressed">
          <Switch aria-label="Pressed" data-force="hover active" />
        </Cell>
        <Cell caption="Focus">
          <Switch aria-label="Focus" data-force="focus" />
        </Cell>
        <Cell caption="Loading">
          <Switch aria-label="Loading" loading />
        </Cell>
        <Cell caption="Disabled">
          <Switch aria-label="Disabled" disabled />
        </Cell>
        <Cell caption="On">
          <Switch aria-label="On" defaultChecked />
        </Cell>
        <Cell caption="On hover">
          <Switch aria-label="On hover" data-force="hover" defaultChecked />
        </Cell>
        <Cell caption="On pressed">
          <Switch
            aria-label="On pressed"
            data-force="hover active"
            defaultChecked
          />
        </Cell>
        <Cell caption="On focus">
          <Switch aria-label="On focus" data-force="focus" defaultChecked />
        </Cell>
        <Cell caption="On loading">
          <Switch aria-label="On loading" loading defaultChecked />
        </Cell>
        <Cell caption="Disabled on">
          <Switch aria-label="Disabled on" disabled defaultChecked />
        </Cell>
      </div>
    </div>
  )
}

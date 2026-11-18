import { Slider } from "@pp/ui/slider"
import { useState, type ReactNode } from "react"

function Cell({
  caption,
  force,
  children
}: Readonly<{ caption: string; force?: string; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* The pinned state goes on a box-less wrapper, so only the slider
          shows it. */}
      <div className="contents" data-force={force}>
        {children}
      </div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

const noop = () => undefined

export default function Overview() {
  const [zoom, setZoom] = useState(1.6)
  return (
    <div className="@container flex w-full flex-col gap-10">
      {/* Live: hover it, drag it, or Tab to it and use the arrow keys. */}
      <div className="mx-auto w-full max-w-md">
        <Slider
          label="Zoom"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={setZoom}
          formatValue={(value) => `${value.toFixed(2)}×`}
          endLabels={["1× · whole photo", "4× · a quarter of it"]}
        />
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 @2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Cell caption="Rest: a bar, clear of the edges">
          <Slider label="Tolerance" value={30} onChange={noop} max={60} />
        </Cell>
        <Cell caption="Hover: the Switch's thumb" force="hover">
          <Slider label="Tolerance" value={30} onChange={noop} max={60} />
        </Cell>
        <Cell caption="Dragging: 4px wider" force="hover active">
          <Slider label="Tolerance" value={30} onChange={noop} max={60} />
        </Cell>
        <Cell caption="Focus" force="focus">
          <Slider label="Tolerance" value={30} onChange={noop} max={60} />
        </Cell>
        <Cell caption="Near the end: the value makes way">
          <Slider label="Tolerance" value={57} onChange={noop} max={60} />
        </Cell>
        <Cell caption="Disabled">
          <Slider
            label="Tolerance"
            value={30}
            onChange={noop}
            max={60}
            disabled
          />
        </Cell>
      </div>
    </div>
  )
}

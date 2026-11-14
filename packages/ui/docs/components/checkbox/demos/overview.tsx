import { Checkbox } from "@pp/ui/checkbox"
import { useState, type ReactNode } from "react"

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
  const [values, setValues] = useState<ReadonlyArray<boolean>>([false, true])
  const [mixed, setMixed] = useState(true)
  return (
    <div className="flex [zoom:3] justify-center gap-10 py-2">
      {values.map((checked, index) => (
        <Checkbox
          key={index}
          aria-label={`Large ${index + 1}`}
          checked={checked}
          onCheckedChange={(next) =>
            setValues(values.map((value, i) => (i === index ? next : value)))
          }
        />
      ))}
      <Checkbox
        aria-label="Large mixed"
        checked={false}
        indeterminate={mixed}
        onCheckedChange={() => setMixed(!mixed)}
      />
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Large />
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center gap-y-6 @lg:grid-cols-[repeat(5,minmax(0,1fr))]">
        <Cell caption="Default">
          <Checkbox aria-label="Default" />
        </Cell>
        <Cell caption="Hover">
          <Checkbox aria-label="Hover" data-force="hover" />
        </Cell>
        <Cell caption="Pressed">
          <Checkbox aria-label="Pressed" data-force="hover active" />
        </Cell>
        <Cell caption="Focus">
          <Checkbox aria-label="Focus" data-force="focus" />
        </Cell>
        <Cell caption="Checked">
          <Checkbox aria-label="Checked" defaultChecked />
        </Cell>
        <Cell caption="Checked hover">
          <Checkbox
            aria-label="Checked hover"
            defaultChecked
            data-force="hover"
          />
        </Cell>
        <Cell caption="Mixed">
          <Checkbox aria-label="Mixed" indeterminate />
        </Cell>
        <Cell caption="Disabled">
          <Checkbox aria-label="Disabled" disabled />
        </Cell>
        <Cell caption="Disabled on">
          <Checkbox aria-label="Disabled on" disabled defaultChecked />
        </Cell>
      </div>
    </div>
  )
}

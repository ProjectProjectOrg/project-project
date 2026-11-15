import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  type EmptyIntensity
} from "@pp/ui/empty"
import { EyeOff, ListChecks } from "@pp/ui/icons"
import type { ReactNode } from "react"

const INTENSITIES: ReadonlyArray<EmptyIntensity> = [
  "subtle",
  "medium",
  "strong"
]

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid w-full min-w-0 gap-2">
      {children}
      <span className="text-center text-caption text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

function Small({
  intensity,
  animated
}: Readonly<{ intensity: EmptyIntensity; animated: boolean }>) {
  return (
    <Empty intensity={intensity} animated={animated} className="min-h-52">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>No tickets yet</EmptyTitle>
        <EmptyDescription>Add one from the row above.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export default function Overview() {
  return (
    <div className="@container grid w-full gap-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EyeOff strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>All columns hidden</EmptyTitle>
          <EmptyDescription>
            Every status column is hidden in View options.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" size="sm">
            Show all columns
          </Button>
        </EmptyContent>
      </Empty>

      <div className="grid grid-cols-[minmax(0,1fr)] justify-items-center gap-x-4 gap-y-6 @xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        {INTENSITIES.map((intensity) => (
          <Cell key={intensity} caption={`${intensity}, animated`}>
            <Small intensity={intensity} animated />
          </Cell>
        ))}
        {INTENSITIES.map((intensity) => (
          <Cell key={intensity} caption={`${intensity}, still`}>
            <Small intensity={intensity} animated={false} />
          </Cell>
        ))}
      </div>
    </div>
  )
}

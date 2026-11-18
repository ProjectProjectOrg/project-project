import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { ListChecks } from "@pp/ui/icons"
import { Logo } from "@pp/ui/logo"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { ProjectIcon } from "@pp/ui/project-icon"
import type { ReactNode } from "react"

function Cell({
  label,
  note,
  children
}: Readonly<{ label: string; note: string; children: ReactNode }>) {
  return (
    <figure className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-36 items-center justify-center rounded-[18px] bg-page p-4 corner-squircle">
        {children}
      </div>
      <figcaption className="flex flex-col">
        <span className="text-caption font-semibold">{label}</span>
        <span className="text-micro text-muted-foreground">{note}</span>
      </figcaption>
    </figure>
  )
}

const MEMBERS = [
  { id: "maya", name: "Maya Chen" },
  { id: "jonas", name: "Jonas Berg" },
  { id: "ines", name: "Inès Duval" },
  { id: "sam", name: "Sam Okafor" }
]

// Where the dithering lives: the brand, empty states, generated avatars
// and tiles, and one button for marketing. Never on the chrome.
export default function DitheringOverview() {
  return (
    <div className="@container grid w-full grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <Cell label="The mark" note="Two greys on the surface, Bayer-stepped">
        <Logo className="h-12" />
      </Cell>
      <Cell label="Empty states" note="A dithered well, a new seed each time">
        <Empty className="min-h-36 w-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>No tickets yet</EmptyTitle>
            <EmptyDescription>Add one from the row above.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Cell>
      <Cell
        label="Generated avatars"
        note="An orb from three of the user's colours, seeded by their id"
      >
        <div className="flex items-center gap-3">
          {MEMBERS.map((member) => (
            <span key={member.id} className="flex flex-col items-center gap-1">
              <MemberAvatar
                member={{ ...member, email: null, image: null }}
                size={40}
              />
              <span className="text-micro text-muted-foreground">
                {member.name.split(" ")[0]}
              </span>
            </span>
          ))}
        </div>
      </Cell>
      <Cell
        label="Project tiles"
        note="The same painter, in the project's colour"
      >
        <div className="flex items-center gap-3">
          {["atlas", "billing", "marketing", "design"].map((seed, index) => (
            <ProjectIcon
              key={seed}
              seed={seed}
              color={
                ["#ed7940", "#4f9cf0", "#e271b5", "#8a8f98"][index] ?? "#8a8f98"
              }
              tone={index === 3 ? "gray" : "mono"}
              size={40}
              label={seed}
            />
          ))}
        </div>
      </Cell>
      <Cell
        label="The brand button"
        note="For marketing and hero moments; the app doesn't use it"
      >
        <Button
          variant="dither"
          className="w-44 justify-start text-primary-foreground"
          ditherFrom="var(--primary)"
          ditherTo="var(--background)"
          ditherDirection="r"
          ditherStops={[0.7, 1]}
          ditherHoverStops={[0.5, 1]}
        >
          Get started
        </Button>
      </Cell>
      <Cell label="Not here" note="Controls, rows and menus stay clean">
        <div className="flex items-center gap-2">
          <Button>Save</Button>
          <Button variant="secondary">Cancel</Button>
        </div>
      </Cell>
    </div>
  )
}

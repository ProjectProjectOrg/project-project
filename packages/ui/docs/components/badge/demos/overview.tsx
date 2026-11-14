import { Badge, type BadgeTone } from "@pp/ui/badge"
import { FileText, GitMerge, GitPullRequest, Shield } from "lucide-react"
import type { ReactNode } from "react"

const TONES: ReadonlyArray<BadgeTone> = [
  "muted",
  "emerald",
  "red",
  "amber",
  "blue",
  "violet"
]

const toneLabel = (tone: string) => tone.charAt(0).toUpperCase() + tone.slice(1)

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      <div className="grid h-7 max-w-full place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function Large() {
  return (
    <div className="flex [zoom:3] flex-wrap justify-center gap-3 py-2">
      <Badge>
        <Shield strokeWidth={1.75} />
        Owner
      </Badge>
      <Badge tone="emerald">
        <GitPullRequest strokeWidth={1.75} />
        #482
      </Badge>
      <Badge tone="violet">
        <GitMerge strokeWidth={1.75} />
        #471
      </Badge>
    </div>
  )
}

const button = (label: string) => <button type="button" aria-label={label} />

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Large />
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] justify-items-center gap-y-6 @xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        {TONES.map((tone) => (
          <Cell key={tone} caption={toneLabel(tone)}>
            <Badge tone={tone}>{toneLabel(tone)}</Badge>
          </Cell>
        ))}

        <Cell caption="Button">
          <Badge tone="blue" render={button("Member")}>
            Member
          </Badge>
        </Cell>
        <Cell caption="Hover">
          <Badge tone="blue" data-force="hover" render={button("Member")}>
            Member
          </Badge>
        </Cell>
        <Cell caption="Pressed">
          <Badge
            tone="blue"
            data-force="hover active"
            render={button("Member")}
          >
            Member
          </Badge>
        </Cell>
        <Cell caption="Focus">
          <Badge tone="blue" data-force="focus" render={button("Member")}>
            Member
          </Badge>
        </Cell>
        <Cell caption="Muted hover">
          <Badge data-force="hover" render={button("Owner")}>
            Owner
          </Badge>
        </Cell>
        <Cell caption="Static hover">
          <Badge tone="blue" data-force="hover">
            Member
          </Badge>
        </Cell>

        <Cell caption="xs">
          <Badge tone="emerald" size="xs">
            <GitPullRequest strokeWidth={1.75} />
            #482
          </Badge>
        </Cell>
        <Cell caption="sm">
          <Badge tone="emerald">
            <GitPullRequest strokeWidth={1.75} />
            #482
          </Badge>
        </Cell>
        <Cell caption="md">
          <Badge tone="emerald" size="md">
            <GitPullRequest strokeWidth={1.75} />
            #482
          </Badge>
        </Cell>
        <Cell caption="Tag hue">
          <Badge tone={null} style={{ "--badge-tone": "#d946ef" }}>
            design
          </Badge>
        </Cell>
        <Cell caption="Count">
          <Badge variant="count">23</Badge>
        </Cell>
        <Cell caption="Count, active">
          <Badge variant="count" active>
            3
          </Badge>
        </Cell>

        <Cell caption="Outline">
          <Badge variant="outline" className="gap-1.5">
            <FileText strokeWidth={1.75} />
            roadmap.pdf
          </Badge>
        </Cell>
        <Cell caption="Outline hover">
          <Badge
            variant="outline"
            className="gap-1.5"
            data-force="hover"
            render={button("roadmap.pdf")}
          >
            <FileText strokeWidth={1.75} />
            roadmap.pdf
          </Badge>
        </Cell>
        <Cell caption="Outline pressed">
          <Badge
            variant="outline"
            className="gap-1.5"
            data-force="hover active"
            render={button("roadmap.pdf")}
          >
            <FileText strokeWidth={1.75} />
            roadmap.pdf
          </Badge>
        </Cell>
        <Cell caption="Outline focus">
          <Badge
            variant="outline"
            className="gap-1.5"
            data-force="focus"
            render={button("roadmap.pdf")}
          >
            <FileText strokeWidth={1.75} />
            roadmap.pdf
          </Badge>
        </Cell>
        <Cell caption="Link">
          <Badge
            tone="blue"
            size="xs"
            render={<a href="#mention" aria-label="Mention of Noor" />}
          >
            @Noor
          </Badge>
        </Cell>
        <Cell caption="Ticket">
          <Badge size="xs" className="font-mono">
            PP-214
          </Badge>
        </Cell>
      </div>
    </div>
  )
}

import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { EyeOff, FilterX, ListChecks, Plus, Trophy } from "lucide-react"
import type { ReactNode } from "react"

import { DitheredBlocks } from "../parts/dithered-blocks"
import { DitheredCalendar } from "../parts/dithered-calendar"

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

// Every full-page or panel empty state that already uses Empty, ported
// from the app with its copy.
export default function Pages() {
  return (
    <div className="@container grid w-full gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 @3xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Case caption="Backlog · no tickets yet · medium, animated">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>No tickets yet</EmptyTitle>
              <EmptyDescription>
                Type a title in the row above and press Enter. Each ticket
                becomes a markdown file under{" "}
                <span className="font-mono">tickets/</span>.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Case>
        <Case caption="Backlog · filters hide everything · medium, still">
          <Empty animated={false}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FilterX strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>No matches</EmptyTitle>
              <EmptyDescription>
                No tickets match your filters.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                leadingIcon={FilterX}
              >
                Clear all filters
              </Button>
            </EmptyContent>
          </Empty>
        </Case>
        <Case caption="Boards · every column hidden · medium, still">
          <Empty animated={false}>
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
              <Button type="button" variant="secondary" size="sm">
                Show all columns
              </Button>
            </EmptyContent>
          </Empty>
        </Case>
        <Case caption="Sprints · no sprints yet · subtle, animated">
          <Empty intensity="subtle">
            <EmptyMedia>
              <DitheredCalendar size={120} />
            </EmptyMedia>
            <EmptyTitle>No sprints yet</EmptyTitle>
            <EmptyDescription>
              Plan a span of work, drop tickets in, and let the date range carry
              the rhythm.
            </EmptyDescription>
          </Empty>
        </Case>
        <Case caption="Sprint · open, no tickets · medium, animated">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>No tickets in this sprint yet</EmptyTitle>
              <EmptyDescription>
                Add tickets from the backlog to plan this sprint.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Case>
        <Case caption="Sprint · completed, nothing finished · medium, still">
          <Empty animated={false}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>Nothing was finished in this sprint</EmptyTitle>
              <EmptyDescription>
                Unfinished tickets moved out when it was completed.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Case>
        <Case caption="Library · no types · subtle, animated">
          <Empty intensity="subtle" className="min-h-[220px]">
            <EmptyMedia className="mb-1">
              <DitheredBlocks size={88} />
            </EmptyMedia>
            <EmptyTitle className="font-['Geist_Pixel'] text-title font-normal">
              no types
            </EmptyTitle>
          </Empty>
        </Case>
      </div>

      <Case caption="Jira imports · none yet · medium, animated">
        <div className="mx-auto flex w-full max-w-[1020px] flex-col gap-8">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-display font-bold">Jira imports</h3>
              <p className="text-body text-muted-foreground">
                Jira projects you are bringing into ProjectProject.
              </p>
            </div>
            <Button leadingIcon={Plus} className="shrink-0">
              New import
            </Button>
          </div>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Bring a Jira project over</EmptyTitle>
              <EmptyDescription>
                Scan a Jira project, check how it maps, then import it as a new
                project.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <ul className="flex flex-col gap-1 text-body text-muted-foreground">
                <li>
                  Tickets, epics, sub-tickets, estimates, comments, attachments,
                  sprints and tags come across.
                </li>
                <li>
                  Jira people are matched to your members, or invited by email.
                </li>
                <li>
                  Nothing is created until you review and start the import.
                </li>
              </ul>
              <Button>New import</Button>
            </EmptyContent>
          </Empty>
        </div>
      </Case>
    </div>
  )
}

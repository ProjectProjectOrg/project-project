import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { Import, FilterX, ListChecks, Plus } from "@pp/ui/icons"
import type { ReactNode } from "react"

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
                <span className="tabular-nums">tickets/</span>.
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
              <EmptyMedia variant="icon">
                <Import strokeWidth={1.75} />
              </EmptyMedia>
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

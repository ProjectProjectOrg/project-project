import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { FolderPlus, Inbox, Plus } from "lucide-react"
import { useState, type ReactNode } from "react"

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

// The org dashboard (NewProjectCTA, EmptyTickets, EmptyRecent) and the
// projects page (EmptyProjects).
export default function Dashboard() {
  const [view, setView] = useState("list")
  return (
    <div className="@container grid w-full gap-10">
      <Case caption="Dashboard · no projects yet · strong, animated">
        <Empty intensity="strong">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlus strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>Create your first project</EmptyTitle>
            <EmptyDescription>
              Markdown-first project management. Tickets, members, and project
              context all live as files on disk — yours to grep, edit, or feed
              to an AI.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" leadingIcon={Plus}>
              Create a project
            </Button>
          </EmptyContent>
        </Empty>
      </Case>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-12">
        <Case caption="Dashboard · My tickets, nothing assigned · subtle, still">
          <section className="flex flex-col gap-3">
            <div className="flex h-9 items-center justify-between gap-3">
              <h3 className="text-title font-semibold">My tickets</h3>
              <SegmentedTabs
                aria-label="View"
                items={[
                  { key: "list", label: "List" },
                  { key: "board", label: "Board" }
                ]}
                value={view}
                onValueChange={setView}
              />
            </div>
            <Empty intensity="subtle" animated={false} className="min-h-56">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>Nothing assigned to you</EmptyTitle>
                <EmptyDescription>
                  Tickets assigned to you in any project in this organization
                  show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </section>
        </Case>
      </div>
    </div>
  )
}

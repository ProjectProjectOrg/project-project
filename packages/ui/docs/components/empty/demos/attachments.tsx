import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { Select, SelectTrigger } from "@pp/ui/select"
import { CloudOff, FilterX, FolderOpen } from "lucide-react"
import { useState, type ReactNode } from "react"

// Org settings › Storage › Files (attachments-browser): a settings panel,
// so its empty states are subtle and still.

function Case({
  where,
  children
}: Readonly<{ where: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="text-caption text-muted-foreground">{where}</span>
      {children}
    </div>
  )
}

const STATUS_ITEMS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "orphaned", label: "Orphaned" },
  { key: "pending", label: "Pending" }
] as const

// Org settings › Storage › Files: totals, the toolbar, then the table, which
// is an Empty when nothing is in the bucket (or nothing matches).
function AttachmentsBrowser({ filtered }: Readonly<{ filtered: boolean }>) {
  const [status, setStatus] = useState<string>(filtered ? "orphaned" : "all")
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-lg border border-border bg-background px-4 py-3">
        {["All", "Live", "Orphaned", "Pending"].map((label, index) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-caption text-muted-foreground">{label}</span>
            <span
              className={
                index === 0
                  ? "text-body font-semibold"
                  : "text-body text-muted-foreground"
              }
            >
              0 B across 0 objects
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          items={STATUS_ITEMS}
          value={status}
          onValueChange={setStatus}
        />
        <Select
          defaultValue="all"
          items={[{ value: "all", label: "All projects" }]}
        >
          <SelectTrigger
            placeholder="All projects"
            selectedLabel="All projects"
            aria-label="Project"
          />
        </Select>
        <Select
          defaultValue="created_desc"
          items={[{ value: "created_desc", label: "Newest first" }]}
        >
          <SelectTrigger
            placeholder="Sort"
            selectedLabel="Newest first"
            aria-label="Sort"
          />
        </Select>
      </div>
      <div>
        <Empty intensity="subtle" animated={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {filtered ? (
                <FilterX strokeWidth={1.75} />
              ) : (
                <FolderOpen strokeWidth={1.75} />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "Nothing here" : "The bucket is empty"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "No attachment matches the current filters."
                : "Attachments dropped into a ticket description will show up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <span className="text-caption text-muted-foreground">
            0–0 of 0 objects
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Attachments() {
  return (
    <div className="@container grid w-full gap-8">
      <Case where="Attachments · no bucket connected · subtle, still">
        <Empty intensity="subtle" animated={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CloudOff strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>No bucket connected</EmptyTitle>
            <EmptyDescription>
              Connect an S3-compatible bucket in storage settings before anyone
              can attach a file.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Case>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 @3xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Case where="Attachments · empty bucket · subtle, still">
          <AttachmentsBrowser filtered={false} />
        </Case>
        <Case where="Attachments · filtered to nothing · subtle, still">
          <AttachmentsBrowser filtered />
        </Case>
      </div>
    </div>
  )
}

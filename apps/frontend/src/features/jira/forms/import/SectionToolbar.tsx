import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import type { RowFilter } from "@/features/jira/lib/setup"
import { m } from "@/paraglide/messages"

export function SectionToolbar({
  filter,
  onFilter,
  attention,
  searchLabel,
  children
}: Readonly<{
  filter: RowFilter
  onFilter: (filter: RowFilter) => void
  attention: number
  searchLabel: string
  children?: ReactNode
}>) {
  return (
    <div className="flex h-7 items-center gap-2">
      <Input
        variant="compact"
        type="search"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={filter.query}
        onChange={(event) =>
          onFilter({ ...filter, query: event.currentTarget.value })
        }
        className="w-48 shrink-0"
      />
      <SegmentedTabs
        variant="inline"
        aria-label={m.jira_import_filter_label()}
        value={filter.attentionOnly ? "attention" : "all"}
        onValueChange={(key) =>
          onFilter({ ...filter, attentionOnly: key === "attention" })
        }
        items={[
          { key: "all", label: m.jira_import_filter_all() },
          {
            key: "attention",
            label: m.jira_import_filter_attention(),
            badge: attention
          }
        ]}
      />
      {children === undefined ? null : (
        <div className="-mr-3 ml-auto flex min-w-0 items-center justify-end gap-1">
          {children}
        </div>
      )}
    </div>
  )
}

import type { JiraMigrationRequirements } from "@pp/shared"
import { Ban, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRowFilter } from "@/features/jira/hooks/useRowFilter"
import type { JiraImportSetup, TagChoice } from "@/features/jira/lib/draft"
import { formatCount } from "@/features/jira/lib/format"
import {
  byImpact,
  filterRowIndexes,
  keepAllTagNames,
  rareLabelIndexes,
  setTagSkipped,
  skipTags,
  tagNeedsAttention,
  type JiraSetupCounts
} from "@/features/jira/lib/setup"
import { m } from "@/paraglide/messages"

import { MappingTable, MappingTableRow } from "./MappingTable"
import type { JiraImportForm } from "./opts"
import { SectionToolbar } from "./SectionToolbar"
import { SetupSection } from "./SetupSection"

const tagContext = (tag: JiraMigrationRequirements["tags"][number]) => {
  const kind =
    tag.source.kind === "label"
      ? m.jira_import_tags_kind_label()
      : m.jira_import_tags_kind_component()
  return tag.collisionSourceValues.length === 0
    ? kind
    : m.jira_import_tags_merges({
        kind,
        others: tag.collisionSourceValues.join(", ")
      })
}

export function TagsSection({
  form,
  requirements,
  setup,
  counts,
  open,
  onToggle,
  commit
}: Readonly<{
  form: JiraImportForm
  requirements: JiraMigrationRequirements
  setup: JiraImportSetup
  counts: JiraSetupCounts
  open: boolean
  onToggle: () => void
  commit: () => void
}>) {
  const tags = counts.tags
  const needsAttention = (index: number) => {
    const choice = setup.tags[index]
    return (
      choice !== undefined &&
      tagNeedsAttention(choice, requirements.tags[index])
    )
  }
  const { filter, setFilter, pinned } = useRowFilter(
    setup.tags.length,
    needsAttention
  )
  const rows = byImpact(
    filterRowIndexes(
      requirements.tags.length,
      filter,
      (index) => [
        requirements.tags[index]?.source.value,
        setup.tags[index]?.destinationTagName
      ],
      pinned
    ),
    (index) => requirements.tags[index]?.issueCount
  )
  const counted = requirements.tags.some((tag) => tag.issueCount !== undefined)
  const renamed = setup.tags.some(
    (tag, index) =>
      tag.destinationTagName !==
      (requirements.tags[index]?.suggestedDestinationTagName ?? "")
  )
  const rare = rareLabelIndexes(setup.tags, requirements)
  const replace = (next: ReadonlyArray<TagChoice>) => {
    form.setFieldValue("setup.tags", next)
    commit()
  }

  return (
    <SetupSection
      section="tags"
      counts={counts}
      setup={setup}
      description={m.jira_import_tags_description()}
      open={open}
      onToggle={onToggle}
    >
      <SectionToolbar
        filter={filter}
        onFilter={setFilter}
        attention={tags.attention}
        searchLabel={m.jira_import_tags_search()}
      >
        {renamed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => replace(keepAllTagNames(setup.tags, requirements))}
          >
            {m.jira_import_tags_keep_names()}
          </Button>
        ) : null}
        {rare.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => replace(skipTags(setup.tags, rare))}
          >
            {m.jira_import_tags_skip_rare({ count: rare.length })}
          </Button>
        ) : null}
      </SectionToolbar>
      <MappingTable
        sourceLabel={m.jira_import_tags_column_jira()}
        targetLabel={m.jira_import_tags_column_target()}
        countLabel={counted ? m.jira_import_column_tickets() : undefined}
        empty={rows.length === 0}
      >
        {rows.map((index) => {
          const tag = requirements.tags[index]
          if (tag === undefined) return null
          return (
            <form.Field
              key={`${tag.source.kind}:${tag.source.value}`}
              name={`setup.tags[${index}]`}
            >
              {(field) => {
                const attention = tagNeedsAttention(field.value, tag)
                const skipped = field.value.skipped === true
                const update = (next: TagChoice) => {
                  field.handleChange(next)
                  commit()
                }
                return (
                  <MappingTableRow
                    attention={attention}
                    name={tag.source.value}
                    context={tagContext(tag)}
                    count={counted ? formatCount(tag.issueCount) : undefined}
                  >
                    <span className="flex items-center gap-1">
                      {skipped ? (
                        <span className="flex h-7 min-w-0 flex-1 items-center px-2.5 text-[12px] text-muted-foreground">
                          {m.jira_import_tags_skipped()}
                        </span>
                      ) : (
                        <Input
                          variant="compact"
                          aria-label={m.jira_import_tags_name_label({
                            tag: tag.source.value
                          })}
                          aria-invalid={attention}
                          value={field.value.destinationTagName}
                          placeholder={tag.suggestedDestinationTagName ?? ""}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            update({
                              source: tag.source,
                              destinationTagName: event.currentTarget.value
                            })
                          }
                        />
                      )}
                      <Button
                        variant="quiet"
                        size="square-7"
                        aria-label={
                          skipped
                            ? m.jira_import_tags_keep({ tag: tag.source.value })
                            : m.jira_import_tags_skip({ tag: tag.source.value })
                        }
                        aria-pressed={skipped}
                        onClick={() =>
                          update(setTagSkipped(field.value, !skipped))
                        }
                      >
                        {skipped ? (
                          <Undo2 className="size-3.5" strokeWidth={1.75} />
                        ) : (
                          <Ban className="size-3.5" strokeWidth={1.75} />
                        )}
                      </Button>
                    </span>
                  </MappingTableRow>
                )
              }}
            </form.Field>
          )
        })}
      </MappingTable>
    </SetupSection>
  )
}

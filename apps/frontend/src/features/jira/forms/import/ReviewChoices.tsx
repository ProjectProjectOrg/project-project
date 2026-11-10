import type { JiraMigrationRequirements } from "@pp/shared"

import { Button } from "@/components/ui/button"
import { FactBlock, FactList, FactRow } from "@/features/jira/components/Facts"
import type { JiraImportDraft } from "@/features/jira/lib/draft"
import {
  jiraSectionSummary,
  jiraSectionTitle
} from "@/features/jira/lib/sections"
import {
  visibleSetupSections,
  type JiraSetupCounts,
  type JiraSetupSection
} from "@/features/jira/lib/setup"
import { m } from "@/paraglide/messages"

export function ChoicesBlock({
  requirements,
  counts,
  draft,
  onChangeSection
}: Readonly<{
  requirements: JiraMigrationRequirements
  counts: JiraSetupCounts
  draft: JiraImportDraft
  onChangeSection: (section: JiraSetupSection) => void
}>) {
  return (
    <FactBlock title={m.jira_import_review_choices_title()}>
      <FactList>
        {visibleSetupSections(requirements).map((section) => (
          <FactRow
            key={section}
            label={jiraSectionTitle(section)}
            action={
              <Button
                variant="ghost"
                size="xs"
                bleed="end"
                onClick={() => onChangeSection(section)}
              >
                {m.jira_import_action_change()}
              </Button>
            }
          >
            <span className="block truncate">
              {jiraSectionSummary(section, counts, draft.setup)}
            </span>
          </FactRow>
        ))}
      </FactList>
    </FactBlock>
  )
}

import { ChevronRight, CircleAlert } from "lucide-react"
import { motion } from "motion/react"
import type { ReactNode } from "react"

import { AutoHeight } from "@/components/ui/auto-height"
import type { JiraImportSetup } from "@/features/jira/lib/draft"
import {
  jiraSectionSummary,
  jiraSectionTitle
} from "@/features/jira/lib/sections"
import {
  jiraSetupSectionId,
  sectionAttention,
  type JiraSetupCounts,
  type JiraSetupSection
} from "@/features/jira/lib/setup"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function SetupSection({
  section,
  counts,
  setup,
  description,
  open,
  onToggle,
  children
}: Readonly<{
  section: JiraSetupSection
  counts: JiraSetupCounts
  setup: JiraImportSetup
  description?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}>) {
  const attention = sectionAttention(counts, section)
  const bodyId = `${jiraSetupSectionId(section)}-body`
  return (
    <section
      id={jiraSetupSectionId(section)}
      className="scroll-mt-4 border-b border-border last:border-b-0"
    >
      <div className="sticky top-0 z-20 -mx-3 bg-region px-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="grid h-11 w-full cursor-pointer grid-cols-[1.75rem_auto_minmax(0,1fr)] items-center rounded-lg pr-2 text-left transition-colors hover:bg-hover active:bg-active"
        >
          <motion.span
            className="flex justify-center text-muted-foreground"
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={spring.fast}
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </motion.span>
          <span className="text-[13px] font-medium text-foreground">
            {jiraSectionTitle(section)}
          </span>
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 pl-2 text-[13px]",
              attention > 0 ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {attention > 0 ? (
              <CircleAlert className="size-3.5 shrink-0" strokeWidth={1.75} />
            ) : null}
            <span className="truncate">
              {attention > 0
                ? m.jira_import_setup_attention({ count: attention })
                : jiraSectionSummary(section, counts, setup)}
            </span>
          </span>
        </button>
      </div>
      <AutoHeight className="overflow-clip">
        {open ? (
          <div id={bodyId} className="flex flex-col gap-3 pt-1 pb-5 pl-7">
            {description === undefined ? null : (
              <p className="max-w-[65ch] text-xs text-muted-foreground">
                {description}
              </p>
            )}
            {children}
          </div>
        ) : null}
      </AutoHeight>
    </section>
  )
}

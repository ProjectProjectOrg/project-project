import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import { Plus } from "lucide-react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { LibraryContext } from "@/features/editor/lib/blockChrome"
import { m } from "@/paraglide/messages"

import { libraryView, type LibraryScope } from "../atoms/libraryScope"
import { useLibraryPermissions } from "../hooks/useLibraryPermissions"
import { creatableLayers } from "../lib/entryStanding"
import { LibraryNewLink } from "./LibraryEntryLink"
import { OrgSectionList, OrgTypeList } from "./OrgEntryList"
import { ProjectSectionGroups, ProjectTypeGroups } from "./ProjectEntryGroups"
import { noticeText } from "./ScopeBox"

export type LibraryTab = "types" | "sections"

type TicketTypesPageProps = Readonly<{
  scope: LibraryScope
  tab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
}>

export function TicketTypesPage({
  scope,
  tab,
  onTabChange
}: TicketTypesPageProps) {
  const result = useAtomValue(libraryView(scope))
  const items: ReadonlyArray<SegmentedItem<LibraryTab>> = [
    { key: "types", label: m.templates_types_tab_types() },
    { key: "sections", label: m.templates_types_tab_sections() }
  ]
  const tabs = (
    <SegmentedTabs items={items} value={tab} onValueChange={onTabChange} />
  )

  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <div className="flex w-full flex-col gap-6">
          <div className="flex">{tabs}</div>
          <LibrarySkeleton />
        </div>
      )}
      onSuccess={({ value }) => (
        <LibraryContext value={value}>
          <LibraryContent scope={scope} tab={tab} library={value} tabs={tabs} />
        </LibraryContext>
      )}
    />
  )
}

function LibraryContent({
  scope,
  tab,
  library,
  tabs
}: Readonly<{
  scope: LibraryScope
  tab: LibraryTab
  library: Library
  tabs: React.ReactNode
}>) {
  const permissions = useLibraryPermissions(scope, library)
  const kind = tab === "types" ? "type" : "section"
  const canCreate = creatableLayers(scope.layer, permissions).length > 0
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs}
        {canCreate ? (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={Plus}
            render={<LibraryNewLink scope={scope} kind={kind} />}
          >
            {kind === "type"
              ? m.templates_types_new_type()
              : m.templates_types_new_section()}
          </Button>
        ) : (
          <p className="text-caption text-muted-foreground">
            {noticeText(
              scope.layer === "org" ? "org-admins" : "project-managers",
              kind
            )}
          </p>
        )}
      </div>
      <p className="-mt-2 max-w-2xl text-body text-muted-foreground">
        {tab === "types"
          ? m.templates_types_tab_types_intro()
          : m.templates_types_tab_sections_intro()}
      </p>
      {scope.layer === "org" ? (
        tab === "types" ? (
          <OrgTypeList scope={scope} library={library} />
        ) : (
          <OrgSectionList scope={scope} library={library} />
        )
      ) : tab === "types" ? (
        <ProjectTypeGroups
          scope={scope}
          library={library}
          permissions={permissions}
        />
      ) : (
        <ProjectSectionGroups
          scope={scope}
          library={library}
          permissions={permissions}
        />
      )}
    </div>
  )
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

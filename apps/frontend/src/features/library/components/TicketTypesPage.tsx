import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { LibraryContext } from "@pp/ui/editor/blocks/block-chrome"
import { Plus } from "@pp/ui/icons"
import { SegmentedTabs, type SegmentedItem } from "@pp/ui/segmented-tabs"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
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
          <SettingsSkeleton rows={4} />
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
          <OrgTypeList scope={scope} library={library} canCreate={canCreate} />
        ) : (
          <OrgSectionList
            scope={scope}
            library={library}
            canCreate={canCreate}
          />
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

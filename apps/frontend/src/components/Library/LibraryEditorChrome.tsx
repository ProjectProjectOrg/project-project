import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

import type { SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { m } from "@/paraglide/messages"

import { LibraryBackLink } from "./LibraryEntryLink"
import type { LibraryKind } from "./libraryModel"
import type { LibraryScope } from "./libraryScope"

export type EditorTab = "edit" | "preview"

export function LibraryEditorHeader({
  scope,
  kind,
  status,
  tab,
  onTabChange
}: Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  status: SaveStatus
  tab?: EditorTab
  onTabChange?: (tab: EditorTab) => void
}>) {
  const items: ReadonlyArray<SegmentedItem<EditorTab>> = [
    { key: "edit", label: m.templates_editor_tab_edit() },
    { key: "preview", label: m.templates_editor_tab_preview() }
  ]
  return (
    <div className="flex items-center justify-between gap-3">
      <LibraryBackLink
        scope={scope}
        kind={kind}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-all duration-100 hover:bg-accent hover:text-foreground active:scale-[0.97]"
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.75} />
        {kind === "template"
          ? m.templates_settings_back_templates()
          : m.templates_settings_back_blocks()}
      </LibraryBackLink>
      <div className="flex items-center gap-3">
        <MarkdownSaveIndicator status={status} />
        {tab === undefined || onTabChange === undefined ? null : (
          <SegmentedTabs
            items={items}
            isActive={(key) => key === tab}
            renderItem={(item, content, { active }) => (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onTabChange(item.key)}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                {content}
              </button>
            )}
          />
        )}
      </div>
    </div>
  )
}

export function LibraryEditorLayout({
  header,
  title,
  error,
  main,
  aside
}: Readonly<{
  header: ReactNode
  title: ReactNode
  error: string | null
  main: ReactNode
  aside: ReactNode
}>) {
  return (
    <div className="flex w-full flex-col gap-4">
      {header}
      {title}
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-3">{main}</div>
        <aside className="flex flex-col gap-4 lg:border-l lg:border-border/60 lg:pl-5">
          {aside}
        </aside>
      </div>
    </div>
  )
}

export function LibraryEditorSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export function LibraryEntryMissing() {
  return (
    <p className="text-sm text-muted-foreground">
      {m.templates_settings_entry_missing()}
    </p>
  )
}

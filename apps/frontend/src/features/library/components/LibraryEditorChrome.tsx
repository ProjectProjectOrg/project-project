import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

import type { SaveStatus } from "@/features/editor/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
import { m } from "@/paraglide/messages"

import type { LibraryScope } from "../atoms/libraryScope"
import type { LibraryKind } from "../lib/libraryModel"
import { LibraryListLink } from "./LibraryEntryLink"

export const combinedStatus = (
  editor: SaveStatus,
  save: SaveStatus
): SaveStatus => {
  if (save === "saving") return "saving"
  if (editor === "dirty") return "dirty"
  return save === "idle" ? editor : save
}

export function LibraryEditorHeader({
  scope,
  kind,
  status = "idle"
}: Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  status?: SaveStatus
}>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <LibraryListLink
        scope={scope}
        kind={kind}
        className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-body text-muted-foreground transition-all duration-100 hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.75} />
        {kind === "type"
          ? m.templates_types_back_types()
          : m.templates_types_back_sections()}
      </LibraryListLink>
      <MarkdownSaveIndicator status={status} />
    </div>
  )
}

export function LibraryEditorLayout({
  header,
  notice,
  title,
  error,
  main,
  aside
}: Readonly<{
  header: ReactNode
  notice?: ReactNode
  title: ReactNode
  error: string | null
  main: ReactNode
  aside: ReactNode
}>) {
  return (
    <div className="flex w-full flex-col gap-4">
      {header}
      {notice}
      {title}
      {error === null ? null : (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-3">{main}</div>
        <aside className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-border/60 lg:pl-5">
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

export function LibraryEntryFrame({
  scope,
  kind,
  children
}: Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  children: ReactNode
}>) {
  return (
    <div className="flex w-full flex-col gap-4">
      <LibraryEditorHeader scope={scope} kind={kind} />
      {children}
    </div>
  )
}

export function LibraryEntryMissing() {
  return (
    <p className="text-body text-muted-foreground">
      {m.templates_settings_entry_missing()}
    </p>
  )
}

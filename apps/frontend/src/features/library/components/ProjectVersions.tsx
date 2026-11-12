import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { m } from "@/paraglide/messages"

import { projectScope } from "../atoms/libraryScope"
import { libraryUsage, libraryUsageRequest } from "../atoms/libraryUsage"
import type { LibraryKind } from "../lib/libraryModel"
import { entryUsage, type UsageProject } from "../lib/orgUsage"
import { AsideGroup, MUTED_VALUE_CLASS } from "./DefinitionAside"
import { LibraryEntryLink, LibraryListLink } from "./LibraryEntryLink"
import { asIsText } from "./OrgEntryList"
import { ProjectChip } from "./ProjectChip"

const LINK_CLASS =
  "-mx-1.5 inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-body transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"

export function ProjectVersions({
  orgSlug,
  kind,
  entryKey
}: Readonly<{ orgSlug: string; kind: LibraryKind; entryKey: string }>) {
  const usage = useAtomValue(libraryUsage(libraryUsageRequest(orgSlug)))
  if (!AsyncResult.isSuccess(usage) || !usage.value.complete) return null
  const use = entryUsage(usage.value.libraries, kind, entryKey)
  return (
    <AsideGroup heading={m.templates_types_projects_heading()}>
      <span className={MUTED_VALUE_CLASS}>{asIsText(use)}</span>
      <ProjectList
        label={m.templates_types_projects_own()}
        projects={use.changedIn}
        link={(project, children) => (
          <LibraryEntryLink
            scope={projectScope(orgSlug, project.slug)}
            kind={kind}
            entryKey={entryKey}
            className={LINK_CLASS}
          >
            {children}
          </LibraryEntryLink>
        )}
        orgSlug={orgSlug}
      />
      <ProjectList
        label={m.templates_types_projects_off()}
        projects={use.hiddenIn}
        link={(project, children) => (
          <LibraryListLink
            scope={projectScope(orgSlug, project.slug)}
            kind={kind}
            className={LINK_CLASS}
          >
            {children}
          </LibraryListLink>
        )}
        orgSlug={orgSlug}
      />
    </AsideGroup>
  )
}

function ProjectList({
  label,
  projects,
  link,
  orgSlug
}: Readonly<{
  label: string
  projects: ReadonlyArray<UsageProject>
  link: (project: UsageProject, children: ReactNode) => ReactNode
  orgSlug: string
}>) {
  if (projects.length === 0) return null
  return (
    <MetaRow label={label}>
      <ul className="flex flex-col gap-0.5">
        {projects.map((project) => (
          <li key={project.slug} className="min-w-0">
            {link(
              project,
              <ProjectChip scope={projectScope(orgSlug, project.slug)} />
            )}
          </li>
        ))}
      </ul>
    </MetaRow>
  )
}

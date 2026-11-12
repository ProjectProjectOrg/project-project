import * as Exit from "effect/Exit"
import { Building2, EyeOff, Folder, Lock } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { orgScope, type LibraryScope } from "../atoms/libraryScope"
import type { EntryNotice, EntryView } from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { LibraryEntryLink } from "./LibraryEntryLink"

type Outcome = Exit.Exit<unknown, unknown>

export type ScopeActions = Readonly<{
  fork: () => Promise<Outcome>
  restore: () => Promise<Outcome>
  waiting: boolean
  error: string | null
}>

type ScopeBoxProps = Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  entry: Readonly<{ key: string; name: string }>
  view: EntryView
  actions: ScopeActions
}>

type Copy = Readonly<{
  icon: ReactNode
  title: string | null
  body: string | null
}>

export const noticeText = (
  notice: EntryNotice,
  kind: LibraryKind
): string | null => {
  if (notice === null) return null
  if (notice === "org-admins")
    return kind === "type"
      ? m.templates_types_notice_org_admins()
      : m.templates_sections_notice_org_admins()
  return kind === "type"
    ? m.templates_types_notice_project_managers()
    : m.templates_sections_notice_project_managers()
}

const upstreamNotice = ({
  scope,
  kind,
  view
}: ScopeBoxProps): string | null => {
  if (scope.layer === "project" && view.standing === "shared")
    return view.notice === "org-admins"
      ? m.templates_types_notice_all_projects()
      : noticeText(view.notice, kind)
  return noticeText(view.notice, kind)
}

const sharedBody = (view: EntryView): string => {
  if (view.canEditUpstream) return m.templates_types_shared_body()
  return view.canFork
    ? m.templates_types_shared_body_fork_only()
    : m.templates_types_shared_body_read_only()
}

const copyFor = ({ scope, kind, entry, view }: ScopeBoxProps): Copy => {
  const name = entry.name
  const quiet = "mt-0.5 size-4 shrink-0 text-muted-foreground"
  const changed = "mt-0.5 size-4 shrink-0 text-state-warning"
  if (view.standing === "hidden")
    return {
      icon: <EyeOff aria-hidden className={quiet} />,
      title: m.templates_types_hidden_title(),
      body:
        kind === "type"
          ? m.templates_types_hidden_body()
          : m.templates_sections_hidden_body()
    }
  if (scope.layer === "project") {
    if (view.standing === "shared")
      return {
        icon: <Lock aria-hidden className={quiet} />,
        title: m.templates_types_shared_title({ name }),
        body: sharedBody(view)
      }
    if (view.standing === "changed")
      return {
        icon: <Folder aria-hidden className={changed} />,
        title: m.templates_types_changed_title(),
        body:
          kind === "type"
            ? m.templates_types_changed_body({ name })
            : m.templates_sections_changed_body()
      }
    return {
      icon: <Folder aria-hidden className={quiet} />,
      title: null,
      body: null
    }
  }
  if (view.standing === "shared")
    return {
      icon: <Lock aria-hidden className={quiet} />,
      title: m.templates_types_builtin_title({ name }),
      body: view.canFork
        ? m.templates_types_builtin_body()
        : m.templates_types_builtin_body_read_only()
    }
  if (view.standing === "changed")
    return {
      icon: <Building2 aria-hidden className={changed} />,
      title: m.templates_types_org_changed_title(),
      body:
        kind === "type"
          ? m.templates_types_org_changed_body({ name })
          : m.templates_sections_org_changed_body()
    }
  return {
    icon: <Building2 aria-hidden className={quiet} />,
    title: null,
    body: null
  }
}

export function ScopeBox(props: ScopeBoxProps) {
  const { scope, kind, entry, view, actions } = props
  const copy = copyFor(props)
  const notice = upstreamNotice(props)
  const hasActions =
    view.canFork || view.canEditUpstream || view.canRevert || view.canShow
  if (copy.title === null && notice === null) return null

  return (
    <div
      data-scope-box={view.standing}
      className="flex gap-3 rounded-lg border border-border bg-card p-4"
    >
      {copy.icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {copy.title === null ? null : (
          <p className="text-body font-semibold">{copy.title}</p>
        )}
        {copy.body === null ? null : (
          <p className="text-body text-muted-foreground">{copy.body}</p>
        )}
        {notice === null ? null : (
          <p className="text-body text-muted-foreground">{notice}</p>
        )}
        {hasActions ? (
          <div
            className={cn(
              "mt-2 flex flex-wrap items-center gap-2",
              actions.waiting && "animate-pulse"
            )}
          >
            {view.canFork ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={actions.waiting}
                onClick={() => void actions.fork()}
              >
                {scope.layer === "project"
                  ? m.templates_types_fork_project()
                  : m.templates_types_fork_org()}
              </Button>
            ) : null}
            {view.canEditUpstream ? (
              <Button
                variant="tertiary"
                size="sm"
                render={
                  <LibraryEntryLink
                    scope={orgScope(scope.req.params.orgSlug)}
                    kind={kind}
                    entryKey={entry.key}
                  />
                }
              >
                {m.templates_types_edit_all_projects()}
              </Button>
            ) : null}
            {view.canShow ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={actions.waiting}
                onClick={() => void actions.restore()}
              >
                {m.templates_types_show_again()}
              </Button>
            ) : null}
            {view.canRevert ? (
              <ConfirmButton.Root className="flex-wrap gap-2">
                <ConfirmButton.Trigger
                  type="button"
                  variant="tertiary"
                  size="sm"
                >
                  {scope.layer === "project"
                    ? m.templates_types_revert_project()
                    : m.templates_types_revert_org()}
                </ConfirmButton.Trigger>
                <ConfirmButton.Confirm className="flex-wrap">
                  <ConfirmButton.Action
                    prompt={
                      scope.layer === "project"
                        ? m.templates_types_revert_project_confirm()
                        : m.templates_types_revert_org_confirm()
                    }
                    label={m.templates_types_revert_confirm_label()}
                    onConfirm={() => actions.restore().then(Exit.isSuccess)}
                  />
                </ConfirmButton.Confirm>
              </ConfirmButton.Root>
            ) : null}
          </div>
        ) : null}
        {actions.error === null ? null : (
          <p role="alert" className="text-caption text-destructive">
            {actions.error}
          </p>
        )}
      </div>
    </div>
  )
}

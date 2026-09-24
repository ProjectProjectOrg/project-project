import { Link, useNavigate } from "@tanstack/react-router"
import { useCallback, type ReactNode } from "react"

import type { LibraryKind } from "./libraryModel"
import type { LibraryScope } from "./libraryScope"

type EntryLinkProps = Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  entryKey: string
  className?: string
  "aria-label"?: string
  children?: ReactNode
}>

export function LibraryEntryLink({
  scope,
  kind,
  entryKey,
  className,
  children,
  ...rest
}: EntryLinkProps) {
  const label = rest["aria-label"]
  if (scope.layer === "org")
    return kind === "template" ? (
      <Link
        to="/orgs/$orgSlug/settings/templates/$templateKey"
        params={{ ...scope.req.params, templateKey: entryKey }}
        className={className}
        aria-label={label}
      >
        {children}
      </Link>
    ) : (
      <Link
        to="/orgs/$orgSlug/settings/templates/blocks/$blockKey"
        params={{ ...scope.req.params, blockKey: entryKey }}
        className={className}
        aria-label={label}
      >
        {children}
      </Link>
    )
  return kind === "template" ? (
    <Link
      to="/orgs/$orgSlug/projects/$slug/settings/templates/$templateKey"
      params={{ ...scope.req.params, templateKey: entryKey }}
      className={className}
      aria-label={label}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/orgs/$orgSlug/projects/$slug/settings/templates/blocks/$blockKey"
      params={{ ...scope.req.params, blockKey: entryKey }}
      className={className}
      aria-label={label}
    >
      {children}
    </Link>
  )
}

export function useOpenEntry(scope: LibraryScope) {
  const navigate = useNavigate()
  return useCallback(
    (kind: LibraryKind, entryKey: string) => {
      if (scope.layer === "org") {
        if (kind === "template")
          void navigate({
            to: "/orgs/$orgSlug/settings/templates/$templateKey",
            params: { ...scope.req.params, templateKey: entryKey }
          })
        else
          void navigate({
            to: "/orgs/$orgSlug/settings/templates/blocks/$blockKey",
            params: { ...scope.req.params, blockKey: entryKey }
          })
        return
      }
      if (kind === "template")
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/templates/$templateKey",
          params: { ...scope.req.params, templateKey: entryKey }
        })
      else
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/templates/blocks/$blockKey",
          params: { ...scope.req.params, blockKey: entryKey }
        })
    },
    [navigate, scope]
  )
}

export function LibraryBackLink({
  scope,
  kind,
  className,
  children
}: Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  className?: string
  children: ReactNode
}>) {
  const search = kind === "block" ? { tab: "blocks" as const } : {}
  return scope.layer === "org" ? (
    <Link
      to="/orgs/$orgSlug/settings/templates"
      params={scope.req.params}
      search={search}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/orgs/$orgSlug/projects/$slug/settings/templates"
      params={scope.req.params}
      search={search}
      className={className}
    >
      {children}
    </Link>
  )
}

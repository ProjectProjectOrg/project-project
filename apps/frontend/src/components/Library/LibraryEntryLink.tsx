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
  entryKey,
  className,
  children,
  ...rest
}: EntryLinkProps) {
  const label = rest["aria-label"]
  return scope.layer === "org" ? (
    <Link
      to="/orgs/$orgSlug/settings/templates/blocks/$blockKey"
      params={{ ...scope.req.params, blockKey: entryKey }}
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
    (_kind: LibraryKind, entryKey: string) => {
      if (scope.layer === "org")
        void navigate({
          to: "/orgs/$orgSlug/settings/templates/blocks/$blockKey",
          params: { ...scope.req.params, blockKey: entryKey }
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
  className,
  children
}: Readonly<{
  scope: LibraryScope
  kind: LibraryKind
  className?: string
  children: ReactNode
}>) {
  return scope.layer === "org" ? (
    <Link
      to="/orgs/$orgSlug/settings/templates"
      params={scope.req.params}
      className={className}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/orgs/$orgSlug/projects/$slug/settings/templates"
      params={scope.req.params}
      className={className}
    >
      {children}
    </Link>
  )
}

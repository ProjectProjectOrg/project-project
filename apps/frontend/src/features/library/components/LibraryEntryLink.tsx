import { Link, useNavigate } from "@tanstack/react-router"
import { useCallback, type ComponentProps } from "react"

import type { LibraryScope } from "../atoms/libraryScope"
import type { LibraryKind } from "../lib/libraryModel"

type LinkChrome = Omit<ComponentProps<"a">, "href">

type EntryLinkProps = LinkChrome &
  Readonly<{
    scope: LibraryScope
    kind: LibraryKind
    entryKey: string
  }>

export function LibraryEntryLink({
  scope,
  kind,
  entryKey,
  ...rest
}: EntryLinkProps) {
  if (scope.layer === "org")
    return kind === "type" ? (
      <Link
        {...rest}
        to="/orgs/$orgSlug/settings/types/$typeKey"
        params={{ ...scope.req.params, typeKey: entryKey }}
      />
    ) : (
      <Link
        {...rest}
        to="/orgs/$orgSlug/settings/types/sections/$sectionKey"
        params={{ ...scope.req.params, sectionKey: entryKey }}
      />
    )
  return kind === "type" ? (
    <Link
      {...rest}
      to="/orgs/$orgSlug/projects/$slug/settings/types/$typeKey"
      params={{ ...scope.req.params, typeKey: entryKey }}
    />
  ) : (
    <Link
      {...rest}
      to="/orgs/$orgSlug/projects/$slug/settings/types/sections/$sectionKey"
      params={{ ...scope.req.params, sectionKey: entryKey }}
    />
  )
}

export function useOpenEntry() {
  const navigate = useNavigate()
  return useCallback(
    (scope: LibraryScope, kind: LibraryKind, entryKey: string) => {
      if (scope.layer === "org") {
        if (kind === "type")
          void navigate({
            to: "/orgs/$orgSlug/settings/types/$typeKey",
            params: { ...scope.req.params, typeKey: entryKey }
          })
        else
          void navigate({
            to: "/orgs/$orgSlug/settings/types/sections/$sectionKey",
            params: { ...scope.req.params, sectionKey: entryKey }
          })
        return
      }
      if (kind === "type")
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/types/$typeKey",
          params: { ...scope.req.params, typeKey: entryKey }
        })
      else
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/types/sections/$sectionKey",
          params: { ...scope.req.params, sectionKey: entryKey }
        })
    },
    [navigate]
  )
}

type ListLinkProps = LinkChrome &
  Readonly<{ scope: LibraryScope; kind: LibraryKind }>

const searchFor = (kind: LibraryKind) =>
  kind === "section" ? { tab: "sections" as const } : {}

export function LibraryListLink({ scope, kind, ...rest }: ListLinkProps) {
  return scope.layer === "org" ? (
    <Link
      {...rest}
      to="/orgs/$orgSlug/settings/types"
      params={scope.req.params}
      search={searchFor(kind)}
    />
  ) : (
    <Link
      {...rest}
      to="/orgs/$orgSlug/projects/$slug/settings/types"
      params={scope.req.params}
      search={searchFor(kind)}
    />
  )
}

export function useOpenList() {
  const navigate = useNavigate()
  return useCallback(
    (scope: LibraryScope, kind: LibraryKind) => {
      if (scope.layer === "org")
        void navigate({
          to: "/orgs/$orgSlug/settings/types",
          params: scope.req.params,
          search: searchFor(kind)
        })
      else
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/types",
          params: scope.req.params,
          search: searchFor(kind)
        })
    },
    [navigate]
  )
}

export function LibraryNewLink({ scope, kind, ...rest }: ListLinkProps) {
  if (scope.layer === "org")
    return kind === "type" ? (
      <Link
        {...rest}
        to="/orgs/$orgSlug/settings/types/new"
        params={scope.req.params}
      />
    ) : (
      <Link
        {...rest}
        to="/orgs/$orgSlug/settings/types/sections/new"
        params={scope.req.params}
      />
    )
  return kind === "type" ? (
    <Link
      {...rest}
      to="/orgs/$orgSlug/projects/$slug/settings/types/new"
      params={scope.req.params}
    />
  ) : (
    <Link
      {...rest}
      to="/orgs/$orgSlug/projects/$slug/settings/types/sections/new"
      params={scope.req.params}
    />
  )
}

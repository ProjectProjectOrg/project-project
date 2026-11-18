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
        to="/settings/orgs/$orgSlug/types/$typeKey"
        params={{ ...scope.req.params, typeKey: entryKey }}
      />
    ) : (
      <Link
        {...rest}
        to="/settings/orgs/$orgSlug/types/sections/$sectionKey"
        params={{ ...scope.req.params, sectionKey: entryKey }}
      />
    )
  return kind === "type" ? (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types/$typeKey"
      params={{ ...scope.req.params, typeKey: entryKey }}
    />
  ) : (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types/sections/$sectionKey"
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
            to: "/settings/orgs/$orgSlug/types/$typeKey",
            params: { ...scope.req.params, typeKey: entryKey }
          })
        else
          void navigate({
            to: "/settings/orgs/$orgSlug/types/sections/$sectionKey",
            params: { ...scope.req.params, sectionKey: entryKey }
          })
        return
      }
      if (kind === "type")
        void navigate({
          to: "/settings/orgs/$orgSlug/projects/$slug/types/$typeKey",
          params: { ...scope.req.params, typeKey: entryKey }
        })
      else
        void navigate({
          to: "/settings/orgs/$orgSlug/projects/$slug/types/sections/$sectionKey",
          params: { ...scope.req.params, sectionKey: entryKey }
        })
    },
    [navigate]
  )
}

type ListLinkProps = LinkChrome &
  Readonly<{ scope: LibraryScope; kind: LibraryKind }>

export function LibraryListLink({ scope, kind, ...rest }: ListLinkProps) {
  if (scope.layer === "org")
    return kind === "type" ? (
      <Link
        {...rest}
        to="/settings/orgs/$orgSlug/types"
        params={scope.req.params}
      />
    ) : (
      <Link
        {...rest}
        to="/settings/orgs/$orgSlug/types/sections"
        params={scope.req.params}
      />
    )
  return kind === "type" ? (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types"
      params={scope.req.params}
    />
  ) : (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types/sections"
      params={scope.req.params}
    />
  )
}

export function useOpenList() {
  const navigate = useNavigate()
  return useCallback(
    (scope: LibraryScope, kind: LibraryKind) => {
      if (scope.layer === "org") {
        if (kind === "type")
          void navigate({
            to: "/settings/orgs/$orgSlug/types",
            params: scope.req.params
          })
        else
          void navigate({
            to: "/settings/orgs/$orgSlug/types/sections",
            params: scope.req.params
          })
        return
      }
      if (kind === "type")
        void navigate({
          to: "/settings/orgs/$orgSlug/projects/$slug/types",
          params: scope.req.params
        })
      else
        void navigate({
          to: "/settings/orgs/$orgSlug/projects/$slug/types/sections",
          params: scope.req.params
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
        to="/settings/orgs/$orgSlug/types/new"
        params={scope.req.params}
      />
    ) : (
      <Link
        {...rest}
        to="/settings/orgs/$orgSlug/types/sections/new"
        params={scope.req.params}
      />
    )
  return kind === "type" ? (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types/new"
      params={scope.req.params}
    />
  ) : (
    <Link
      {...rest}
      to="/settings/orgs/$orgSlug/projects/$slug/types/sections/new"
      params={scope.req.params}
    />
  )
}

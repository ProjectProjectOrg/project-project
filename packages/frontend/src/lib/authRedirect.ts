type AuthedRouteRedirect =
  | { to: "/welcome" }
  | { to: "/orgs/$orgSlug"; params: { orgSlug: string } }

export function authedRouteRedirect(
  pathname: string,
  activeOrgSlug: string | null
): AuthedRouteRedirect | null {
  if (!activeOrgSlug) return { to: "/welcome" }

  if (pathname !== "/") return null

  return {
    to: "/orgs/$orgSlug",
    params: { orgSlug: activeOrgSlug }
  }
}

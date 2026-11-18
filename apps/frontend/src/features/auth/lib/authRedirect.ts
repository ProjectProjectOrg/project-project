type AuthedRouteRedirect =
  | { to: "/welcome" }
  | { to: "/orgs/$orgSlug"; params: { orgSlug: string } }

export function authedRouteRedirect(
  pathname: string,
  activeOrgSlug: string | null
) {
  if (!activeOrgSlug) return { to: "/welcome" } satisfies AuthedRouteRedirect

  if (pathname !== "/") return null

  return {
    to: "/orgs/$orgSlug",
    params: { orgSlug: activeOrgSlug }
  } satisfies AuthedRouteRedirect
}

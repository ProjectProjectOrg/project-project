type AuthedRootRedirect =
  | { to: "/welcome" }
  | { to: "/orgs/$orgSlug"; params: { orgSlug: string } }

export function authedRootRedirect(
  pathname: string,
  activeOrgSlug: string | null
): AuthedRootRedirect | null {
  if (pathname !== "/") return null
  if (!activeOrgSlug) return { to: "/welcome" }
  return {
    to: "/orgs/$orgSlug",
    params: { orgSlug: activeOrgSlug }
  }
}

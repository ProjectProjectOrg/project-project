import type { Org } from "@projectproject/shared"

export const nextActiveOrgSlug = (
  orgs: ReadonlyArray<Org>,
  removedSlug: string
): string | null => {
  const remaining = orgs.filter((org) => org.slug !== removedSlug)
  return remaining[0]?.slug ?? null
}

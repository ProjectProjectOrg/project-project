export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  "www",
  "api",
  "app",
  "admin",
  "auth",
  "mail",
  "static",
  "cdn",
  "_admin",
  "onboarding",
  "login",
  "logout",
  "signup",
  "mcp",
  "orgs",
  "projects",
  "invite",
  "invitations",
  "settings"
])

export type OrgSlugIssue =
  | "empty"
  | "too-long"
  | "invalid-chars"
  | "leading-or-trailing-dash"
  | "reserved"

export function validateOrgSlug(slug: string): OrgSlugIssue | null {
  if (slug.length === 0) return "empty"
  if (slug.length > 63) return "too-long"
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "leading-or-trailing-dash"
  }
  if (!ORG_SLUG_PATTERN.test(slug)) return "invalid-chars"
  if (RESERVED_ORG_SLUGS.has(slug)) return "reserved"
  return null
}

export function suggestOrgSlugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

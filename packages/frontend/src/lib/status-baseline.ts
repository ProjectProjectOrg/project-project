import { BASELINE_STATUS_SLUGS } from "@projectproject/shared"

const SET = new Set<string>(BASELINE_STATUS_SLUGS)

export function isBaselineStatus(slug: string): boolean {
  return SET.has(slug)
}

import { BASELINE_STATUS_SLUGS } from "./schemas/Status"

const BASELINE_SET: ReadonlySet<string> = new Set(BASELINE_STATUS_SLUGS)

export function deriveStatusSlug(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
}

export function isReservedStatusSlug(slug: string): boolean {
  return BASELINE_SET.has(slug)
}

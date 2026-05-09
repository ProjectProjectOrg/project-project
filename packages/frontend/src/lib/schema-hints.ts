import { m } from "@/paraglide/messages"

export const SCHEMA_HINTS: Record<string, () => string> = {
  TagName: m.tags_name_validation_hint
}

import type { KeyLabels } from "@pp/ui/command-menu"
import { keyLabelsFrom } from "@pp/ui/lib/keyLabels"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const labels = new Map<ReturnType<typeof getLocale>, KeyLabels>()

export const keyLabels = () => {
  const locale = getLocale()
  const cached = labels.get(locale)
  if (cached) return cached
  const keys = keyLabelsFrom(m)
  labels.set(locale, keys)
  return keys
}

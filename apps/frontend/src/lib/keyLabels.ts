import type { KeyLabels } from "@pp/ui/command-menu"
import { keyLabelsFrom } from "@pp/ui/lib/keyLabels"

import { m } from "@/paraglide/messages"

export const keyLabels = () => keyLabelsFrom(m) satisfies KeyLabels

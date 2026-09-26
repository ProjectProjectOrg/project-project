import { Host, Text } from "@expo/ui"

import { copy } from "@/copy"

export function LoadFailed() {
  return (
    <Host style={{ flex: 1 }}>
      <Text>{copy.loadFailed}</Text>
    </Host>
  )
}

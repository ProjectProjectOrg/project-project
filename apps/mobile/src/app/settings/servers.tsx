import { Host, Text } from "@expo/ui"

import { copy } from "@/copy"

export default function Servers() {
  return (
    <Host style={{ flex: 1 }}>
      <Text>{copy.serversTitle}</Text>
    </Host>
  )
}

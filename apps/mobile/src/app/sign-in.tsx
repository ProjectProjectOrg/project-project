import { Host, Text } from "@expo/ui"

import { copy } from "@/copy"

export default function SignIn() {
  return (
    <Host style={{ flex: 1 }}>
      <Text>{copy.signInTitle}</Text>
    </Host>
  )
}

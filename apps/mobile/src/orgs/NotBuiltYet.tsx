import { ScrollView } from "react-native"

import { Text } from "@/components/ui/text"
import { copy } from "@/copy"

export function NotBuiltYet() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 pt-4"
    >
      <Text variant="muted">{copy.notBuiltYet}</Text>
    </ScrollView>
  )
}

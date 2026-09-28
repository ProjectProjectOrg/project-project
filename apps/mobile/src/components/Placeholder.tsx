import { View } from "react-native"

import { Text } from "@/components/ui/text"

export function Placeholder({ title }: Readonly<{ title: string }>) {
  return (
    <View className="flex-1 justify-center bg-background px-5">
      <Text variant="headline">{title}</Text>
    </View>
  )
}

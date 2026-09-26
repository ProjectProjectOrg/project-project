import { router } from "expo-router"
import { View } from "react-native"

import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"

export default function Welcome() {
  return (
    <View className="flex-1 bg-background px-5 pt-safe pb-safe-offset-2">
      <View className="flex-[42] justify-end items-center">
        <Logo size={96} />
      </View>
      <View className="flex-[58] items-center pt-6">
        <Text variant="muted">{copy.welcomeEyebrow}</Text>
        <Text className="text-[28px] font-semibold tracking-[-0.28px]">
          {copy.appName}
        </Text>
        <Text variant="muted" className="mt-2 text-center">
          {copy.welcomeBody}
        </Text>
      </View>
      <Button
        label={copy.welcomeStart}
        onPress={() => router.push("/sign-in")}
      />
    </View>
  )
}

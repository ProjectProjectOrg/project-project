import { router, Stack, useLocalSearchParams } from "expo-router"
import { Pressable } from "react-native"

import { Symbol } from "@/components/icons/Symbol"
import { Placeholder } from "@/components/Placeholder"
import { copy } from "@/copy"

function SettingsButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.serversTitle}
      hitSlop={8}
      onPress={() => router.push("/settings/servers")}
    >
      <Symbol name="gearshape" size={20} />
    </Pressable>
  )
}

const settingsHeaderRight = () => <SettingsButton />

export default function OrgHome() {
  const { orgSlug } = useLocalSearchParams<{
    instanceId: string
    orgSlug: string
  }>()
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: "",
          headerRight: settingsHeaderRight
        }}
      />
      <Placeholder title={`${copy.orgHomeTitle}: ${orgSlug}`} />
    </>
  )
}

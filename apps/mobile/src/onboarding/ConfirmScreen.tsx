import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef } from "react"
import { Image, ScrollView, View } from "react-native"

import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { useAnnouncement } from "@/components/ui/useAnnouncement"
import { copy } from "@/copy"

import { hostOf } from "./address"
import { checkServerAtom, saveCheckedServer } from "./atoms"
import type { CheckedServer } from "./checkServer"

function ServerMark({ logo }: Readonly<{ logo: string | null }>) {
  return logo === null ? (
    <View className="size-16 items-center justify-center rounded-md border border-border">
      <Logo size={40} />
    </View>
  ) : (
    <Image
      source={{ uri: logo }}
      className="size-16 rounded-md border border-border"
      accessibilityIgnoresInvertColors
    />
  )
}

function Confirm({
  checked,
  onSaved,
  onChangeServer
}: Readonly<{
  checked: CheckedServer
  onSaved: (instanceId: string) => void
  onChangeServer: () => void
}>) {
  const save = useAtomSet(saveCheckedServer, { mode: "promiseExit" })
  const saveState = useAtomValue(saveCheckedServer)
  const { descriptor, origin } = checked
  const attempt = useRef(0)
  const saveFailed = AsyncResult.isFailure(saveState) ? copy.saveFailed : null
  useAnnouncement(saveFailed)

  useFocusEffect(
    useCallback(
      () => () => {
        attempt.current += 1
      },
      []
    )
  )

  const confirm = async () => {
    const current = ++attempt.current
    const exit = await save(checked)
    if (current === attempt.current && Exit.isSuccess(exit)) onSaved(exit.value)
  }

  return (
    <View className="flex-1 bg-background pb-safe-offset-2">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text variant="muted">{copy.confirmLead}</Text>
        <ServerMark logo={descriptor.logo} />
        <View className="gap-1">
          <Text variant="headline">{descriptor.name}</Text>
          <Text variant="mono" className="text-muted-foreground">
            {hostOf(origin)}
          </Text>
          <Text variant="caption">
            {copy.confirmVersion(descriptor.serverVersion)}
          </Text>
        </View>
      </ScrollView>
      <View className="gap-1 px-5 pt-3">
        {saveFailed === null ? null : (
          <Text variant="error" className="mb-2">
            {saveFailed}
          </Text>
        )}
        <Button
          label={copy.confirmSignIn}
          loading={saveState.waiting}
          onPress={() => void confirm()}
        />
        <Button
          variant="ghost"
          label={copy.confirmChangeServer}
          disabled={saveState.waiting}
          onPress={onChangeServer}
        />
      </View>
    </View>
  )
}

export function ConfirmScreen(
  props: Readonly<{
    onSaved: (instanceId: string) => void
    onChangeServer: () => void
  }>
) {
  const checked = AsyncResult.value(useAtomValue(checkServerAtom))
  return Option.match(checked, {
    onNone: () => null,
    onSome: (server) => <Confirm checked={server} {...props} />
  })
}

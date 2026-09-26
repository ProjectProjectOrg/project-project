import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Image, View } from "react-native"

import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
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

  const confirm = async () => {
    const exit = await save(checked)
    if (Exit.isSuccess(exit)) onSaved(exit.value)
  }

  return (
    <View className="flex-1 bg-background px-5 pt-safe-offset-14 pb-safe-offset-2">
      <View className="flex-1 gap-4">
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
      </View>
      <View className="gap-1">
        {AsyncResult.isFailure(saveState) ? (
          <Text
            variant="error"
            className="mb-2"
            accessibilityLiveRegion="polite"
          >
            {copy.saveFailed}
          </Text>
        ) : null}
        <Button
          label={copy.confirmSignIn}
          loading={saveState.waiting}
          onPress={() => void confirm()}
        />
        <Button
          variant="ghost"
          label={copy.confirmChangeServer}
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

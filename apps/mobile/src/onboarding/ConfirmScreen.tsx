import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef } from "react"
import { ScrollView, View } from "react-native"

import { signInProblem } from "@/auth/atoms"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { useAnnouncement } from "@/components/ui/useAnnouncement"
import { copy } from "@/copy"
import type { OrgLocation } from "@/servers/model"
import { ServerSummary } from "@/servers/ServerSummary"

import { checkServerAtom, connectCheckedServer } from "./atoms"
import type { CheckedServer } from "./checkServer"
import { bandContentInset, DitherBand } from "./DitherBand"

function Confirm({
  checked,
  onSignedIn,
  onChangeServer
}: Readonly<{
  checked: CheckedServer
  onSignedIn: (instanceId: string, start: Option.Option<OrgLocation>) => void
  onChangeServer: () => void
}>) {
  const connect = useAtomSet(connectCheckedServer, { mode: "promiseExit" })
  const connectState = useAtomValue(connectCheckedServer)
  const { descriptor, origin } = checked
  const attempt = useRef(0)
  const problem = AsyncResult.matchWithError(connectState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: signInProblem,
    onDefect: () => copy.signInFailed
  })
  useAnnouncement(problem)

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
    const exit = await connect(checked)
    if (current === attempt.current && Exit.isSuccess(exit))
      onSignedIn(checked.descriptor.instanceId, exit.value)
  }

  return (
    <View className="flex-1 bg-dither-back pb-safe-offset-2">
      <DitherBand />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingTop: bandContentInset }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text variant="caption" className="mb-1">
          {copy.onboardingStep(2, 2)}
        </Text>
        <ServerSummary
          lead={copy.confirmLead}
          name={descriptor.name}
          logo={descriptor.logo}
          origin={origin}
          detail={copy.confirmVersion(descriptor.serverVersion)}
        />
      </ScrollView>
      <View className="gap-1 px-5 pt-3">
        {problem === null ? null : (
          <Text variant="error" className="mb-2">
            {problem}
          </Text>
        )}
        <Button
          label={copy.confirmSignIn}
          loading={connectState.waiting}
          onPress={() => void confirm()}
        />
        <Button
          variant="ghost"
          label={copy.confirmChangeServer}
          disabled={connectState.waiting}
          onPress={onChangeServer}
        />
      </View>
    </View>
  )
}

export function ConfirmScreen(
  props: Readonly<{
    onSignedIn: (instanceId: string, start: Option.Option<OrgLocation>) => void
    onChangeServer: () => void
  }>
) {
  const checked = AsyncResult.value(useAtomValue(checkServerAtom))
  return Option.match(checked, {
    onNone: () => null,
    onSome: (server) => <Confirm checked={server} {...props} />
  })
}

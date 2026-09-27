import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router, useLocalSearchParams } from "expo-router"
import { ScrollView, View } from "react-native"

import { signInAtom, signInProblem } from "@/auth/atoms"
import { LoadFailed } from "@/components/LoadFailed"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { useAnnouncement } from "@/components/ui/useAnnouncement"
import { copy } from "@/copy"
import { openStart } from "@/navigation/openStart"
import { savedServers } from "@/servers/atoms"
import type { SavedServer } from "@/servers/model"
import { ServerSummary } from "@/servers/ServerSummary"

function SignInTo({ server }: Readonly<{ server: SavedServer }>) {
  const signIn = useAtomSet(signInAtom(server.instanceId), {
    mode: "promiseExit"
  })
  const state = useAtomValue(signInAtom(server.instanceId))
  const problem = AsyncResult.matchWithError(state, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: signInProblem,
    onDefect: () => copy.signInFailed
  })
  useAnnouncement(problem)

  const start = async () => {
    const exit = await signIn()
    if (Exit.isSuccess(exit)) openStart(server.instanceId, exit.value)
  }

  return (
    <View className="flex-1 bg-background pt-safe pb-safe-offset-2">
      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-14">
        <ServerSummary
          lead={server.user === null ? copy.confirmLead : copy.signedOutLead}
          name={server.name}
          logo={server.logo}
          origin={server.origin}
          detail={server.user?.email}
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
          loading={state.waiting}
          onPress={() => void start()}
        />
        <Button
          variant="ghost"
          label={copy.confirmChangeServer}
          disabled={state.waiting}
          onPress={() => router.push("/add-server")}
        />
      </View>
    </View>
  )
}

export default function SignIn() {
  const { instanceId } = useLocalSearchParams<{ instanceId?: string }>()
  const servers = useAtomValue(savedServers)
  return AsyncResult.matchWithError(servers, {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value }) => {
      const server =
        value.find((saved) => saved.instanceId === instanceId) ?? value[0]
      return server === undefined ? null : <SignInTo server={server} />
    }
  })
}

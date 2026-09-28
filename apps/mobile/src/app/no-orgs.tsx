import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router, useLocalSearchParams } from "expo-router"
import { ScrollView, View } from "react-native"

import { refreshAccountAtom, signOutAtom } from "@/auth/atoms"
import { LoadFailed } from "@/components/LoadFailed"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { savedServers } from "@/servers/atoms"
import type { SavedServer } from "@/servers/model"
import { ServerSummary } from "@/servers/ServerSummary"

function NoOrgs({ server }: Readonly<{ server: SavedServer }>) {
  const refresh = useAtomSet(refreshAccountAtom(server.instanceId), {
    mode: "promiseExit"
  })
  const refreshState = useAtomValue(refreshAccountAtom(server.instanceId))
  const signOut = useAtomSet(signOutAtom(server.instanceId), {
    mode: "promiseExit"
  })
  const signOutState = useAtomValue(signOutAtom(server.instanceId))

  const checkAgain = async () => {
    const exit = await refresh()
    if (Exit.isSuccess(exit)) router.replace("/")
  }

  return (
    <View className="flex-1 bg-background pt-safe pb-safe-offset-2">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-14"
      >
        <ServerSummary
          lead={copy.noOrgsLead}
          name={server.name}
          logo={server.logo}
          origin={server.origin}
          detail={server.user?.email}
        />
        <Text variant="muted">{copy.noOrgsBody}</Text>
      </ScrollView>
      <View className="gap-1 px-5 pt-3">
        {AsyncResult.isFailure(refreshState) ? (
          <Text variant="error" className="mb-2">
            {copy.signInUnreachable}
          </Text>
        ) : null}
        <Button
          label={copy.noOrgsCheckAgain}
          loading={refreshState.waiting}
          onPress={() => void checkAgain()}
        />
        <Button
          variant="ghost"
          label={copy.signOut}
          loading={signOutState.waiting}
          onPress={() => void signOut().then(() => router.replace("/"))}
        />
      </View>
    </View>
  )
}

export default function NoOrganizations() {
  const { instanceId } = useLocalSearchParams<{ instanceId?: string }>()
  const servers = useAtomValue(savedServers)
  return AsyncResult.matchWithError(servers, {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value }) => {
      const server = value.find((saved) => saved.instanceId === instanceId)
      return server === undefined ? null : <NoOrgs server={server} />
    }
  })
}

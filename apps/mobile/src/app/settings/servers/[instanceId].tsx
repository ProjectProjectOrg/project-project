import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  type NativeStackNavigationProp,
  useLocalSearchParams,
  useNavigation
} from "expo-router"
import { useState } from "react"
import { ScrollView, View } from "react-native"

import { signInAtom, signInProblem, signOutAtom } from "@/auth/atoms"
import { LoadFailed } from "@/components/LoadFailed"
import { Button } from "@/components/ui/button"
import { ListRow, ListSection } from "@/components/ui/list"
import { Text } from "@/components/ui/text"
import { useAnnouncement } from "@/components/ui/useAnnouncement"
import { copy } from "@/copy"
import {
  removeServerAtom,
  savedServers,
  serverStatusAtom,
  signedInServers
} from "@/servers/atoms"
import type { SavedServer } from "@/servers/model"
import { ServerSummary } from "@/servers/ServerSummary"

function StatusRow({ instanceId }: Readonly<{ instanceId: string }>) {
  const status = useAtomValue(serverStatusAtom(instanceId))
  const label = AsyncResult.match(status, {
    onInitial: () => copy.serverStatusChecking,
    onFailure: () => copy.serverStatus.unreachable,
    onSuccess: ({ value }) =>
      Option.match(value, {
        onNone: () => copy.serverStatus.unreachable,
        onSome: (current) => copy.serverStatus[current]
      })
  })
  return <ListRow first title={label} />
}

function RemoveServer({ server }: Readonly<{ server: SavedServer }>) {
  const [confirming, setConfirming] = useState(false)
  const remove = useAtomSet(removeServerAtom(server.instanceId), {
    mode: "promiseExit"
  })
  const removeState = useAtomValue(removeServerAtom(server.instanceId))

  const navigation =
    useNavigation<
      NativeStackNavigationProp<Readonly<Record<string, undefined>>>
    >()
  const removeFailed = AsyncResult.isFailure(removeState)
    ? copy.removeServerFailed
    : null
  useAnnouncement(removeFailed)

  const confirm = async () => {
    const exit = await remove()
    if (Exit.isSuccess(exit)) {
      navigation.reset({ index: 0, routes: [{ name: "index" }] })
    }
  }

  if (!confirming) {
    return (
      <ListSection>
        <ListRow
          first
          destructive
          title={copy.removeServer}
          onPress={() => setConfirming(true)}
        />
      </ListSection>
    )
  }
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4">
      <Text>{copy.removeServerConfirm(server.name)}</Text>
      {removeFailed === null ? null : (
        <Text variant="error">{removeFailed}</Text>
      )}
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          size="md"
          variant="destructive"
          label={copy.removeServer}
          loading={removeState.waiting}
          onPress={() => void confirm()}
        />
        <Button
          className="flex-1"
          size="md"
          variant="tertiary"
          label={copy.cancel}
          disabled={removeState.waiting}
          onPress={() => setConfirming(false)}
        />
      </View>
    </View>
  )
}

function ServerDetail({ server }: Readonly<{ server: SavedServer }>) {
  const signIn = useAtomSet(signInAtom(server.instanceId))
  const signInState = useAtomValue(signInAtom(server.instanceId))
  const signOut = useAtomSet(signOutAtom(server.instanceId))
  const signOutState = useAtomValue(signOutAtom(server.instanceId))
  const removing = useAtomValue(removeServerAtom(server.instanceId)).waiting
  const busy = signInState.waiting || signOutState.waiting || removing
  const signedIn = AsyncResult.getOrElse(
    AsyncResult.map(useAtomValue(signedInServers), (ids) =>
      ids.includes(server.instanceId)
    ),
    () => false
  )
  const problem =
    AsyncResult.matchWithError(signInState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: signInProblem,
      onDefect: () => copy.signInFailed
    }) ?? (AsyncResult.isFailure(signOutState) ? copy.signOutFailed : null)
  useAnnouncement(problem)

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-8 px-5 py-4"
    >
      <ServerSummary
        lead={copy.serverDetailLead}
        name={server.name}
        logo={server.logo}
        origin={server.origin}
      />
      <ListSection title={copy.serverStatusTitle}>
        <StatusRow instanceId={server.instanceId} />
      </ListSection>
      <ListSection title={copy.accountTitle} footer={problem ?? undefined}>
        {server.user === null ? (
          <ListRow first title={copy.notSignedIn} />
        ) : (
          <ListRow
            first
            title={server.user.name}
            subtitle={server.user.email}
          />
        )}
        {signedIn ? (
          <ListRow
            title={signOutState.waiting ? copy.signingOut : copy.signOut}
            busy={signOutState.waiting}
            disabled={busy}
            onPress={() => signOut()}
          />
        ) : (
          <ListRow
            title={signInState.waiting ? copy.signingIn : copy.confirmSignIn}
            busy={signInState.waiting}
            disabled={busy}
            onPress={() => signIn()}
          />
        )}
      </ListSection>
      {server.orgs.length === 0 ? null : (
        <ListSection title={copy.organizationsTitle}>
          {server.orgs.map((org, index) => (
            <ListRow key={org.slug} first={index === 0} title={org.name} />
          ))}
        </ListSection>
      )}
      <RemoveServer server={server} />
    </ScrollView>
  )
}

export default function Server() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>()
  const servers = useAtomValue(savedServers)
  return AsyncResult.matchWithError(servers, {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value }) => {
      const server = value.find((saved) => saved.instanceId === instanceId)
      return server === undefined ? null : <ServerDetail server={server} />
    }
  })
}

import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router } from "expo-router"
import { ScrollView } from "react-native"

import { Symbol } from "@/components/icons/Symbol"
import { LoadFailed } from "@/components/LoadFailed"
import { ListRow, ListSection } from "@/components/ui/list"
import { copy } from "@/copy"
import { hostOf } from "@/onboarding/address"
import { savedServers } from "@/servers/atoms"
import { ServerMark } from "@/servers/ServerSummary"

export default function Servers() {
  const servers = useAtomValue(savedServers)
  return AsyncResult.matchWithError(servers, {
    onInitial: () => null,
    onError: () => <LoadFailed />,
    onDefect: () => <LoadFailed />,
    onSuccess: ({ value }) => (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-8 px-5 py-4"
      >
        <ListSection footer={copy.serversFooter}>
          {value.map((server, index) => (
            <ListRow
              key={server.instanceId}
              first={index === 0}
              leading={<ServerMark logo={server.logo} small />}
              title={server.name}
              subtitle={copy.serverRowSubtitle(
                server.user?.name ?? null,
                hostOf(server.origin)
              )}
              trailing={<Symbol name="chevron.right" size={13} muted />}
              onPress={() =>
                router.push({
                  pathname: "/settings/servers/[instanceId]",
                  params: { instanceId: server.instanceId }
                })
              }
            />
          ))}
        </ListSection>
        <ListSection>
          <ListRow
            first
            leading={<Symbol name="plus" />}
            title={copy.addServer}
            onPress={() => router.push("/add-server")}
          />
        </ListSection>
      </ScrollView>
    )
  })
}

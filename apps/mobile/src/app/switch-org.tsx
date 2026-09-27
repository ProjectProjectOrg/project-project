import { useAtomValue } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router } from "expo-router"
import { ScrollView } from "react-native"

import { Symbol } from "@/components/icons/Symbol"
import { ListRow, ListSection } from "@/components/ui/list"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { hostOf } from "@/onboarding/address"
import { type OrgGroup, orgGroups } from "@/orgs/switcher"
import { lastUsedOrg, savedServers, signedInServers } from "@/servers/atoms"
import type { OrgLocation } from "@/servers/model"

function Group({
  group,
  current
}: Readonly<{ group: OrgGroup; current: OrgLocation | undefined }>) {
  const { server, orgs } = group
  return (
    <ListSection title={`${server.name} · ${hostOf(server.origin)}`}>
      {orgs.map((org, index) => {
        const selected =
          server.instanceId === current?.instanceId &&
          org.slug === current.orgSlug
        return (
          <ListRow
            key={org.slug}
            first={index === 0}
            title={org.name}
            selected={selected}
            trailing={
              selected ? <Symbol name="checkmark" size={15} /> : undefined
            }
            onPress={() =>
              router.dismissTo({
                pathname: "/orgs/[instanceId]/[orgSlug]",
                params: { instanceId: server.instanceId, orgSlug: org.slug }
              })
            }
          />
        )
      })}
    </ListSection>
  )
}

function Groups({
  groups,
  current
}: Readonly<{
  groups: ReadonlyArray<OrgGroup>
  current: OrgLocation | undefined
}>) {
  if (groups.length === 0) {
    return (
      <Text variant="muted" className="px-4">
        {copy.switchOrgEmpty}
      </Text>
    )
  }
  return groups.map((group) => (
    <Group key={group.server.instanceId} group={group} current={current} />
  ))
}

export default function SwitchOrg() {
  const current = Option.getOrUndefined(
    Option.flatten(AsyncResult.value(useAtomValue(lastUsedOrg)))
  )
  const groups = AsyncResult.map(
    AsyncResult.all([
      useAtomValue(savedServers),
      useAtomValue(signedInServers)
    ]),
    ([servers, signedIn]) => orgGroups(servers, signedIn)
  )
  const failed = AsyncResult.isFailure(groups)

  return (
    <ScrollView contentContainerClassName="gap-8 px-5 pt-6 pb-10">
      {failed ? <Text variant="error">{copy.loadFailed}</Text> : null}
      {AsyncResult.isSuccess(groups) ? (
        <Groups groups={groups.value} current={current} />
      ) : null}
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
}

import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router } from "expo-router"
import { Pressable, View } from "react-native"

import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"
import { useOrgLocation } from "@/orgs/location"
import { savedServers } from "@/servers/atoms"
import { prefetchTickets, ticketPreview } from "@/tickets/atoms"
import { PriorityIcon } from "@/tickets/PriorityIcon"
import { StatusIcon } from "@/tickets/StatusIcon"

import type { MyWorkSection, MyWorkTicket } from "./atoms"

export function MyWorkRow({
  item,
  section,
  first
}: Readonly<{ item: MyWorkTicket; section: MyWorkSection; first: boolean }>) {
  const org = useOrgLocation()
  const location = {
    ...org,
    projectSlug: item.project.slug,
    ticketId: item.ticket.id
  }
  const seed = useAtomSet(ticketPreview(location))
  const prefetch = useAtomSet(prefetchTickets)
  const viewer = AsyncResult.getOrElse(
    AsyncResult.map(
      useAtomValue(savedServers),
      (servers) =>
        servers.find((server) => server.instanceId === org.instanceId)?.user ??
        null
    ),
    () => null
  )
  const open = () => {
    seed(
      Option.some({
        ticket: item.ticket,
        project: item.project,
        statuses: item.statuses,
        viewer
      })
    )
    router.push({
      pathname: "/orgs/[instanceId]/[orgSlug]/tickets/[projectSlug]/[ticketId]",
      params: {
        ...org,
        projectSlug: item.project.slug,
        ticketId: item.ticket.id
      }
    })
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.ticket.id}, ${item.ticket.title}`}
      onPressIn={() => prefetch([location])}
      onPress={open}
      className="flex-row items-center gap-3 px-5 active:bg-accent"
    >
      <StatusIcon status={section} />
      <View
        className={cn(
          "min-h-15 flex-1 flex-row items-center gap-3 py-2.5",
          !first && "border-t border-border"
        )}
      >
        <View className="flex-1 gap-0.5">
          <Text className="font-medium" numberOfLines={1}>
            {item.ticket.title}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text variant="caption" className="font-mono">
              {item.ticket.id}
            </Text>
            <Text variant="caption" className="flex-1" numberOfLines={1}>
              {item.project.name}
            </Text>
          </View>
        </View>
        <PriorityIcon priority={item.ticket.priority} />
      </View>
    </Pressable>
  )
}

export function MyWorkSectionHeader({
  section
}: Readonly<{ section: MyWorkSection }>) {
  return (
    <View className="flex-row items-center gap-2 px-5 pt-5 pb-1.5">
      <StatusIcon status={section} />
      <Text variant="label" className="text-muted-foreground">
        {section.label}
      </Text>
      <Text variant="label" className="text-muted-foreground tabular-nums">
        {section.data.length}
      </Text>
    </View>
  )
}

import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router, Stack, useLocalSearchParams } from "expo-router"
import { useCallback } from "react"
import { View } from "react-native"
import Animated from "react-native-reanimated"

import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { useOrgLocation } from "@/orgs/location"
import {
  type TicketLocation,
  type TicketView,
  ticketView,
  updateTicket
} from "@/tickets/atoms"
import { Ticket } from "@/tickets/Ticket"
import { TicketNavTitle, useCollapsingTitle } from "@/tickets/TicketNavTitle"
import { useMentionedTickets } from "@/tickets/useMentionedTickets"

const decodeTicketId = Schema.decodeSync(TicketId)

const useTicketLocation = () => {
  const org = useOrgLocation()
  const { projectSlug, ticketId } = useLocalSearchParams<{
    projectSlug: string
    ticketId: string
  }>()
  return {
    ...org,
    projectSlug,
    ticketId: decodeTicketId(ticketId)
  } satisfies TicketLocation
}

function TicketFailed({
  detail,
  onRetry
}: Readonly<{ detail: string; onRetry: () => void }>) {
  return (
    <View className="items-start gap-3 px-5 pt-4">
      <View className="gap-1">
        <Text variant="error">{copy.ticketFailed}</Text>
        <Text variant="caption" selectable>
          {detail}
        </Text>
      </View>
      <Button
        size="md"
        variant="tertiary"
        label={copy.tryAgain}
        onPress={onRetry}
      />
    </View>
  )
}

type CollapsingTitle = ReturnType<typeof useCollapsingTitle>

function TicketLoaded({
  location,
  view,
  header
}: Readonly<{
  location: TicketLocation
  view: TicketView
  header: CollapsingTitle
}>) {
  const update = useAtomSet(updateTicket(location))
  const saveFailed = AsyncResult.isFailure(useAtomValue(updateTicket(location)))
  const mentions = useMentionedTickets(location, view.ticket.body)
  const { id: ticketId, title } = view.ticket
  const navTitle = useCallback(
    () => (
      <TicketNavTitle
        ticketId={ticketId}
        title={title}
        progress={header.progress}
      />
    ),
    [ticketId, title, header.progress]
  )
  const openTicket = (ticketId: string) =>
    router.push({
      pathname: "/orgs/[instanceId]/[orgSlug]/tickets/[projectSlug]/[ticketId]",
      params: {
        instanceId: location.instanceId,
        orgSlug: location.orgSlug,
        projectSlug: location.projectSlug,
        ticketId
      }
    })
  return (
    <Ticket.Provider
      state={view}
      mentions={mentions}
      actions={{ update, openTicket }}
    >
      <Stack.Screen
        options={{
          headerTitle: navTitle
        }}
      />
      <Ticket.Frame>
        <Ticket.Header
          onLayout={header.onTitleLayout}
          style={header.pageTitleStyle}
        />
        <Ticket.Properties>
          <Ticket.Status />
          <Ticket.Priority />
          <Ticket.Assignees />
          <Ticket.Type />
        </Ticket.Properties>
        {saveFailed ? (
          <Text variant="error" className="px-5 pt-3">
            {copy.ticketUpdateFailed}
          </Text>
        ) : null}
        <Ticket.Git />
        <Ticket.Description />
      </Ticket.Frame>
    </Ticket.Provider>
  )
}

function TicketContent({
  location,
  header
}: Readonly<{ location: TicketLocation; header: CollapsingTitle }>) {
  const result = useAtomValue(ticketView(location))
  const refresh = useAtomRefresh(ticketView(location))
  return AsyncResult.matchWithError(result, {
    onInitial: () => null,
    onError: (error) => (
      <TicketFailed
        detail={
          Predicate.hasProperty(error, "problem")
            ? `${error._tag}: ${error.problem}`
            : error._tag
        }
        onRetry={refresh}
      />
    ),
    onDefect: (defect) => (
      <TicketFailed detail={String(defect)} onRetry={refresh} />
    ),
    onSuccess: ({ value }) => (
      <TicketLoaded location={location} view={value} header={header} />
    )
  })
}

export default function TicketScreen() {
  const location = useTicketLocation()
  const header = useCollapsingTitle()
  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLargeTitle: false,
          unstable_headerLeftItems: undefined,
          unstable_headerRightItems: () => []
        }}
      />
      <Animated.ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-12"
        onScroll={header.onScroll}
        scrollEventThrottle={16}
      >
        <TicketContent location={location} header={header} />
      </Animated.ScrollView>
    </>
  )
}

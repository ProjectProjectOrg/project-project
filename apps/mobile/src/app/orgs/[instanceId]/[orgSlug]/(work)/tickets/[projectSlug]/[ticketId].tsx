import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Stack, useLocalSearchParams } from "expo-router"
import { ScrollView, View } from "react-native"

import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { useOrgLocation } from "@/orgs/location"
import { type TicketLocation, ticketView, updateTicket } from "@/tickets/atoms"
import { Ticket } from "@/tickets/Ticket"

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

function TicketContent({ location }: Readonly<{ location: TicketLocation }>) {
  const result = useAtomValue(ticketView(location))
  const refresh = useAtomRefresh(ticketView(location))
  const update = useAtomSet(updateTicket(location))
  const saveFailed = AsyncResult.isFailure(useAtomValue(updateTicket(location)))
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
      <Ticket.Provider state={value} actions={{ update }}>
        <Ticket.Header />
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
      </Ticket.Provider>
    )
  })
}

export default function TicketScreen() {
  const location = useTicketLocation()
  return (
    <>
      <Stack.Screen
        options={{
          title: location.ticketId,
          headerLargeTitle: false,
          unstable_headerLeftItems: undefined,
          unstable_headerRightItems: () => []
        }}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-12"
      >
        <TicketContent location={location} />
      </ScrollView>
    </>
  )
}

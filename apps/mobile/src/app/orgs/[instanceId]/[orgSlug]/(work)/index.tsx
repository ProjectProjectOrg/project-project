import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Arr from "effect/Array"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { router, Stack } from "expo-router"
import { useEffect } from "react"
import { RefreshControl, SectionList, View } from "react-native"

import { refreshAccountAtom } from "@/auth/atoms"
import { Reveal } from "@/components/Reveal"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { usePullToRefresh } from "@/lib/usePullToRefresh"
import { myWork, type MyWorkSection } from "@/myWork/atoms"
import { MyWorkRow, MyWorkSectionHeader } from "@/myWork/MyWorkRow"
import { useHideSplashWhen } from "@/navigation/useHideSplashWhen"
import { useRevealOnLoad } from "@/navigation/useRevealOnLoad"
import { useOrgLocation } from "@/orgs/location"
import type { OrgLocation } from "@/servers/model"
import { prefetchTickets } from "@/tickets/atoms"

const prefetchLimit = 30

function OrgGone({
  location,
  onRetry
}: Readonly<{ location: OrgLocation; onRetry: () => void }>) {
  const refresh = useAtomSet(refreshAccountAtom(location.instanceId), {
    mode: "promiseExit"
  })
  const refreshState = useAtomValue(refreshAccountAtom(location.instanceId))
  useEffect(() => {
    let active = true
    void refresh().then((exit) => {
      if (active && Exit.isSuccess(exit)) router.replace("/")
    })
    return () => {
      active = false
    }
  }, [refresh])
  return AsyncResult.isFailure(refreshState) ? (
    <MyWorkFailed onRetry={onRetry} />
  ) : null
}

function MyWorkFailed({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <View className="items-start gap-3 px-5 pt-4">
      <Text variant="error">{copy.myWorkFailed}</Text>
      <Button
        size="md"
        variant="tertiary"
        label={copy.tryAgain}
        onPress={onRetry}
      />
    </View>
  )
}

function MyWorkState({
  location,
  onRetry
}: Readonly<{ location: OrgLocation; onRetry: () => void }>) {
  const result = useAtomValue(myWork(location))
  return AsyncResult.matchWithError(result, {
    onInitial: () => null,
    onError: (error) =>
      Predicate.isTagged(error, "NotFound") ? (
        <OrgGone location={location} onRetry={onRetry} />
      ) : (
        <MyWorkFailed onRetry={onRetry} />
      ),
    onDefect: () => <MyWorkFailed onRetry={onRetry} />,
    onSuccess: () => (
      <Text variant="muted" className="px-5 pt-4">
        {copy.myWorkEmpty}
      </Text>
    )
  })
}

function MyWorkSummary({ location }: Readonly<{ location: OrgLocation }>) {
  const value = AsyncResult.value(useAtomValue(myWork(location)))
  return Option.isSome(value) && value.value.total > 0 ? (
    <Text variant="caption" className="px-5 pb-1">
      {copy.myWorkSummary(value.value.total, value.value.projectCount)}
    </Text>
  ) : null
}

function usePrefetchMyWork(location: OrgLocation) {
  const result = useAtomValue(myWork(location))
  const prefetch = useAtomSet(prefetchTickets)
  const fresh = result.waiting ? Option.none() : AsyncResult.value(result)
  const sections = Option.getOrUndefined(fresh)?.sections
  useEffect(() => {
    if (sections === undefined) return
    prefetch(
      sections
        .flatMap((section) => section.data)
        .slice(0, prefetchLimit)
        .map((item) => ({
          instanceId: location.instanceId,
          orgSlug: location.orgSlug,
          projectSlug: item.project.slug,
          ticketId: item.ticket.id
        }))
    )
  }, [sections, location, prefetch])
}

export default function MyWork() {
  const location = useOrgLocation()
  const refreshMyWork = useAtomRefresh(myWork(location))
  const myWorkResult = useAtomValue(myWork(location))
  const pull = usePullToRefresh(myWork(location))
  const loaded = !AsyncResult.isInitial(myWorkResult)
  const reveal = useRevealOnLoad(loaded)
  useHideSplashWhen(loaded)
  usePrefetchMyWork(location)
  const sections = AsyncResult.value(myWorkResult).pipe(
    Option.map((value) => value.sections),
    Option.getOrElse(Arr.empty<MyWorkSection>)
  )

  return (
    <>
      <Stack.Screen options={{ title: copy.myWorkTitle }} />
      <SectionList
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-8"
        sections={sections}
        keyExtractor={(item) => `${item.project.slug}/${item.ticket.id}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <Reveal progress={reveal}>
            <MyWorkSummary location={location} />
          </Reveal>
        }
        ListEmptyComponent={
          <Reveal progress={reveal}>
            <MyWorkState location={location} onRetry={refreshMyWork} />
          </Reveal>
        }
        renderSectionHeader={({ section }) => (
          <Reveal progress={reveal}>
            <MyWorkSectionHeader section={section} />
          </Reveal>
        )}
        renderItem={({ item, index, section }) => (
          <Reveal progress={reveal}>
            <MyWorkRow item={item} section={section} first={index === 0} />
          </Reveal>
        )}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
          />
        }
      />
    </>
  )
}

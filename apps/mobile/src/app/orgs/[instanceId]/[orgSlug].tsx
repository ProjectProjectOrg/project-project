import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  Redirect,
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams
} from "expo-router"
import { useCallback, useEffect } from "react"
import { RefreshControl, ScrollView, View } from "react-native"

import { refreshAccountAtom } from "@/auth/atoms"
import { Symbol } from "@/components/icons/Symbol"
import { Button } from "@/components/ui/button"
import { ListRow, ListSection } from "@/components/ui/list"
import { PressScale } from "@/components/ui/press-scale"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { orgProjects, rememberOrg } from "@/orgs/atoms"
import { savedServers, signedInServers } from "@/servers/atoms"
import type { OrgLocation } from "@/servers/model"

function SettingsButton() {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={copy.serversTitle}
      hitSlop={8}
      onPress={() => router.push("/settings/servers")}
    >
      <Symbol name="gearshape" size={20} />
    </PressScale>
  )
}

const settingsHeaderRight = () => <SettingsButton />

const useOrgLocation = () =>
  useLocalSearchParams<{ instanceId: string; orgSlug: string }>()

const useOrgName = (location: OrgLocation) =>
  AsyncResult.getOrElse(
    AsyncResult.map(
      useAtomValue(savedServers),
      (saved) =>
        saved
          .find((server) => server.instanceId === location.instanceId)
          ?.orgs.find((org) => org.slug === location.orgSlug)?.name ??
        location.orgSlug
    ),
    () => location.orgSlug
  )

function OrgTitle({ name }: Readonly<{ name: string }>) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={copy.switchOrgLabel(name)}
      hitSlop={8}
      className="flex-row items-center gap-1.5"
      onPress={() => router.push("/switch-org")}
    >
      <Text className="font-semibold">{name}</Text>
      <Symbol name="chevron.down" size={12} muted />
    </PressScale>
  )
}

const orgHeaderTitle = ({ children }: Readonly<{ children: string }>) => (
  <OrgTitle name={children} />
)

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
    <ProjectsFailed onRetry={onRetry} />
  ) : null
}

function ProjectsFailed({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <View className="items-start gap-3">
      <Text variant="error">{copy.projectsFailed}</Text>
      <Button
        size="md"
        variant="tertiary"
        label={copy.tryAgain}
        onPress={onRetry}
      />
    </View>
  )
}

function Projects({
  location,
  onRetry
}: Readonly<{ location: OrgLocation; onRetry: () => void }>) {
  const projects = useAtomValue(orgProjects(location))
  return AsyncResult.matchWithError(projects, {
    onInitial: () => null,
    onError: (error) =>
      Predicate.isTagged(error, "NotFound") ? (
        <OrgGone location={location} onRetry={onRetry} />
      ) : (
        <ProjectsFailed onRetry={onRetry} />
      ),
    onDefect: () => <ProjectsFailed onRetry={onRetry} />,
    onSuccess: ({ value }) =>
      value.length === 0 ? (
        <Text variant="muted">{copy.noProjects}</Text>
      ) : (
        <ListSection title={copy.projectsTitle}>
          {value.map((project, index) => (
            <ListRow
              key={project.slug}
              first={index === 0}
              title={project.name}
              trailing={
                <Text variant="mono" className="text-muted-foreground">
                  {project.key}
                </Text>
              }
            />
          ))}
        </ListSection>
      )
  })
}

export default function OrgHome() {
  const location = useOrgLocation()
  const name = useOrgName(location)
  const signedInState = useAtomValue(signedInServers)
  const signedOut =
    AsyncResult.isSuccess(signedInState) &&
    !signedInState.waiting &&
    !signedInState.value.includes(location.instanceId)
  const remember = useAtomSet(rememberOrg)
  const orgLocation = {
    instanceId: location.instanceId,
    orgSlug: location.orgSlug
  }
  const refreshProjects = useAtomRefresh(orgProjects(orgLocation))
  const projectsWaiting = useAtomValue(orgProjects(orgLocation)).waiting

  useFocusEffect(
    useCallback(() => {
      remember({ instanceId: location.instanceId, orgSlug: location.orgSlug })
    }, [remember, location.instanceId, location.orgSlug])
  )

  if (signedOut) {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: { instanceId: location.instanceId }
        }}
      />
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: name,
          headerTitle: orgHeaderTitle,
          headerRight: settingsHeaderRight
        }}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-5 py-4"
        refreshControl={
          <RefreshControl
            refreshing={projectsWaiting}
            onRefresh={refreshProjects}
          />
        }
      >
        <View>
          <Projects location={orgLocation} onRetry={refreshProjects} />
        </View>
      </ScrollView>
    </>
  )
}

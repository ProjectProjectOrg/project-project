import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams
} from "expo-router"
import { useCallback } from "react"
import { ScrollView, View } from "react-native"

import { Symbol } from "@/components/icons/Symbol"
import { ListRow, ListSection } from "@/components/ui/list"
import { PressScale } from "@/components/ui/press-scale"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { orgProjects, rememberOrg } from "@/orgs/atoms"
import { savedServers } from "@/servers/atoms"
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

function OrgTitle() {
  const location = useOrgLocation()
  const name = useOrgName(location)
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={copy.switchOrgLabel(name)}
      hitSlop={8}
      className="flex-row items-center gap-1.5"
      onPress={() => router.push({ pathname: "/switch-org", params: location })}
    >
      <Text className="font-semibold">{name}</Text>
      <Symbol name="chevron.down" size={12} muted />
    </PressScale>
  )
}

const orgHeaderLeft = () => <OrgTitle />

function Projects({ location }: Readonly<{ location: OrgLocation }>) {
  const projects = useAtomValue(orgProjects(location))
  return AsyncResult.matchWithError(projects, {
    onInitial: () => null,
    onError: () => <Text variant="error">{copy.projectsFailed}</Text>,
    onDefect: () => <Text variant="error">{copy.projectsFailed}</Text>,
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
  const remember = useAtomSet(rememberOrg)

  useFocusEffect(
    useCallback(() => {
      remember({ instanceId: location.instanceId, orgSlug: location.orgSlug })
    }, [remember, location.instanceId, location.orgSlug])
  )

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          title: "",
          headerLeft: orgHeaderLeft,
          headerRight: settingsHeaderRight
        }}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-5 py-4"
      >
        <View>
          <Projects location={location} />
        </View>
      </ScrollView>
    </>
  )
}

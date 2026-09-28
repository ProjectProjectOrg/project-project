import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Redirect } from "expo-router"
import { NativeTabs } from "expo-router/native-tabs"
import { useEffect } from "react"
import { useCSSVariable } from "uniwind"

import { copy } from "@/copy"
import { rememberOrg } from "@/orgs/atoms"
import { OrgLocationProvider, useOrgLocation } from "@/orgs/location"
import { signedInServers } from "@/servers/atoms"

export default function OrgLayout() {
  return (
    <OrgLocationProvider>
      <OrgTabs />
    </OrgLocationProvider>
  )
}

function OrgTabs() {
  const location = useOrgLocation()
  const signedInState = useAtomValue(signedInServers)
  const remember = useAtomSet(rememberOrg)
  const foreground = String(useCSSVariable("--color-foreground"))
  const { instanceId, orgSlug } = location

  useEffect(() => {
    remember({ instanceId, orgSlug })
  }, [remember, instanceId, orgSlug])

  const signedOut =
    AsyncResult.isSuccess(signedInState) &&
    !signedInState.waiting &&
    !signedInState.value.includes(instanceId)
  if (signedOut) {
    return <Redirect href={{ pathname: "/sign-in", params: { instanceId } }} />
  }

  return (
    <NativeTabs
      tintColor={foreground}
      labelStyle={{ fontFamily: "Geist", fontWeight: "500" }}
    >
      <NativeTabs.Trigger name="(work)">
        <NativeTabs.Trigger.Icon sf="tray" />
        <NativeTabs.Trigger.Label>{copy.myWorkTitle}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="projects">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" />
        <NativeTabs.Trigger.Label>
          {copy.projectsTitle}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sprint">
        <NativeTabs.Trigger.Icon sf="arrow.triangle.2.circlepath" />
        <NativeTabs.Trigger.Label>{copy.sprintTitle}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

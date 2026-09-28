import { Stack } from "expo-router"

import { copy } from "@/copy"
import { NotBuiltYet } from "@/orgs/NotBuiltYet"

export default function ProjectsTab() {
  return (
    <>
      <Stack.Screen options={{ title: copy.projectsTitle }} />
      <NotBuiltYet />
    </>
  )
}

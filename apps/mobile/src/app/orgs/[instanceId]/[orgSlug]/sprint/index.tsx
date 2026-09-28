import { Stack } from "expo-router"

import { copy } from "@/copy"
import { NotBuiltYet } from "@/orgs/NotBuiltYet"

export default function SprintTab() {
  return (
    <>
      <Stack.Screen options={{ title: copy.sprintTitle }} />
      <NotBuiltYet />
    </>
  )
}

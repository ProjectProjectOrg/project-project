import { useAtomRefresh, useAtomValue } from "@effect/atom-react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { EditSprintForm } from "@/features/sprints/forms/edit-sprint"

import type { SprintPageProps } from "./SprintCommandPages"

export function EditSprintPage({ sprint, env }: SprintPageProps) {
  const req = sprintRequest(sprint.orgSlug, sprint.slug, sprint.sprint.id)
  const detail = useAtomValue(sprintDetail(req))
  const refresh = useAtomRefresh(sprintDetail(req))
  return (
    <AsyncView
      result={detail}
      contained
      reset={refresh}
      onInitial={() => null}
      onSuccess={({ value }) => (
        <EditSprintForm
          orgSlug={sprint.orgSlug}
          slug={sprint.slug}
          sprint={sprint.sprint}
          body={value.body}
          onDone={env.close}
        />
      )}
    />
  )
}

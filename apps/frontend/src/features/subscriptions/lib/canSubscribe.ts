import type { Member } from "@pp/shared"

export const canSubscribe = (
  project: Readonly<{ members: ReadonlyArray<Pick<Member, "id">> }> | null,
  viewerId: string | null | undefined
): boolean =>
  project !== null &&
  viewerId != null &&
  project.members.some((member) => member.id === viewerId)

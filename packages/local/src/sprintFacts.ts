import type { GroupFact } from "@pp/shared"
import * as DateTime from "effect/DateTime"

export const at = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))

export const sprintFact = (
  id: string,
  tickets: ReadonlyArray<string>,
  timing: Partial<
    Pick<GroupFact, "startsAt" | "completedAt" | "createdAt">
  > = {}
): GroupFact => ({
  id,
  kind: "sprint",
  name: id,
  color: "#3366ff",
  startsAt: at("2026-11-01T00:00:00Z"),
  endsAt: null,
  completedAt: null,
  tickets,
  createdBy: "user-1",
  createdAt: at("2026-11-01T00:00:00Z"),
  updatedAt: at("2026-11-01T00:00:00Z"),
  ...timing
})

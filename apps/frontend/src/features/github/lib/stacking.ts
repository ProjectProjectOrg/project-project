import type { GitState } from "@pp/shared"

export const canStackOn = (state: GitState) =>
  state.tag !== "no_branch" &&
  state.tag !== "branch_pending" &&
  state.tag !== "stale_branch"

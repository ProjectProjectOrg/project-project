import type { StackLayerState, TicketBranchEntry } from "@pp/shared"

import type * as GitHub from "../github/GitHub"
import { orderStackLayers } from "./stack"

type Repository = Readonly<{ repoOwner: string; repoName: string }>

export const pullRequestUrl = (repository: Repository, number: number) =>
  `https://github.com/${repository.repoOwner}/${repository.repoName}/pull/${number}`

export const stackLayerStates = (
  ownBranch: string | null,
  stack: ReadonlyArray<TicketBranchEntry> | undefined,
  repository: Repository | null,
  snapshot?: Pick<GitHub.RawProjectStates, "prByBranch"> &
    Partial<Pick<GitHub.RawProjectStates, "existingBranches">>
) =>
  orderStackLayers(ownBranch, stack).map(({ layer, depth }) => {
    const live = snapshot?.prByBranch.get(layer.branch)
    const fromSnapshot = live !== undefined && live.number === layer.pr
    return {
      branch: layer.branch,
      base: layer.base ?? null,
      depth,
      pr:
        layer.pr === undefined
          ? null
          : {
              number: layer.pr,
              url: fromSnapshot
                ? live.url
                : repository === null
                  ? ""
                  : pullRequestUrl(repository, layer.pr),
              title: fromSnapshot ? live.title : "",
              state: layer.prState ?? "open",
              draft: layer.prDraft ?? false,
              landed: layer.landed ?? false,
              checks: fromSnapshot && live.state === "open" ? live.checks : null
            },
      deleted:
        snapshot?.existingBranches !== undefined &&
        layer.prState !== "merged" &&
        !snapshot.existingBranches.has(layer.branch) &&
        live === undefined
    } satisfies StackLayerState
  })

import type { StackLayerState, TicketBranchEntry } from "@pp/shared"

import type { RawProjectStates } from "../github/GitHub"
import { orderStackLayers } from "./ticketStack"

type Repository = Readonly<{ repoOwner: string; repoName: string }>

export const stackLayerStates = (
  ownBranch: string | null,
  stack: ReadonlyArray<TicketBranchEntry> | undefined,
  repository: Repository | null,
  snapshot?: Pick<RawProjectStates, "existingBranches" | "prByBranch">
): ReadonlyArray<StackLayerState> =>
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
                  : `https://github.com/${repository.repoOwner}/${repository.repoName}/pull/${layer.pr}`,
              title: fromSnapshot ? live.title : "",
              state: layer.prState ?? "open",
              draft: layer.prDraft ?? false,
              landed: layer.landed ?? false,
              checks: fromSnapshot && live.state === "open" ? live.checks : null
            },
      deleted:
        snapshot !== undefined &&
        layer.prState !== "merged" &&
        !snapshot.existingBranches.has(layer.branch) &&
        live === undefined
    }
  })

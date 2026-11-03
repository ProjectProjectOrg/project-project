import { describe, expect, it } from "vitest"

import { Keys, projectScope, type ReactivityKey } from "@/api/keys"

import { initialLiveGate, type LiveGateInput, stepLiveGate } from "./liveGate"

const scope = projectScope("acme", "web")
const tickets = Keys.ticketsIn(scope)
const sprints = Keys.sprints(scope)

const run = (inputs: ReadonlyArray<LiveGateInput>) => {
  const flushed: Array<ReadonlyArray<ReactivityKey>> = []
  inputs.reduce((gate, input) => {
    const [next, out] = stepLiveGate(gate, input)
    flushed.push(...out)
    return next
  }, initialLiveGate)
  return flushed
}

const keys = (...k: ReadonlyArray<ReactivityKey>): LiveGateInput => ({
  kind: "keys",
  keys: k
})
const open = (count: number): LiveGateInput => ({
  kind: "interactions",
  open: count
})

describe("stepLiveGate", () => {
  it.each([
    {
      name: "passes changes straight through while nothing is open",
      inputs: [open(0), keys(tickets), keys(sprints)],
      flushed: [[tickets], [sprints]]
    },
    {
      name: "holds changes until it knows nothing is open",
      inputs: [keys(tickets), open(0)],
      flushed: [[tickets]]
    },
    {
      name: "holds changes during an interaction and releases them once, deduplicated, when the last one closes",
      inputs: [
        open(0),
        open(1),
        keys(tickets),
        open(2),
        keys(tickets, sprints),
        open(1),
        open(0)
      ],
      flushed: [[tickets, sprints]]
    },
    {
      name: "releases only the resync when one was queued, since it already refetches every view",
      inputs: [
        open(1),
        keys(tickets),
        keys(Keys.liveResync()),
        keys(sprints),
        open(0)
      ],
      flushed: [[Keys.liveResync()]]
    },
    {
      name: "releases nothing when no change arrived during the interaction",
      inputs: [open(0), open(1), open(0)],
      flushed: []
    }
  ])("$name", ({ inputs, flushed }) => {
    expect(run(inputs)).toEqual(flushed)
  })
})

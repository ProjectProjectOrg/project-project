import { expect, it } from "vitest"

import { jiraMigrationStageForStep } from "./JiraMigrationShell"

it("keeps detailed mapping screens within Map project data", () => {
  const mappingSteps = [
    "statuses",
    "types",
    "priorities",
    "planning",
    "destination"
  ] as const
  expect(mappingSteps.map((step) => jiraMigrationStageForStep(step))).toEqual([
    "map",
    "map",
    "map",
    "map",
    "map"
  ])
})

import { UserId } from "@pp/shared"
import type { ReactElement } from "react"
import { expectTypeOf } from "vitest"

import { Select } from "./select"

const options = [
  { value: "feat", label: "Feature" },
  { value: "bug", label: "Bug" }
] as const

const single = (
  <Select
    items={options}
    value="feat"
    onValueChange={(value) =>
      expectTypeOf(value).toEqualTypeOf<"feat" | "bug">()
    }
  >
    {null}
  </Select>
)

const multiple = (
  <Select
    items={options}
    multiple
    value={["feat"]}
    onValueChange={(value) =>
      expectTypeOf(value).toEqualTypeOf<ReadonlyArray<"feat" | "bug">>()
    }
  >
    {null}
  </Select>
)

const users = [
  { value: "all", label: "Anyone" },
  { value: UserId.make("user-1"), label: "Ada" }
] as const

const branded = (
  <Select
    items={users}
    value="all"
    onValueChange={(value) =>
      expectTypeOf(value).toEqualTypeOf<UserId | "all">()
    }
  >
    {null}
  </Select>
)

expectTypeOf(single).toExtend<ReactElement>()
expectTypeOf(multiple).toExtend<ReactElement>()
expectTypeOf(branded).toExtend<ReactElement>()

type Props = Parameters<typeof Select<typeof options>>[0]

expectTypeOf<
  Readonly<{ items: typeof options; children: null; value: "chore" }>
>().not.toExtend<Props>()
expectTypeOf<
  Readonly<{
    items: typeof options
    children: null
    multiple: true
    value: "feat"
  }>
>().not.toExtend<Props>()
expectTypeOf<
  Readonly<{
    items: typeof options
    children: null
    multiple: true
    value: readonly ["chore"]
  }>
>().not.toExtend<Props>()
expectTypeOf<
  Readonly<{
    items: typeof options
    children: null
    onValueChange: (value: number) => void
  }>
>().not.toExtend<Props>()

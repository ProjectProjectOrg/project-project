import { UserId } from "@pp/shared"
import type { ReactElement } from "react"
import { expectTypeOf } from "vitest"

import { DropdownMenuRadioGroup } from "./dropdown-menu"

const items = [
  { value: "feat", label: "Feature" },
  { value: "bug", label: "Bug" }
] as const

const single = (
  <DropdownMenuRadioGroup
    items={items}
    value="feat"
    onValueChange={(value, details) => {
      expectTypeOf(value).toEqualTypeOf<"feat" | "bug">()
      expectTypeOf(details.cancel).toEqualTypeOf<() => void>()
    }}
  />
)

const branded = (
  <DropdownMenuRadioGroup
    items={[
      { value: "all", label: "Anyone" },
      { value: UserId.make("user-1"), label: "Ada" }
    ]}
    value={null}
    onValueChange={(value) =>
      expectTypeOf(value).toEqualTypeOf<UserId | "all">()
    }
  />
)

expectTypeOf(single).toExtend<ReactElement>()
expectTypeOf(branded).toExtend<ReactElement>()

type Props = Parameters<typeof DropdownMenuRadioGroup<typeof items>>[0]

expectTypeOf<
  Readonly<{ items: typeof items; value: "chore" }>
>().not.toExtend<Props>()
expectTypeOf<
  Readonly<{ items: typeof items; defaultValue: "chore" }>
>().not.toExtend<Props>()
expectTypeOf<
  Readonly<{
    items: typeof items
    onValueChange: (value: number) => void
  }>
>().not.toExtend<Props>()

import type { ReactElement } from "react"
import { expectTypeOf } from "vitest"

import { InlineForm } from "./inline-form"

const form = (
  <InlineForm.Root
    actions={["create", "connect"]}
    mode="create"
    onModeChange={(mode) =>
      expectTypeOf(mode).toEqualTypeOf<"idle" | "create" | "connect">()
    }
  >
    {null}
  </InlineForm.Root>
)
expectTypeOf(form).toExtend<ReactElement>()

type Props = Parameters<typeof InlineForm.Root<"create">>[0]
expectTypeOf<
  Readonly<{ actions: readonly ["create"]; mode: "clear"; children: null }>
>().not.toExtend<Props>()

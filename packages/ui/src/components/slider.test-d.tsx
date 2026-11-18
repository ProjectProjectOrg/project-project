import type { ReactElement } from "react"
import { expectTypeOf } from "vitest"

import { Slider, type SliderProps } from "./slider"

const single = (
  <Slider
    label="Zoom"
    value={20}
    onChange={(value) => expectTypeOf(value).toEqualTypeOf<number>()}
  />
)

expectTypeOf(single).toExtend<ReactElement>()
// A label is required: it names the slider for everyone.
expectTypeOf<
  Readonly<{ value: number; onChange: (value: number) => void }>
>().not.toExtend<SliderProps>()

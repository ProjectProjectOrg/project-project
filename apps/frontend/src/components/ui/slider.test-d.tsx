import type { ReactElement } from "react"
import { expectTypeOf } from "vitest"

import { Slider, type SliderProps } from "./slider"

const single = (
  <Slider
    value={20}
    onChange={(value) => expectTypeOf(value).toEqualTypeOf<number>()}
  />
)

const range = (
  <Slider
    range
    value={[20, 80]}
    onChange={(value) =>
      expectTypeOf(value).toEqualTypeOf<readonly [number, number]>()
    }
  />
)

expectTypeOf(single).toExtend<ReactElement>()
expectTypeOf(range).toExtend<ReactElement>()
expectTypeOf<
  Readonly<{
    value: readonly [number, number]
    onChange: (value: readonly [number, number]) => void
  }>
>().not.toExtend<SliderProps>()
expectTypeOf<
  Readonly<{ range: true; value: number; onChange: (value: number) => void }>
>().not.toExtend<SliderProps>()
expectTypeOf<
  Readonly<{
    range: true
    value: readonly [number, number]
    onChange: (value: number) => void
  }>
>().not.toExtend<SliderProps>()

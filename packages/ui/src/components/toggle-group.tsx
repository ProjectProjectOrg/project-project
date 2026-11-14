import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"

import { Button } from "./button"

export function ToggleGroup<Value extends string>(
  props: Readonly<ToggleGroupPrimitive.Props<Value>>
) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className="flex items-center gap-0.5"
      {...props}
    />
  )
}

export function ToggleGroupItem<Value extends string>(
  props: Readonly<TogglePrimitive.Props<Value>>
) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      render={<Button variant="toolbar" size="square-7" />}
      {...props}
    />
  )
}

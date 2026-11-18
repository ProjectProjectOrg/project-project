import { RegistryContext } from "@effect/atom-react"
import type { SidebarPin } from "@pp/shared"
import { useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import { pinsRequest, reorderPin } from "@/features/pins/atoms/pins"
import { movedPin } from "@/features/pins/lib/pins"

export function usePinReorder(orgSlug: string, slug: string) {
  const registry = useContext(RegistryContext)
  return (pins: ReadonlyArray<SidebarPin>, order: ReadonlyArray<string>) => {
    const move = movedPin(pins, order)
    if (move === null) return
    void fireMutation(
      registry,
      reorderPin({
        req: pinsRequest(orgSlug),
        slug,
        kind: move.pin._tag,
        ref: move.pin.ref
      }),
      { orderKey: move.orderKey }
    )
  }
}

import { SidebarRowGroup, SidebarSubRows } from "@pp/ui/sidebar"

import { PinRow } from "@/features/pins/components/PinRow"
import { type PinRowSpec, type PinNode } from "@/features/pins/lib/pins"

// A row and, under it, the rows of its sub-tickets (indented, with the
// sidebar's sub-row line), as many levels as there are. The sub-rows stay
// mounted while empty so a sub-ticket's row grows in like a top-level one.
export function PinTree({
  orgSlug,
  slug,
  node
}: Readonly<{ orgSlug: string; slug: string; node: PinNode<PinRowSpec> }>) {
  const { row, children } = node
  return (
    <>
      <PinRow
        orgSlug={orgSlug}
        slug={slug}
        target={row.target}
        display={row.display}
        pinned={row.pin !== null}
        active={row.active}
        highlight={row.highlight}
        onPinned={row.onPinned}
      />
      <SidebarSubRows>
        <SidebarRowGroup>
          {children.map((child) => (
            <PinTree
              key={child.row.key}
              orgSlug={orgSlug}
              slug={slug}
              node={child}
            />
          ))}
        </SidebarRowGroup>
      </SidebarSubRows>
    </>
  )
}

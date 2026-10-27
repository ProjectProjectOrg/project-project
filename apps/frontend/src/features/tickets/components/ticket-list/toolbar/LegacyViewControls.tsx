import { Filters } from "./Filters"
import { Sort } from "./parts"

export function LegacyViewControls({
  showSort
}: Readonly<{ showSort: boolean }>) {
  return (
    <>
      <Filters />
      {showSort && <Sort />}
    </>
  )
}

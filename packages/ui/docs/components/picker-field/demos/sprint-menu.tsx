import { useState } from "react"

import { START } from "./parts/data"
import { SprintField } from "./parts/field"

const ignore = () => undefined

// The sprint picker, held open: it only picks.
export default function SprintMenu() {
  const [value, setValue] = useState<string | null>(START.sprint)
  return (
    <div className="min-h-80 w-full">
      <SprintField
        value={value}
        onChange={setValue}
        onOpen={ignore}
        defaultOpen
      />
    </div>
  )
}

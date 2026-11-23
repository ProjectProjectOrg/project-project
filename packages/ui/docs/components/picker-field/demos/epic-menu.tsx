import { useState } from "react"

import { START } from "./parts/data"
import { EpicField } from "./parts/field"

const ignore = () => undefined

export default function EpicMenu() {
  const [value, setValue] = useState<string | null>(START.epic)
  return (
    <div className="min-h-96 w-full">
      <EpicField
        value={value}
        onChange={setValue}
        onOpen={ignore}
        defaultOpen
      />
    </div>
  )
}

import { Checkbox } from "@pp/ui/checkbox"
import { useId, useState } from "react"

const FIELDS = ["Description", "Acceptance criteria", "Tags"] as const

export default function InAForm() {
  const id = useId()
  const [fields, setFields] = useState<ReadonlyArray<boolean>>([
    true,
    false,
    true
  ])
  const allOn = fields.every(Boolean)
  const someOn = fields.some(Boolean)
  return (
    <div className="flex flex-col gap-2 text-body">
      <label
        htmlFor={`${id}-all`}
        className="flex w-fit cursor-pointer items-center gap-2"
      >
        <Checkbox
          id={`${id}-all`}
          checked={allOn}
          indeterminate={someOn && !allOn}
          onCheckedChange={() => setFields(fields.map(() => !allOn))}
        />
        Include everything
      </label>
      {FIELDS.map((label, index) => (
        <label
          key={label}
          htmlFor={`${id}-${index}`}
          className="ml-6 flex w-fit cursor-pointer items-center gap-2"
        >
          <Checkbox
            id={`${id}-${index}`}
            checked={fields[index] === true}
            onCheckedChange={(next) =>
              setFields(fields.map((value, i) => (i === index ? next : value)))
            }
          />
          {label}
        </label>
      ))}
    </div>
  )
}

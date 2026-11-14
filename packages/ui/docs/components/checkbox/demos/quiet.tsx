import { Checkbox } from "@pp/ui/checkbox"

export default function Quiet() {
  return (
    <div className="flex gap-6">
      <Checkbox aria-label="Quiet" variant="quiet" />
      <Checkbox aria-label="Quiet checked" variant="quiet" defaultChecked />
      <Checkbox aria-label="Quiet mixed" variant="quiet" indeterminate />
    </div>
  )
}

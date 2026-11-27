import { CheckboxIndicator } from "@pp/ui/checkbox"

export default function Indicator() {
  return (
    <div className="flex gap-6">
      <CheckboxIndicator checked={false} />
      <CheckboxIndicator checked />
      <CheckboxIndicator checked={false} variant="quiet" />
      <CheckboxIndicator checked variant="quiet" />
      <CheckboxIndicator checked disabled />
    </div>
  )
}

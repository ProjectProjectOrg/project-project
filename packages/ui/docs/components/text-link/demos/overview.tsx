import { TextLink } from "@pp/ui/text-link"

export default function Overview() {
  return (
    <p className="text-body">
      <TextLink href="#parent">Improve the verification workflow</TextLink>
      <span className="text-muted-foreground"> / </span>
      Check ticket editing
    </p>
  )
}

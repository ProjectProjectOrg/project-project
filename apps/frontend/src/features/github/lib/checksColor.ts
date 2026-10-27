export function checksColor(s: string): string {
  if (s === "passing") return "text-state-success"
  if (s === "failing") return "text-state-danger"
  if (s === "pending") return "text-state-warning"
  return "text-muted-foreground"
}

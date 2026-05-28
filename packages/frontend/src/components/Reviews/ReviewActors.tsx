import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { ReviewActor } from "@projectproject/shared"

export function ActorAvatar({
  actor,
  size = "sm"
}: {
  actor: ReviewActor
  size?: "xs" | "sm"
}) {
  return (
    <Avatar
      size={size === "xs" ? "default" : "sm"}
      className={cn(size === "xs" && "size-5")}
    >
      {actor.avatarUrl && <AvatarImage src={actor.avatarUrl} alt="" />}
      <AvatarFallback>{actor.login.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

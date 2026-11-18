import { RegistryContext } from "@effect/atom-react"
import { useContext } from "react"

import {
  commandMenuState,
  commandScopes,
  pointedTicket
} from "../atoms/commandMenu"
import { openCommandMenu, type CommandPage } from "../lib/commandMenu"
import { openFromScopes } from "../lib/commandScopes"

export function useOpenCommandMenu(orgSlug: string) {
  const registry = useContext(RegistryContext)
  return (page: CommandPage = "root") =>
    registry.set(
      commandMenuState,
      page === "root"
        ? openFromScopes(
            orgSlug,
            registry.get(commandScopes),
            registry.get(pointedTicket)
          )
        : openCommandMenu(null, page)
    )
}

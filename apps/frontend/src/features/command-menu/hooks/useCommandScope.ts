import { RegistryContext } from "@effect/atom-react"
import { useContext, useEffect } from "react"

import { commandScopes } from "../atoms/commandMenu"
import type { CommandScope } from "../lib/commandScopes"

export function useCommandScope(scope: CommandScope) {
  const registry = useContext(RegistryContext)
  useEffect(() => {
    registry.set(commandScopes, [...registry.get(commandScopes), scope])
    return () => {
      registry.set(
        commandScopes,
        registry.get(commandScopes).filter((entry) => entry !== scope)
      )
    }
  }, [registry, scope])
}

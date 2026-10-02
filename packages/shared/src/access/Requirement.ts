import type { Statement } from "@pp/access"

export type Requirement<S extends Statement.Resources> =
  | Statement.Grants<S>
  | "membership"

export const permits = <S extends Statement.Resources>(
  permissions: Statement.Role<S>,
  requirement: Requirement<S>
): boolean => requirement === "membership" || permissions.can(requirement)

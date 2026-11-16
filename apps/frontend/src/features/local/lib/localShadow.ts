const FLAG = "pp:local-shadow"

export const localShadowChecks = () => {
  try {
    return window.localStorage.getItem(FLAG) === "on"
  } catch {
    return false
  }
}

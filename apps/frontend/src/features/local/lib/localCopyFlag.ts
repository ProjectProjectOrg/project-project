const FLAG = "pp:local-copy"

export const localCopyEnabled = () => {
  try {
    return window.localStorage.getItem(FLAG) === "on"
  } catch {
    return false
  }
}

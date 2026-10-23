import { isIP } from "node:net"

type Ipv4Range = readonly [base: number, prefix: number]

const ipv4 = (address: string): number | null => {
  const parts = address.split(".")
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

const range = (base: string, prefix: number): Ipv4Range => [
  ipv4(base) ?? 0,
  prefix
]

const NON_PUBLIC_IPV4: ReadonlyArray<Ipv4Range> = [
  range("0.0.0.0", 8),
  range("10.0.0.0", 8),
  range("100.64.0.0", 10),
  range("127.0.0.0", 8),
  range("169.254.0.0", 16),
  range("172.16.0.0", 12),
  range("192.0.0.0", 24),
  range("192.0.2.0", 24),
  range("192.88.99.0", 24),
  range("192.168.0.0", 16),
  range("198.18.0.0", 15),
  range("198.51.100.0", 24),
  range("203.0.113.0", 24),
  range("224.0.0.0", 4),
  range("240.0.0.0", 4)
]

const inRange = (value: number, [base, prefix]: Ipv4Range): boolean => {
  const size = 2 ** (32 - prefix)
  return Math.floor(value / size) === Math.floor(base / size)
}

const isPublicIpv4 = (address: string): boolean => {
  const value = ipv4(address)
  if (value === null) return false
  return !NON_PUBLIC_IPV4.some((r) => inRange(value, r))
}

const ipv6Groups = (address: string): ReadonlyArray<number> | null => {
  const zoneless = address.split("%")[0] ?? ""
  const lastColon = zoneless.lastIndexOf(":")
  const tail = zoneless.slice(lastColon + 1)
  const embedded = tail.includes(".") ? ipv4(tail) : null
  const hex =
    embedded === null
      ? zoneless
      : `${zoneless.slice(0, lastColon + 1)}${Math.floor(embedded / 65536).toString(16)}:${(embedded % 65536).toString(16)}`
  const [head = "", rest] = hex.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = rest === undefined || rest === "" ? [] : rest.split(":")
  const missing = 8 - left.length - right.length
  if (rest === undefined ? missing !== 0 : missing < 1) return null
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right].map(
    (group) => Number.parseInt(group, 16)
  )
  return groups.some((group) => Number.isNaN(group) || group > 0xffff)
    ? null
    : groups
}

const embeddedIpv4 = (groups: ReadonlyArray<number>): string => {
  const high = groups[6] ?? 0
  const low = groups[7] ?? 0
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
}

const isPublicIpv6 = (address: string): boolean => {
  const groups = ipv6Groups(address)
  if (groups === null) return false
  const [first = 0, second = 0] = groups
  const zeroPrefix = groups.slice(0, 5).every((group) => group === 0)
  if (zeroPrefix && groups[5] === 0xffff) {
    return isPublicIpv4(embeddedIpv4(groups))
  }
  if (first === 0x64 && second === 0xff9b) {
    return isPublicIpv4(embeddedIpv4(groups))
  }
  if (zeroPrefix && groups[5] === 0) return false
  if ((first & 0xfe00) === 0xfc00) return false
  if ((first & 0xffc0) === 0xfe80) return false
  if ((first & 0xff00) === 0xff00) return false
  if (first === 0x2001 && (second === 0 || second === 0x0db8)) return false
  if (first === 0x2002) return false
  return true
}

export const isPublicAddress = (address: string): boolean => {
  switch (isIP(address)) {
    case 4:
      return isPublicIpv4(address)
    case 6:
      return isPublicIpv6(address)
    default:
      return false
  }
}

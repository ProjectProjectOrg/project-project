import { isIPv4, isIPv6 } from "node:net"

const ipv4Value = (address: string): number =>
  address
    .split(".")
    .reduce((value, part) => value * 256 + Number.parseInt(part, 10), 0)

const ipv4Blocked: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
]

const inIpv4Range = (value: number, base: string, bits: number) => {
  const size = 2 ** (32 - bits)
  const start = ipv4Value(base)
  return value >= start && value < start + size
}

const isPublicIpv4 = (address: string) => {
  const value = ipv4Value(address)
  return !ipv4Blocked.some(([base, bits]) => inIpv4Range(value, base, bits))
}

const ipv6Hextets = (address: string): ReadonlyArray<number> => {
  const zoneless = address.split("%")[0] ?? address
  const tail = zoneless.match(/(\d+\.\d+\.\d+\.\d+)$/u)?.[1]
  const head = tail
    ? (() => {
        const value = ipv4Value(tail)
        return `${zoneless.slice(0, -tail.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
      })()
    : zoneless
  const [left = "", right] = head.split("::")
  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((hex) => Number.parseInt(hex, 16))
  const leading = parse(left)
  const trailing = right === undefined ? [] : parse(right)
  const missing = 8 - leading.length - trailing.length
  return [...leading, ...Array.from({ length: missing }, () => 0), ...trailing]
}

const embeddedIpv4 = (high: number, low: number) =>
  `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`

const isPublicIpv6 = (address: string): boolean => {
  const h = ipv6Hextets(address)
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, last = 0] = h
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) {
    if (f === 0xffff) return isPublicIpv4(embeddedIpv4(g, last))
    return false
  }
  if (a === 0x64 && b === 0xff9b) {
    if (c === 0 && d === 0 && e === 0 && f === 0)
      return isPublicIpv4(embeddedIpv4(g, last))
    return false
  }
  if (a === 0x2002) return isPublicIpv4(embeddedIpv4(b, c))
  if (a === 0x100 && b === 0 && c === 0 && d === 0) return false
  if (a === 0x2001 && b < 0x200) return false
  if (a === 0x2001 && b === 0xdb8) return false
  if ((a & 0xfe00) === 0xfc00) return false
  if ((a & 0xffc0) === 0xfe80) return false
  if ((a & 0xffc0) === 0xfec0) return false
  if ((a & 0xff00) === 0xff00) return false
  return true
}

export const isPublicAddress = (address: string): boolean =>
  isIPv4(address)
    ? isPublicIpv4(address)
    : isIPv6(address)
      ? isPublicIpv6(address)
      : false

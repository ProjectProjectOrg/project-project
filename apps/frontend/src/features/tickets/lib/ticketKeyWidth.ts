export const ticketKeyWidth = ({
  key,
  nextTicketNumber
}: Readonly<{ key: string; nextTicketNumber: number }>): string => {
  const highest = String(Math.max(1, nextTicketNumber - 1))
  return `${key.length + 1 + highest.length}ch`
}

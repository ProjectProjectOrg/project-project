export const isBlankAbout = (body: string, name: string): boolean => {
  const text = body.trim()
  return text === "" || text === `# ${name}`
}

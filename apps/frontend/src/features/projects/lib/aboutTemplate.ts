export const isBlankAbout = (body: string, name: string) => {
  const text = body.trim()
  return text === "" || text === `# ${name}`
}

export const copy = {
  appName: "ProjectProject",
  welcomeEyebrow: "Welcome to",
  welcomeBody: "Connect to your self-hosted server.",
  welcomeStart: "Get started",
  signInTitle: "Sign in",
  serversTitle: "Servers",
  orgHomeTitle: "Organization",
  loadFailed: "Couldn’t load your servers.",
  addressTitle: "Enter your server address",
  addressBody: "The address you use to open ProjectProject in a browser.",
  addressLabel: "Server address",
  addressPlaceholder: "projects.example.com",
  addressResolves: (origin: string) => `Connects to ${origin}`,
  addressInsecure: "Not encrypted. Use only on a trusted network.",
  addressContinue: "Continue",
  addressProblems: {
    empty: "Enter your server address.",
    invalid: "That isn’t a web address.",
    insecure: "Use an https:// address."
  },
  serverProblems: {
    unreachable: "Can’t reach this server. Check the address and your network.",
    not_projectproject: "This isn’t a ProjectProject server.",
    not_configured:
      "This server isn’t set up for the app yet. Ask whoever runs it to set an instance ID.",
    insecure_redirect:
      "This server redirects to an address that isn’t encrypted.",
    server_outdated: "This server needs an update before the app can connect.",
    app_outdated: "This server needs a newer version of the app."
  },
  checkFailed: "Couldn’t check this server. Try again.",
  confirmLead: "You’re signing in to",
  confirmVersion: (version: string) => `Version ${version}`,
  confirmSignIn: "Sign in",
  confirmChangeServer: "Use a different server",
  saveFailed: "Couldn’t save this server. Try again.",
  signedOutLead: "You were signed out of",
  signOut: "Sign out",
  noOrgsLead: "You’re signed in to",
  noOrgsBody:
    "You aren’t in any organization on this server yet. Ask someone there to invite you, then check again.",
  noOrgsCheckAgain: "Check again",
  serversFooter:
    "Each server is its own account. The app opens on the organization you used last.",
  serverRowSubtitle: (userName: string | null, host: string) =>
    userName === null ? `Signed out · ${host}` : `${userName} · ${host}`,
  addServer: "Add server",
  serverDetailLead: "Server",
  serverStatusTitle: "Status",
  serverStatusChecking: "Checking…",
  serverStatus: {
    connected: "Connected",
    signed_out: "Signed out",
    unreachable: "Can’t reach this server",
    moved: "This address now belongs to a different server",
    not_configured: "Not set up for the app",
    server_outdated: "Server update required",
    app_outdated: "App update required"
  },
  accountTitle: "Account",
  notSignedIn: "Not signed in",
  signingIn: "Signing in…",
  signingOut: "Signing out…",
  signOutFailed: "Couldn’t sign out. Try again.",
  organizationsTitle: "Organizations",
  removeServer: "Remove server",
  removeServerConfirm: (name: string) =>
    `Remove ${name} from this phone? You’ll be signed out and its cached data is deleted.`,
  removeServerFailed: "Couldn’t remove this server. Try again.",
  cancel: "Cancel",
  switchOrgLabel: (name: string) => `${name}, switch organization`,
  projectsTitle: "Projects",
  noProjects: "No projects in this organization yet.",
  projectsFailed: "Couldn’t load the projects.",
  signInFailed: "Sign-in didn’t finish. Try again.",
  signInUnreachable: "Can’t reach this server right now. Try again.",
  signInInstanceChanged:
    "This address now belongs to a different ProjectProject server. Add it again to continue."
} as const

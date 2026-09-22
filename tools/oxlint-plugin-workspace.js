import path from "node:path"

const workspaceNamePattern =
  /(?:^|[/\\])(apps|packages)[/\\]([^/\\]+)(?:[/\\]|$)/

function workspaceNameFor(filePath) {
  const match = workspaceNamePattern.exec(filePath)
  return match ? `${match[1]}/${match[2]}` : undefined
}

function filenameFromContext(context) {
  if (typeof context.filename === "string") {
    return context.filename
  }

  if (typeof context.physicalFilename === "string") {
    return context.physicalFilename
  }

  if (typeof context.getFilename === "function") {
    return context.getFilename()
  }

  return undefined
}

function reportIfCrossPackage(context, node) {
  const source = node.source?.value

  if (typeof source !== "string" || !source.startsWith(".")) {
    return
  }

  const filename = filenameFromContext(context)

  if (!filename || filename === "<input>") {
    return
  }

  const fromPackage = workspaceNameFor(filename)
  const resolvedImport = path.resolve(path.dirname(filename), source)
  const toPackage = workspaceNameFor(resolvedImport)

  if (fromPackage && toPackage && fromPackage !== toPackage) {
    context.report({
      node: node.source,
      message:
        "Use the workspace package name instead of a relative import across package boundaries."
    })
  }
}

export default {
  rules: {
    "no-relative-packages": {
      meta: {
        type: "problem",
        docs: {
          description:
            "disallow relative imports that cross workspace package boundaries"
        },
        schema: []
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            reportIfCrossPackage(context, node)
          },
          ExportNamedDeclaration(node) {
            reportIfCrossPackage(context, node)
          },
          ExportAllDeclaration(node) {
            reportIfCrossPackage(context, node)
          }
        }
      }
    }
  }
}

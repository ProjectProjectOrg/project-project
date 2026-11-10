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

const FIELD_TOUCH_SIZE = "pointer-coarse:text-[16px]"

function utilityOf(token) {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i++) {
    const char = token[i]
    if (char === "[") depth++
    else if (char === "]") depth--
    else if (char === ":" && depth === 0) cut = i
  }
  return token.slice(cut + 1).replace(/^!/, "")
}

function typeScaleProblem(token) {
  if (token === FIELD_TOUCH_SIZE) return undefined
  const utility = utilityOf(token)
  if (
    /^text-(xs|sm|base|lg|[2-9]?xl)(\/.+)?$/.test(utility) ||
    /^text-\[\d+(\.\d+)?(px|rem|em)\]$/.test(utility)
  ) {
    return `Use a type role (text-display, text-title, text-subtitle, text-body, text-caption, text-micro) instead of \`${token}\`.`
  }
  if (utility === "uppercase" || /^tracking-/.test(utility)) {
    return `Hierarchy comes from size and weight, not case or letter-spacing: drop \`${token}\`.`
  }
  if (/^text-(muted-)?foreground\/\d+$/.test(utility)) {
    return `Text is text-foreground or text-muted-foreground, never an opacity step: replace \`${token}\`.`
  }
  if (/^font-(thin|extralight|light|medium|extrabold|black)$/.test(utility)) {
    return `Text uses font-normal, font-semibold or font-bold (display only): replace \`${token}\`.`
  }
  return undefined
}

function reportTypeScale(context, node, text) {
  for (const token of text.split(/\s+/)) {
    const message = token && typeScaleProblem(token)
    if (message) context.report({ node, message })
  }
}

export default {
  rules: {
    "type-scale": {
      meta: {
        type: "problem",
        docs: {
          description:
            "keep text on the Fluid type scale: roles, three weights, two colors"
        },
        schema: []
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value === "string") {
              reportTypeScale(context, node, node.value)
            }
          },
          TemplateElement(node) {
            reportTypeScale(context, node, node.value.cooked ?? node.value.raw)
          }
        }
      }
    },
    "no-raw-api-query": {
      meta: {
        type: "problem",
        docs: {
          description:
            "require the revalidating query wrapper instead of Api.query"
        },
        schema: []
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (
              !node.computed &&
              node.object?.type === "Identifier" &&
              node.object.name === "Api" &&
              node.property?.name === "query"
            ) {
              context.report({
                node,
                message:
                  'Use `query` from "@/api/query" so the view revalidates when the tab regains focus and when it remounts.'
              })
            }
          }
        }
      }
    },
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

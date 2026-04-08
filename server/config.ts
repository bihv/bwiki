import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DocsAdminAuthConfig {
  password: string | null
  username: string | null
}

export interface DocsServerConfig {
  adminAuth: DocsAdminAuthConfig
  contentRootPath: string
  port: number
}

function readOptionalCredential(value: string | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : null
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function loadEnvFileIntoEnv(env: NodeJS.ProcessEnv, filePath: string) {
  if (!existsSync(filePath)) {
    return
  }

  const source = readFileSync(filePath, 'utf8')

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const rawKey = line.slice(0, separatorIndex).trim()
    if (!rawKey || rawKey in env) {
      continue
    }

    const rawValue = line.slice(separatorIndex + 1).trim()
    env[rawKey] = stripWrappingQuotes(rawValue)
  }
}

function loadDefaultEnvFiles(env: NodeJS.ProcessEnv, cwd: string) {
  loadEnvFileIntoEnv(env, resolve(cwd, '.env'))
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { cwd?: string; loadEnvFile?: boolean } = {},
): DocsServerConfig {
  const cwd = options.cwd ?? process.cwd()

  if (options.loadEnvFile ?? env === process.env) {
    loadDefaultEnvFiles(env, cwd)
  }

  const rawPort = env.PORT ?? '3000'
  const port = Number(rawPort)
  const adminUsername = readOptionalCredential(env.DOCS_ADMIN_USERNAME)
  const adminPassword = readOptionalCredential(env.DOCS_ADMIN_PASSWORD)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`)
  }

  if ((adminUsername && !adminPassword) || (!adminUsername && adminPassword)) {
    throw new Error('DOCS_ADMIN_USERNAME and DOCS_ADMIN_PASSWORD must be configured together')
  }

  return {
    adminAuth: {
      username: adminUsername,
      password: adminPassword,
    },
    contentRootPath: resolve(cwd, env.DOCS_CONTENT_ROOT ?? 'content'),
    port,
  }
}

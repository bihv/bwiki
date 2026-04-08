import { resolve } from 'node:path'

export interface DocsServerConfig {
  contentRootPath: string
  port: number
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): DocsServerConfig {
  const rawPort = env.PORT ?? '3000'
  const port = Number(rawPort)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`)
  }

  return {
    contentRootPath: resolve(env.DOCS_CONTENT_ROOT ?? 'content'),
    port,
  }
}

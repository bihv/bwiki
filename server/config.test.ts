// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadServerConfig } from './config'

const cleanupTasks: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop()
    await cleanup?.()
  }
})

describe('loadServerConfig', () => {
  it('loads admin credentials from .env when process env is unset', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'bwiki-config-'))
    cleanupTasks.push(() => rm(tempRoot, { recursive: true, force: true }))

    await writeFile(
      join(tempRoot, '.env'),
      'PORT=4010\nDOCS_CONTENT_ROOT=custom-content\nDOCS_ADMIN_USERNAME=admin\nDOCS_ADMIN_PASSWORD=secret\n',
      'utf8',
    )

    const env: NodeJS.ProcessEnv = {}
    const config = loadServerConfig(env, { cwd: tempRoot, loadEnvFile: true })

    expect(config.adminAuth).toEqual({
      username: 'admin',
      password: 'secret',
    })
    expect(config.contentRootPath).toBe(resolve(tempRoot, 'custom-content'))
    expect(config.port).toBe(4010)
  })
})

// @vitest-environment node

import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPublishService } from '../services/publish-service'
import { createTestContentRoot } from './test-content-root'

const cleanupTasks: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop()
    await cleanup?.()
  }
})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function buildDocSource(input: {
  title: string
  summary: string
  slug: string
  section: string
  translationKey: string
  body: string
  status: 'draft' | 'published'
}) {
  return `---
title: ${input.title}
summary: ${input.summary}
slug: ${input.slug}
section: ${input.section}
order: 1
tags:
  - guides
translationKey: ${input.translationKey}
translationStatus: current
status: ${input.status}
---
${input.body}
`
}

async function waitFor(check: () => Promise<void>, timeoutMs = 1_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await check()
      return
    } catch (error) {
      await delay(10)
      if (Date.now() - startedAt >= timeoutMs) {
        throw error
      }
    }
  }
}

describe('createPublishService', () => {
  it('promotes staged content and a new public build only after the staged rebuild succeeds', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current public summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nThis is the live content.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Updated staged summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nThis should publish safely.',
        status: 'draft',
      }),
    )

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      runPublicBuild: vi.fn(async ({ workspaceRoot, outDir }) => {
        const stagedDoc = await readFile(
          join(workspaceRoot, 'content', 'docs', 'v2.0', 'en', 'guides', 'cli.mdx'),
          'utf8',
        )
        const liveDoc = await contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')

        expect(stagedDoc).toContain('Updated staged summary.')
        expect(stagedDoc).toContain('status: published')
        expect(liveDoc).toContain('Current public summary.')
        expect(liveDoc).not.toContain('Updated staged summary.')

        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), '<html>build-002</html>', 'utf8')
      }),
    })

    const response = await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    expect(response).toEqual({ status: 'queued' })

    await publishService.waitForIdle()

    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'Updated staged summary.',
    )
    await expect(contentRoot.readContentFile('system/publish-history.json')).resolves.toContain('"targetSlug": "guides/cli"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"currentBuildId": "build-002"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": "ready"')

    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-002', 'index.html')),
    ).resolves.toBeUndefined()

    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'ready',
      currentBuildId: 'build-002',
      lastSuccessfulBuildId: 'build-002',
      error: null,
    })
  })

  it('keeps the last known good content and build when the staged rebuild fails', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current public summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nThis is the live content.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Broken staged summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nThis should not replace the live build.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-001',
          lastSuccessfulBuildId: 'build-001',
          queuedAt: null,
          updatedAt: '2026-04-08T10:00:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )
    await mkdir(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001'), { recursive: true })
    await writeFile(
      join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html'),
      '<html>build-001</html>',
      'utf8',
    )

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      runPublicBuild: vi.fn(async ({ workspaceRoot }) => {
        const stagedDoc = await readFile(
          join(workspaceRoot, 'content', 'docs', 'v2.0', 'en', 'guides', 'cli.mdx'),
          'utf8',
        )

        expect(stagedDoc).toContain('Broken staged summary.')

        throw new Error('staged rebuild failed')
      }),
    })

    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await publishService.waitForIdle()

    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'Current public summary.',
    )
    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.not.toContain(
      'Broken staged summary.',
    )
    await expect(contentRoot.readContentFile('system/publish-history.json')).resolves.toBe('[]\n')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"currentBuildId": "build-001"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": "failed"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain(
      '"error": "staged rebuild failed"',
    )

    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-002', 'index.html')),
    ).rejects.toThrow()

    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'failed',
      currentBuildId: 'build-001',
      lastSuccessfulBuildId: 'build-001',
      error: 'staged rebuild failed',
    })
  })

  it('rejects publish when build-state.json fails schema validation and does not replace it with fallback state', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Queued CLI summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nQueued CLI body.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: '',
          currentBuildId: null,
          lastSuccessfulBuildId: null,
          queuedAt: null,
          updatedAt: null,
          error: null,
        },
        null,
        2,
      ),
    )

    const runPublicBuild = vi.fn()
    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      runPublicBuild,
    })

    await expect(
      publishService.publish({
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
      }),
    ).rejects.toThrow()

    await publishService.waitForIdle()

    expect(runPublicBuild).not.toHaveBeenCalled()
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": ""')
  })

  it('rejects stale publish requests when the draft changed since it was loaded', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Original draft summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nOriginal draft body.',
        status: 'draft',
      }),
    )

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      runPublicBuild: vi.fn(),
    })

    const initialStatus = await publishService.getStatus()
    expect(initialStatus.status).toBe('idle')

    const originalDraftUpdatedAt = (await stat(join(contentRoot.contentPath, 'drafts', 'v2.0', 'en', 'guides', 'cli.mdx'))).mtime.toISOString()

    await delay(10)
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Newer draft summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nNewer draft body.',
        status: 'draft',
      }),
    )

    await expect(
      publishService.publish({
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        expectedUpdatedAt: originalDraftUpdatedAt,
        actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
      }),
    ).rejects.toThrow('Draft has changed since it was loaded')
  })

  it('treats missing build-state.json after initialization as corruption instead of recreating it', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Queued CLI summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nQueued CLI body.',
        status: 'draft',
      }),
    )

    const runPublicBuild = vi.fn()
    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      runPublicBuild,
    })

    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'idle',
    })

    await rm(join(contentRoot.contentPath, 'system', 'build-state.json'))

    await expect(
      publishService.publish({
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
      }),
    ).rejects.toThrow()

    await publishService.waitForIdle()

    expect(runPublicBuild).not.toHaveBeenCalled()
    await expect(contentRoot.readContentFile('system/build-state.json')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not bootstrap build-state when the path exists but cannot be read (directory)', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    const buildStatePath = join(contentRoot.contentPath, 'system', 'build-state.json')
    await rm(buildStatePath, { force: true })
    await mkdir(buildStatePath, { recursive: true })

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
    })

    await expect(publishService.getStatus()).rejects.toThrow()
    const stats = await stat(buildStatePath)
    expect(stats.isDirectory()).toBe(true)
  })

  it('rolls back the promoted build and live source when a post-build source write fails', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current public summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nThis is the live content.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Updated staged summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nThis should publish safely.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-001',
          lastSuccessfulBuildId: 'build-001',
          queuedAt: null,
          updatedAt: '2026-04-08T10:00:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )
    await mkdir(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001'), { recursive: true })
    await writeFile(
      join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html'),
      '<html>build-001</html>',
      'utf8',
    )
    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      writePublishedSource: vi.fn(async () => {
        throw new Error('live source write failed')
      }),
      runPublicBuild: vi.fn(async ({ outDir }) => {
        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), '<html>build-002</html>', 'utf8')
      }),
    })

    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await publishService.waitForIdle()

    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'Current public summary.',
    )
    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.not.toContain(
      'Updated staged summary.',
    )
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html')),
    ).resolves.toBeUndefined()
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-002', 'index.html')),
    ).rejects.toThrow()
    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'failed',
      currentBuildId: 'build-001',
      lastSuccessfulBuildId: 'build-001',
    })
  })

  it('rolls back the promoted build and live state when publish-history persistence fails after promotion', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current public summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nThis is the live content.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Updated staged summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nThis should publish safely.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-001',
          lastSuccessfulBuildId: 'build-001',
          queuedAt: null,
          updatedAt: '2026-04-08T10:00:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )
    await mkdir(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001'), { recursive: true })
    await writeFile(
      join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html'),
      '<html>build-001</html>',
      'utf8',
    )

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      writePublishHistoryFile: vi.fn(async () => {
        throw new Error('history write failed')
      }),
      runPublicBuild: vi.fn(async ({ outDir }) => {
        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), '<html>build-002</html>', 'utf8')
      }),
    })

    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await publishService.waitForIdle()

    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'Current public summary.',
    )
    await expect(contentRoot.readContentFile('system/publish-history.json')).resolves.toBe('[]\n')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"currentBuildId": "build-001"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": "failed"')
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html')),
    ).resolves.toBeUndefined()
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-002', 'index.html')),
    ).rejects.toThrow()
  })

  it('rolls back and reports failure when final build-state write fails after promotion', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current public summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nThis is the live content.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Updated staged summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nThis should publish safely.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-001',
          lastSuccessfulBuildId: 'build-001',
          queuedAt: null,
          updatedAt: '2026-04-08T10:00:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )
    await mkdir(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001'), { recursive: true })
    await writeFile(
      join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html'),
      '<html>build-001</html>',
      'utf8',
    )

    let readyWriteFailed = false
    const writeBuildStateFile = vi.fn(async ({ absolutePath, state }) => {
      if (!readyWriteFailed && state.status === 'ready') {
        readyWriteFailed = true
        throw new Error('final build-state write failed')
      }

      await writeFile(absolutePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    })

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      writeBuildStateFile,
      runPublicBuild: vi.fn(async ({ outDir }) => {
        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), '<html>build-002</html>', 'utf8')
      }),
    })

    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await publishService.waitForIdle()

    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'Current public summary.',
    )
    await expect(contentRoot.readContentFile('system/publish-history.json')).resolves.toBe('[]\n')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"currentBuildId": "build-001"')
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": "failed"')
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-001', 'index.html')),
    ).resolves.toBeUndefined()
    await expect(
      access(join(contentRoot.rootPath, '.runtime', 'public', 'builds', 'build-002', 'index.html')),
    ).rejects.toThrow()
    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'failed',
      currentBuildId: 'build-001',
      lastSuccessfulBuildId: 'build-001',
    })
    expect(readyWriteFailed).toBe(true)
  })

  it('runs accepted publishes one at a time', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Current CLI summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Public CLI\n\nCurrent CLI body.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/setup.mdx',
      buildDocSource({
        title: 'Setup',
        summary: 'Current setup summary.',
        slug: 'guides/setup',
        section: 'Guides',
        translationKey: 'guides.setup',
        body: '# Public Setup\n\nCurrent setup body.',
        status: 'published',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Queued CLI summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nQueued CLI body.',
        status: 'draft',
      }),
    )
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/setup.mdx',
      buildDocSource({
        title: 'Setup',
        summary: 'Queued setup summary.',
        slug: 'guides/setup',
        section: 'Guides',
        translationKey: 'guides.setup',
        body: '# Draft Setup\n\nQueued setup body.',
        status: 'draft',
      }),
    )

    let activeBuilds = 0
    let maxActiveBuilds = 0
    let buildCalls = 0
    let releaseFirstBuild!: () => void
    let releaseSecondBuild!: () => void
    const firstBuildGate = new Promise<void>((resolveGate) => {
      releaseFirstBuild = resolveGate
    })
    const secondBuildGate = new Promise<void>((resolveGate) => {
      releaseSecondBuild = resolveGate
    })
    const statusHistory: string[] = []

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: (() => {
        const buildIds = ['build-002', 'build-003']
        return () => buildIds.shift() ?? 'build-overflow'
      })(),
      writeBuildStateFile: vi.fn(async ({ absolutePath, state }) => {
        statusHistory.push(state.status)
        await writeFile(absolutePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      }),
      runPublicBuild: vi.fn(async ({ outDir }) => {
        buildCalls += 1
        activeBuilds += 1
        maxActiveBuilds = Math.max(maxActiveBuilds, activeBuilds)

        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), `<html>${buildCalls}</html>`, 'utf8')

        if (buildCalls === 1) {
          await firstBuildGate
        } else {
          await secondBuildGate
        }

        activeBuilds -= 1
      }),
    })

    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })
    await publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/setup',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await waitFor(async () => {
      expect(buildCalls).toBe(1)
      await expect(publishService.getStatus()).resolves.toMatchObject({
        status: 'building',
      })
    })

    releaseFirstBuild()

    await waitFor(async () => {
      expect(buildCalls).toBe(2)
    })

    releaseSecondBuild()
    await publishService.waitForIdle()

    expect(maxActiveBuilds).toBe(1)
    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/cli.mdx')).resolves.toContain('Queued CLI summary.')
    await expect(contentRoot.readContentFile('docs/v2.0/en/guides/setup.mdx')).resolves.toContain(
      'Queued setup summary.',
    )
    await expect(publishService.getStatus()).resolves.toMatchObject({
      status: 'ready',
      currentBuildId: 'build-003',
      lastSuccessfulBuildId: 'build-003',
      error: null,
    })
    expect(statusHistory).toContain('building')
    expect(statusHistory.at(-1)).toBe('ready')
    expect(statusHistory.slice(0, -1)).not.toContain('ready')
  })

  it('serializes status reads with system writes to avoid transient corruption', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-001',
          lastSuccessfulBuildId: 'build-001',
          queuedAt: null,
          updatedAt: '2026-04-08T10:00:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )
    await contentRoot.writeContentFile('system/publish-history.json', '[]\n')
    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      buildDocSource({
        title: 'CLI',
        summary: 'Queued CLI summary.',
        slug: 'guides/cli',
        section: 'Guides',
        translationKey: 'guides.cli',
        body: '# Draft CLI\n\nQueued CLI body.',
        status: 'draft',
      }),
    )

    const readGate = createDeferred<void>()
    const allowWrite = createDeferred<void>()
    const readStarted = createDeferred<void>()
    let writeStarted = false

    const publishService = createPublishService({
      projectRootPath: resolve('.'),
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
      createBuildId: () => 'build-002',
      onSystemRead: async (file) => {
        if (file === 'build-state') {
          readStarted.resolve()
          await readGate.promise
        }
      },
      writeBuildStateFile: vi.fn(async ({ absolutePath, state }) => {
        if (state.status === 'ready') {
          writeStarted = true
          await rm(absolutePath, { force: true })
          await allowWrite.promise
        }

        await writeFile(absolutePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      }),
      runPublicBuild: vi.fn(async ({ outDir }) => {
        await mkdir(outDir, { recursive: true })
        await writeFile(join(outDir, 'index.html'), '<html>build-002</html>', 'utf8')
      }),
    })

    const statusPromise = publishService.getStatus()
    await readStarted.promise

    const publishPromise = publishService.publish({
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      actor: { id: 'admin-1', name: 'Admin', role: 'admin' },
    })

    await delay(50)
    expect(writeStarted).toBe(false)

    readGate.resolve()
    await statusPromise

    allowWrite.resolve()
    await publishPromise
    await publishService.waitForIdle()

    expect(writeStarted).toBe(true)
    await expect(contentRoot.readContentFile('system/build-state.json')).resolves.toContain('"status": "ready"')
  })
})

// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createDocsApp } from '../app'
import { createTestContentRoot } from './test-content-root'

const cleanupTasks: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop()
    await cleanup?.()
  }
})

describe('createDocsApp', () => {
  it('serves draft and system data and persists drafts through the API', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'docs/v2.0/en/guides/published-cli.mdx',
      `---
title: Published CLI
summary: Published summary.
slug: guides/published-cli
section: Guides
order: 1
tags:
  - cli
translationKey: published-cli
translationStatus: current
status: published
---
# Published CLI
`,
    )

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      `---
title: CLI Draft
summary: Draft summary.
slug: guides/cli
section: Guides
order: 3
tags:
  - cli
translationKey: cli
translationStatus: current
status: draft
---
# Draft CLI
`,
    )

    await contentRoot.writeContentFile(
      'system/redirects.json',
      JSON.stringify([{ from: 'old-cli', to: 'guides/cli', locale: 'en', version: 'v2.0' }], null, 2),
    )
    await contentRoot.writeContentFile(
      'system/media.json',
      JSON.stringify([{ id: 'asset-1', title: 'CLI Diagram', url: '/media/cli.png', kind: 'image' }], null, 2),
    )
    await contentRoot.writeContentFile(
      'system/publish-history.json',
      JSON.stringify(
        [
          {
            actor: 'Admin Operator',
            actorId: 'admin-operator',
            role: 'admin',
            locale: 'en',
            version: 'v2.0',
            targetSlug: 'guides/cli',
            timestamp: '2026-04-08T10:00:00.000Z',
            result: 'published',
          },
        ],
        null,
        2,
      ),
    )

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })

    const draftsResponse = await request(app).get('/api/docs/drafts')
    expect(draftsResponse.status).toBe(200)
    expect(draftsResponse.body).toEqual({
      drafts: [
        expect.objectContaining({
          title: 'CLI Draft',
          locale: 'en',
          version: 'v2.0',
          slug: 'guides/cli',
        }),
      ],
    })

    const pagesResponse = await request(app).get('/api/docs/pages')
    expect(pagesResponse.status).toBe(200)
    expect(pagesResponse.body).toEqual({
      pages: [
        expect.objectContaining({
          title: 'Published CLI',
          locale: 'en',
          version: 'v2.0',
          slug: 'guides/published-cli',
        }),
      ],
    })

    const saveResponse = await request(app)
      .put('/api/docs/drafts/en/v2.0/guides/setup')
      .send({
        title: 'Setup Draft',
        summary: 'Create a setup guide.',
        section: 'Guides',
        order: 9,
        tags: ['setup'],
        body: '# Setup\n\nDraft body.',
        translationKey: 'setup',
        translationStatus: 'current',
      })

    expect(saveResponse.status).toBe(200)
    expect(saveResponse.body).toEqual({
      draft: expect.objectContaining({
        title: 'Setup Draft',
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/setup',
        sourcePath: 'content/drafts/v2.0/en/guides/setup.mdx',
      }),
    })

    const redirectsResponse = await request(app).get('/api/docs/system/redirects')
    expect(redirectsResponse.status).toBe(200)
    expect(redirectsResponse.body).toEqual({
      redirects: [{ from: 'old-cli', to: 'guides/cli', locale: 'en', version: 'v2.0' }],
    })

    const mediaResponse = await request(app).get('/api/docs/system/media')
    expect(mediaResponse.status).toBe(200)
    expect(mediaResponse.body).toEqual({
      media: [{ id: 'asset-1', title: 'CLI Diagram', url: '/media/cli.png', kind: 'image' }],
    })

    const publishHistoryResponse = await request(app).get('/api/docs/system/publish-history')
    expect(publishHistoryResponse.status).toBe(200)
    expect(publishHistoryResponse.body).toEqual({
      publishHistory: [
        {
          actor: 'Admin Operator',
          actorId: 'admin-operator',
          role: 'admin',
          locale: 'en',
          version: 'v2.0',
          targetSlug: 'guides/cli',
          timestamp: '2026-04-08T10:00:00.000Z',
          result: 'published',
        },
      ],
    })

    const buildStateResponse = await request(app).get('/api/docs/system/build-state')
    expect(buildStateResponse.status).toBe(200)
    expect(buildStateResponse.body).toEqual({
      buildState: {
        status: 'idle',
        currentBuildId: null,
        lastSuccessfulBuildId: null,
        queuedAt: null,
        updatedAt: null,
        error: null,
      },
    })

    await expect(contentRoot.readContentFile('drafts/v2.0/en/guides/setup.mdx')).resolves.toContain(
      'title: Setup Draft',
    )
  })

  it('rejects stale draft saves and publishes with conflict responses', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      `---
title: CLI Draft
summary: Draft summary.
slug: guides/cli
section: Guides
order: 3
tags:
  - cli
translationKey: cli
translationStatus: current
status: draft
---
# Draft CLI
`,
    )

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })
    const currentDraftResponse = await request(app).get('/api/docs/drafts/en/v2.0/guides/cli')
    const currentUpdatedAt = currentDraftResponse.body.draft.updatedAt as string

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      `---
title: CLI Draft Updated Elsewhere
summary: Updated elsewhere.
slug: guides/cli
section: Guides
order: 4
tags:
  - cli
translationKey: cli
translationStatus: current
status: draft
---
# Draft CLI Updated Elsewhere
`,
    )

    const staleSaveResponse = await request(app)
      .put('/api/docs/drafts/en/v2.0/guides/cli')
      .send({
        title: 'Stale Draft',
        summary: 'This should conflict.',
        section: 'Guides',
        order: 4,
        tags: ['cli'],
        body: '# Stale',
        translationKey: 'cli',
        translationStatus: 'current',
        expectedUpdatedAt: currentUpdatedAt,
      })

    expect(staleSaveResponse.status).toBe(409)
    expect(staleSaveResponse.body).toEqual({
      error: 'Draft has changed since it was loaded',
    })

    const stalePublishResponse = await request(app)
      .post('/api/docs/publish/en/v2.0/guides/cli')
      .send({
        actor: {
          id: 'admin-operator',
          name: 'Admin Operator',
          role: 'admin',
        },
        expectedUpdatedAt: currentUpdatedAt,
      })

    expect(stalePublishResponse.status).toBe(409)
    expect(stalePublishResponse.body).toEqual({
      error: 'Draft has changed since it was loaded',
    })
  })

  it('requires env-backed admin login before allowing docs API mutations', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/cli.mdx',
      `---
title: CLI Draft
summary: Draft summary.
slug: guides/cli
section: Guides
order: 3
tags:
  - cli
translationKey: cli
translationStatus: current
status: draft
---
# Draft CLI
`,
    )

    const app = createDocsApp({
      adminAuth: {
        username: 'admin',
        password: 'secret',
      },
      contentRootPath: contentRoot.contentPath,
    })
    const agent = request.agent(app)

    const unauthenticatedResponse = await agent.get('/api/docs/drafts')
    expect(unauthenticatedResponse.status).toBe(401)
    expect(unauthenticatedResponse.body).toEqual({
      error: 'Authentication required',
    })

    const sessionBeforeLogin = await agent.get('/api/docs/auth/session')
    expect(sessionBeforeLogin.status).toBe(200)
    expect(sessionBeforeLogin.body).toEqual({
      authEnabled: true,
      authenticated: false,
      username: null,
    })

    const badLoginResponse = await agent.post('/api/docs/auth/login').send({
      username: 'admin',
      password: 'wrong',
    })
    expect(badLoginResponse.status).toBe(401)
    expect(badLoginResponse.body).toEqual({
      error: 'Invalid username or password',
    })

    const loginResponse = await agent.post('/api/docs/auth/login').send({
      username: 'admin',
      password: 'secret',
    })
    expect(loginResponse.status).toBe(200)
    expect(loginResponse.body).toEqual({
      authEnabled: true,
      authenticated: true,
      username: 'admin',
    })

    const sessionAfterLogin = await agent.get('/api/docs/auth/session')
    expect(sessionAfterLogin.status).toBe(200)
    expect(sessionAfterLogin.body).toEqual({
      authEnabled: true,
      authenticated: true,
      username: 'admin',
    })

    const authenticatedDrafts = await agent.get('/api/docs/drafts')
    expect(authenticatedDrafts.status).toBe(200)
    expect(authenticatedDrafts.body).toEqual({
      drafts: [
        expect.objectContaining({
          title: 'CLI Draft',
          slug: 'guides/cli',
        }),
      ],
    })

    const logoutResponse = await agent.post('/api/docs/auth/logout')
    expect(logoutResponse.status).toBe(200)
    expect(logoutResponse.body).toEqual({
      authEnabled: true,
      authenticated: false,
      username: null,
    })

    const afterLogoutResponse = await agent.get('/api/docs/drafts')
    expect(afterLogoutResponse.status).toBe(401)
    expect(afterLogoutResponse.body).toEqual({
      error: 'Authentication required',
    })
  })

  it('reports publish status and serves the currently promoted public build', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'ready',
          currentBuildId: 'build-007',
          lastSuccessfulBuildId: 'build-007',
          queuedAt: null,
          updatedAt: '2026-04-08T12:30:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )

    const runtimeRootPath = join(contentRoot.rootPath, '.runtime')
    const promotedBuildPath = join(runtimeRootPath, 'public', 'builds', 'build-007')
    await mkdir(join(promotedBuildPath, 'assets'), { recursive: true })
    await writeFile(join(promotedBuildPath, 'index.html'), '<html><body>build-007 shell</body></html>', 'utf8')
    await writeFile(join(promotedBuildPath, 'assets', 'app.js'), 'console.log("build-007 asset")', 'utf8')

    const app = createDocsApp({
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath,
    })

    const statusResponse = await request(app).get('/api/docs/publish-status')
    expect(statusResponse.status).toBe(200)
    expect(statusResponse.body).toEqual({
      status: 'ready',
      currentBuildId: 'build-007',
      lastSuccessfulBuildId: 'build-007',
      queuedAt: null,
      updatedAt: '2026-04-08T12:30:00.000Z',
      error: null,
    })

    const shellResponse = await request(app).get('/')
    expect(shellResponse.status).toBe(200)
    expect(shellResponse.text).toContain('build-007 shell')

    const assetResponse = await request(app).get('/assets/app.js')
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.text).toContain('build-007 asset')
  })

  it('serves the fallback frontend shell on fresh boot when no runtime build is promoted', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'system/build-state.json',
      JSON.stringify(
        {
          status: 'idle',
          currentBuildId: null,
          lastSuccessfulBuildId: null,
          queuedAt: null,
          updatedAt: '2026-04-08T12:45:00.000Z',
          error: null,
        },
        null,
        2,
      ),
    )

    const fallbackBuildPath = join(contentRoot.rootPath, 'dist')
    await mkdir(join(fallbackBuildPath, 'assets'), { recursive: true })
    await writeFile(join(fallbackBuildPath, 'index.html'), '<html><body>fallback shell</body></html>', 'utf8')
    await writeFile(join(fallbackBuildPath, 'assets', 'app.js'), 'console.log("fallback asset")', 'utf8')

    const app = createDocsApp({
      contentRootPath: contentRoot.contentPath,
      runtimeRootPath: join(contentRoot.rootPath, '.runtime'),
    })

    const rootResponse = await request(app).get('/')
    expect(rootResponse.status).toBe(200)
    expect(rootResponse.text).toContain('fallback shell')

    const adminResponse = await request(app).get('/admin')
    expect(adminResponse.status).toBe(200)
    expect(adminResponse.text).toContain('fallback shell')

    const assetResponse = await request(app).get('/assets/app.js')
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.text).toContain('fallback asset')
  })

  it('rejects encoded traversal params and does not write outside the drafts root', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })
    const originalSiteConfig = await contentRoot.readContentFile('system/site-config.json')

    const docsTraversalResponse = await request(app)
      .put('/api/docs/drafts/en/%2e%2e%2fdocs/guides/setup')
      .send({
        title: 'Traversal Draft',
        summary: 'This should be rejected.',
        section: 'Guides',
        order: 1,
        tags: ['setup'],
        body: '# Setup\n\nBlocked.',
        translationKey: 'setup',
        translationStatus: 'current',
      })

    expect(docsTraversalResponse.status).toBe(400)
    expect(docsTraversalResponse.body).toEqual({
      error: 'Invalid request',
      issues: expect.arrayContaining(['Version must be a single safe path segment']),
    })

    const systemTraversalResponse = await request(app)
      .put('/api/docs/drafts/en/%2e%2e%2fsystem/guides/setup')
      .send({
        title: 'Traversal Draft',
        summary: 'This should be rejected.',
        section: 'Guides',
        order: 1,
        tags: ['setup'],
        body: '# Setup\n\nBlocked.',
        translationKey: 'setup',
        translationStatus: 'current',
      })

    expect(systemTraversalResponse.status).toBe(400)
    expect(systemTraversalResponse.body).toEqual({
      error: 'Invalid request',
      issues: expect.arrayContaining(['Version must be a single safe path segment']),
    })

    await expect(contentRoot.readContentFile('docs/en/guides/setup.mdx')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(contentRoot.readContentFile('system/en/guides/setup.mdx')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(contentRoot.readContentFile('system/site-config.json')).resolves.toBe(originalSiteConfig)
  })

  it('returns a sanitized 400 response for malformed JSON request bodies', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })

    const response = await request(app)
      .put('/api/docs/drafts/en/v2.0/guides/setup')
      .set('Content-Type', 'application/json')
      .send('{"title":')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'Malformed JSON body',
    })
  })

  it('returns 422 when draft content on disk cannot be parsed safely', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'drafts/v2.0/en/guides/broken.mdx',
      `---
title: Broken Draft
summary: Missing a valid slug declaration.
section: Guides
order: 1
tags:
  - broken
translationKey: broken
translationStatus: current
status: draft
---
# Broken
`,
    )

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })
    const response = await request(app).get('/api/docs/drafts')

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      error: 'Draft content is invalid',
    })
  })

  it('returns 422 when system JSON fails runtime validation', async () => {
    const contentRoot = await createTestContentRoot()
    cleanupTasks.push(contentRoot.cleanup)

    await contentRoot.writeContentFile(
      'system/redirects.json',
      JSON.stringify({ from: 'old-cli', to: 'guides/cli' }, null, 2),
    )

    const app = createDocsApp({ contentRootPath: contentRoot.contentPath })
    const response = await request(app).get('/api/docs/system/redirects')

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      error: 'System data is invalid',
    })
  })
})

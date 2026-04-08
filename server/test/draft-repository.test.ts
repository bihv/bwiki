// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

import { DraftConflictError, createDraftRepository } from '../services/draft-repository'
import { createTestContentRoot } from './test-content-root'

const cleanupTasks: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop()
    await cleanup?.()
  }
})

describe('createDraftRepository', () => {
  it('lists, reads, and saves draft documents under the drafts content root', async () => {
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

Hello from disk.
`,
    )

    const repository = createDraftRepository({ contentRootPath: contentRoot.contentPath })

    await expect(repository.listDrafts()).resolves.toEqual([
      expect.objectContaining({
        title: 'CLI Draft',
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        section: 'Guides',
        status: 'draft',
        sourcePath: 'content/drafts/v2.0/en/guides/cli.mdx',
      }),
    ])

    await expect(repository.getDraft('en', 'v2.0', 'guides/cli')).resolves.toEqual(
      expect.objectContaining({
        title: 'CLI Draft',
        summary: 'Draft summary.',
        body: '# Draft CLI\n\nHello from disk.',
        updatedAt: expect.any(String),
      }),
    )

    const savedDraft = await repository.saveDraft({
      title: 'Updated CLI Draft',
      summary: 'Updated summary.',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      section: 'Guides',
      order: 7,
      tags: ['cli', 'draft'],
      body: '# Updated CLI\n\nSaved through the repository.',
      translationKey: 'cli',
      translationStatus: 'current',
    })

    expect(savedDraft).toMatchObject({
      title: 'Updated CLI Draft',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/cli',
      section: 'Guides',
      order: 7,
      status: 'draft',
      tags: ['cli', 'draft'],
      sourcePath: 'content/drafts/v2.0/en/guides/cli.mdx',
      updatedAt: expect.any(String),
    })

    await expect(contentRoot.readContentFile('drafts/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'title: Updated CLI Draft',
    )
    await expect(contentRoot.readContentFile('drafts/v2.0/en/guides/cli.mdx')).resolves.toContain(
      'status: draft',
    )
    await expect(contentRoot.readContentFile('drafts/v2.0/en/guides/cli.mdx')).resolves.toContain(
      '# Updated CLI',
    )

    await expect(
      repository.saveDraft({
        title: 'Stale CLI Draft',
        summary: 'Stale summary.',
        locale: 'en',
        version: 'v2.0',
        slug: 'guides/cli',
        section: 'Guides',
        order: 7,
        tags: ['cli'],
        body: '# Stale',
        translationKey: 'cli',
        translationStatus: 'current',
        expectedUpdatedAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(DraftConflictError)
  })
})

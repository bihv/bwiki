import { describe, expect, it } from 'vitest'

import { mergePublishedPages, parseDocSource } from './doc-loader'

describe('parseDocSource', () => {
  it('reads frontmatter and body into the canonical DocPage shape', () => {
    const page = parseDocSource(
      'content/docs/v2.0/en/getting-started/introduction.mdx',
      `---
title: Introduction
summary: Start here.
slug: getting-started/introduction
section: Getting Started
order: 1
tags:
  - intro
translationKey: intro
translationStatus: current
status: published
---
# Introduction

<Callout tone="info">Welcome.</Callout>
`,
    )

    expect(page).toMatchObject({
      title: 'Introduction',
      locale: 'en',
      version: 'v2.0',
      slug: 'getting-started/introduction',
      section: 'Getting Started',
      order: 1,
      status: 'published',
      translationKey: 'intro',
      translationStatus: 'current',
      updatedAt: '',
      sourcePath: 'content/docs/v2.0/en/getting-started/introduction.mdx',
    })
    expect(page.body).toContain('<Callout tone="info">Welcome.</Callout>')
  })
})

describe('mergePublishedPages', () => {
  it('replaces seed docs with published overrides by locale, version, and slug', () => {
    const timestamp = '2026-04-08T13:00:00.000Z'
    const merged = mergePublishedPages(
      [
        parseDocSource(
          'content/docs/v2.0/en/getting-started/introduction.mdx',
          `---
title: Introduction
summary: Start here.
slug: getting-started/introduction
section: Getting Started
order: 1
tags: [intro]
translationKey: intro
translationStatus: current
status: published
---
# Seed
`,
        ),
      ],
      [
        {
          title: 'Introduction',
          summary: 'Updated.',
          locale: 'en',
          version: 'v2.0',
          slug: 'getting-started/introduction',
          section: 'Getting Started',
          tags: ['intro'],
          body: '# Override',
          translationKey: 'intro',
          translationStatus: 'current',
        },
      ],
      timestamp,
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.summary).toBe('Updated.')
    expect(merged[0]?.body).toBe('# Override')
    expect(merged[0]?.sourcePath).toBe('content/drafts/v2.0/en/getting-started/introduction.mdx')
    expect(merged[0]?.status).toBe('published')
    expect(merged[0]?.updatedAt).toBe(timestamp)
    expect(merged[0]?.order).toBe(1)
  })
})

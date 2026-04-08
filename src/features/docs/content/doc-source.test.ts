import { describe, expect, it } from 'vitest'

import { docFilePath, parseDocFile, serializeDocFile } from './doc-source'

describe('docFilePath', () => {
  it('builds canonical draft and published content paths', () => {
    expect(
      docFilePath({
        scope: 'published',
        version: 'v2.0',
        locale: 'en',
        slug: 'getting-started/introduction',
      }),
    ).toBe('content/docs/v2.0/en/getting-started/introduction.mdx')

    expect(
      docFilePath({
        scope: 'draft',
        version: 'v2.0',
        locale: 'en',
        slug: 'getting-started/introduction',
      }),
    ).toBe('content/drafts/v2.0/en/getting-started/introduction.mdx')
  })
})

describe('parseDocFile', () => {
  it('parses a published doc file into metadata and canonical page shape', () => {
    const result = parseDocFile(
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

    expect(result.path).toEqual({
      scope: 'published',
      version: 'v2.0',
      locale: 'en',
      slug: 'getting-started/introduction',
    })
    expect(result.page).toMatchObject({
      title: 'Introduction',
      locale: 'en',
      version: 'v2.0',
      slug: 'getting-started/introduction',
      section: 'Getting Started',
      order: 1,
      status: 'published',
      tags: ['intro'],
      translationKey: 'intro',
      translationStatus: 'current',
      updatedAt: '',
      sourcePath: 'content/docs/v2.0/en/getting-started/introduction.mdx',
    })
    expect(result.page.body).toContain('<Callout tone="info">Welcome.</Callout>')
  })

  it('parses draft paths from the expected content root even when the slug contains docs', () => {
    const result = parseDocFile(
      'content/drafts/v2.0/en/guides/docs/cli.mdx',
      `---
title: Draft CLI
summary: Draft summary.
slug: guides/docs/cli
section: Guides
order: 7
tags:
  - draft
translationKey: cli
translationStatus: current
status: draft
---
# Draft CLI
`,
    )

    expect(result.path).toEqual({
      scope: 'draft',
      version: 'v2.0',
      locale: 'en',
      slug: 'guides/docs/cli',
    })
    expect(result.page.sourcePath).toBe('content/drafts/v2.0/en/guides/docs/cli.mdx')
    expect(result.page.status).toBe('draft')
  })

  it('rejects a frontmatter slug that does not match the file path', () => {
    expect(() =>
      parseDocFile(
        'content/docs/v2.0/en/getting-started/introduction.mdx',
        `---
title: Introduction
summary: Start here.
slug: guides/cli
section: Getting Started
order: 1
tags:
  - intro
translationKey: intro
translationStatus: current
status: published
---
# Introduction
`,
      ),
    ).toThrowError(/slug/i)
  })

  it('parses quoted inline array items containing commas', () => {
    const result = parseDocFile(
      'content/docs/v2.0/en/guides/cli.mdx',
      `---
title: CLI Guide
summary: Automate content operations.
slug: guides/cli
section: Guides
order: 2
tags: ["cli, advanced", "release"]
translationKey: cli
translationStatus: current
status: published
---
# CLI Guide
`,
    )

    expect(result.page.tags).toEqual(['cli, advanced', 'release'])
  })

  it('rejects malformed frontmatter lines for defaulted fields instead of silently defaulting', () => {
    expect(() =>
      parseDocFile(
        'content/docs/v2.0/en/guides/cli.mdx',
        `---
title: CLI Guide
summary: Automate content operations.
slug: guides/cli
section: Guides
order 2
tags:
  - cli
translationKey: cli
translationStatus: current
status: published
---
# CLI Guide
`,
      ),
    ).toThrowError(/order/i)
  })
})

describe('serializeDocFile', () => {
  it('serializes a parsed doc page back to canonical frontmatter and body', () => {
    const parsed = parseDocFile(
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

    expect(serializeDocFile(parsed.page)).toBe(`---
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
`)
  })
})

import { describe, expect, it } from 'vitest'

import {
  buildDocSearch,
  buildDocTree,
  extractHeadings,
  publishDraft,
  resolveDocPage,
  validateDraft,
  type DocPage,
  type DraftDocInput,
  type PublishState,
  type SiteConfig,
} from './docs-engine'

const siteConfig: SiteConfig = {
  locales: [
    { key: 'en', label: 'English', isDefault: true },
    { key: 'vi', label: 'Tieng Viet' },
  ],
  versions: [
    { key: 'v2.0', label: '2.0', isLatest: true, isStable: true },
    { key: 'v1.0', label: '1.0', isDeprecated: true },
  ],
  componentRegistry: ['Callout', 'DocTabs', 'DocTab', 'CardGrid', 'Card', 'Figure', 'ExternalEmbed'],
  redirects: [
    {
      from: 'setup/intro',
      to: 'getting-started/introduction',
      locale: 'en',
      version: 'v1.0',
    },
  ],
}

const basePages: DocPage[] = [
  {
    id: 'intro-v2-en',
    title: 'Introduction',
    summary: 'The best place to start.',
    locale: 'en',
    version: 'v2.0',
    slug: 'getting-started/introduction',
    section: 'Getting Started',
    order: 1,
    status: 'published',
    tags: ['intro'],
    updatedAt: '2026-04-08T10:00:00.000Z',
    sourcePath: 'content/docs/v2.0/en/getting-started/introduction.mdx',
    body: '# Introduction\n\nWelcome to the docs.\n\n## Install\n\nInstall now.',
    translationKey: 'intro',
    translationStatus: 'current',
  },
  {
    id: 'guide-v2-en',
    title: 'CLI Guide',
    summary: 'Automate content operations.',
    locale: 'en',
    version: 'v2.0',
    slug: 'guides/cli',
    section: 'Guides',
    order: 2,
    status: 'published',
    tags: ['cli'],
    updatedAt: '2026-04-08T10:10:00.000Z',
    sourcePath: 'content/docs/v2.0/en/guides/cli.mdx',
    body: '# CLI Guide\n\nUse the publish cli.',
    translationKey: 'cli',
    translationStatus: 'current',
  },
  {
    id: 'intro-v2-vi',
    title: 'Gioi thieu',
    summary: 'Bat dau tai day.',
    locale: 'vi',
    version: 'v2.0',
    slug: 'getting-started/introduction',
    section: 'Bat dau',
    order: 1,
    status: 'published',
    tags: ['intro'],
    updatedAt: '2026-04-08T10:20:00.000Z',
    sourcePath: 'content/docs/v2.0/vi/getting-started/introduction.mdx',
    body: '# Gioi thieu\n\nNoi dung tieng Viet.',
    translationKey: 'intro',
    translationStatus: 'current',
  },
  {
    id: 'intro-v1-en',
    title: 'Introduction',
    summary: 'Legacy introduction.',
    locale: 'en',
    version: 'v1.0',
    slug: 'getting-started/introduction',
    section: 'Getting Started',
    order: 1,
    status: 'published',
    tags: ['intro'],
    updatedAt: '2026-04-08T10:30:00.000Z',
    sourcePath: 'content/docs/v1.0/en/getting-started/introduction.mdx',
    body: '# Introduction\n\nLegacy docs.',
    translationKey: 'intro',
    translationStatus: 'current',
  },
]

describe('resolveDocPage', () => {
  it('keeps the same slug while falling back to default locale and latest version', () => {
    const result = resolveDocPage({
      pages: basePages,
      siteConfig,
      locale: 'vi',
      version: 'v1.0',
      slug: 'guides/cli',
    })

    expect(result.page?.id).toBe('guide-v2-en')
    expect(result.resolvedLocale).toBe('en')
    expect(result.resolvedVersion).toBe('v2.0')
    expect(result.fallbackReason).toBe('locale-and-version')
  })

  it('resolves configured redirects before page lookup', () => {
    const result = resolveDocPage({
      pages: basePages,
      siteConfig,
      locale: 'en',
      version: 'v1.0',
      slug: 'setup/intro',
    })

    expect(result.redirectFrom).toBe('setup/intro')
    expect(result.page?.id).toBe('intro-v1-en')
  })
})

describe('buildDocTree', () => {
  it('groups pages into section navigation ordered by page order', () => {
    const tree = buildDocTree(basePages, 'en', 'v2.0')

    expect(tree).toHaveLength(2)
    expect(tree[0]?.title).toBe('Getting Started')
    expect(tree[0]?.children[0]?.slug).toBe('getting-started/introduction')
    expect(tree[1]?.title).toBe('Guides')
  })
})

describe('extractHeadings', () => {
  it('extracts nested headings for the page table of contents', () => {
    const headings = extractHeadings(basePages[0].body)

    expect(headings).toEqual([
      { id: 'introduction', depth: 1, title: 'Introduction' },
      { id: 'install', depth: 2, title: 'Install' },
    ])
  })
})

describe('validateDraft', () => {
  it('blocks unknown embed components and broken internal doc links', () => {
    const draft: DraftDocInput = {
      title: 'Draft',
      summary: 'Has invalid markup.',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/draft',
      section: 'Guides',
      tags: ['draft'],
      body: '# Draft\n\n<UnknownWidget />\n\n[Broken](/docs/en/v2.0/guides/missing)',
      translationKey: 'draft',
      translationStatus: 'current',
    }

    const result = validateDraft(draft, basePages, siteConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Unknown components: UnknownWidget')
    expect(result.errors).toContain('Broken internal links: /docs/en/v2.0/guides/missing')
  })
})

describe('publishDraft', () => {
  it('publishes a valid draft and records audit history', () => {
    const draft: DraftDocInput = {
      title: 'Release Notes',
      summary: 'Track product changes.',
      locale: 'en',
      version: 'v2.0',
      slug: 'guides/release-notes',
      section: 'Guides',
      tags: ['release'],
      body: '# Release Notes\n\n<Callout tone="info">Fresh build.</Callout>',
      translationKey: 'release-notes',
      translationStatus: 'current',
    }

    const state: PublishState = {
      pages: basePages,
      drafts: {},
      publishRecords: [],
    }

    const result = publishDraft({
      state,
      draft,
      actor: { id: 'editor-1', name: 'Editor One', role: 'editor' },
      siteConfig,
      timestamp: '2026-04-08T12:00:00.000Z',
    })

    expect(result.errors).toEqual([])
    expect(result.state.pages.some((page) => page.slug === 'guides/release-notes')).toBe(true)
    expect(result.state.publishRecords[0]).toMatchObject({
      actor: 'Editor One',
      role: 'editor',
      targetSlug: 'guides/release-notes',
      version: 'v2.0',
      locale: 'en',
      result: 'published',
    })
  })
})

describe('buildDocSearch', () => {
  it('returns results scoped to the active locale and version', () => {
    const search = buildDocSearch(basePages)

    const viResults = search.search('gioi', { locale: 'vi', version: 'v2.0' })
    const enResults = search.search('guide', { locale: 'en', version: 'v2.0' })

    expect(viResults.map((page) => page.id)).toEqual(['intro-v2-vi'])
    expect(enResults.map((page) => page.id)).toEqual(['guide-v2-en'])
  })
})
